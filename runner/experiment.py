from __future__ import annotations

import csv
import json
import pathlib
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List

import numpy as np
import yaml

from sim.config import load_config
from sim.engine import Simulator
from agent.heuristic import HeuristicAgent
from agent.llm_agent import LLMAgent


def _now_id() -> str:
    return time.strftime("%Y%m%d-%H%M%S")


def _ensure_dir(p: pathlib.Path) -> None:
    p.mkdir(parents=True, exist_ok=True)


def _trace_writer(path: pathlib.Path, meta: Dict[str, Any] | None = None):
    f = path.open("w", encoding="utf-8")

    # Escribimos una primera línea con metadatos del experimento si se proporciona
    if meta is not None:
        f.write(json.dumps(meta, ensure_ascii=False) + "\n")
        f.flush()

    def write(d: Dict[str, Any]) -> None:
        f.write(json.dumps(d, ensure_ascii=False) + "\n")
        f.flush()

    return write


def run_single(config_path: str, agent_spec: Dict[str, Any], seed: int, out_dir: pathlib.Path) -> Dict:
    cfg = load_config(config_path)
    cfg.seed = int(seed)
    sim = Simulator(cfg, np.random.default_rng(cfg.seed))

    if agent_spec.get("type", "heuristic") == "heuristic":
        agent = HeuristicAgent()
        model_name = "heuristic"
        provider_name = "heuristic"
        reasoning = None
    else:
        provider_name = agent_spec["provider"]
        model_name = agent_spec["model"]
        reasoning = agent_spec.get("reasoning_effort")
        agent = LLMAgent(provider=provider_name, model=model_name, reasoning_effort=reasoning)

    run_id = f"{_now_id()}-{uuid.uuid4().hex[:6]}"
    _ensure_dir(out_dir)

    # Guardar config efectiva
    (out_dir / f"{run_id}_config.json").write_text(
        json.dumps(cfg, default=lambda o: o.__dict__, indent=2), encoding="utf-8"
    )

    # Nombre de traza: {model_name}_{date}.jsonl (sanitizado)
    safe_model = "".join(c if c.isalnum() or c in ("-", "_", ".") else "_" for c in model_name)
    trace_path = out_dir / f"{safe_model}_{run_id}.jsonl"

    # Metadatos del experimento para la primera línea del .jsonl
    trace_meta: Dict[str, Any] = {
        "type": "meta",
        "model": model_name,
        # Nombre abreviado (por defecto = nombre completo).
        # Se puede editar a mano en la primera línea del .jsonl.
        "model_short": model_name,
        "provider": provider_name,
        "reasoning_effort": reasoning,
        "date": run_id,
        "seed": seed,
    }

    metrics = sim.run_episode(agent, trace_writer=_trace_writer(trace_path, meta=trace_meta))
    (out_dir / f"{run_id}_metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")

    return {
        "run_id": f"{run_id}-{seed}",
        "cash_final": metrics["cash_final"],
        "tool_calls": metrics["tool_calls_total"],
        "tokens_in": metrics["tokens_in_total"],
        "tokens_out": metrics["tokens_out_total"],
        "cost_total": metrics["cost_total_eur"],
    }


def run_experiments(experiments_path: str, out_root: str = "runs") -> pathlib.Path:
    spec = yaml.safe_load(pathlib.Path(experiments_path).read_text(encoding="utf-8"))
    out_dir = pathlib.Path(out_root) / _now_id()
    _ensure_dir(out_dir)
    (out_dir / "experiments.yaml").write_text(pathlib.Path(experiments_path).read_text(encoding="utf-8"), encoding="utf-8")

    summary_rows: List[Dict[str, Any]] = []
    for exp in spec.get("experiments", []):
        config_path = exp["config_path"]
        seeds = exp.get("seeds", [42])
        replicas = int(exp.get("replicas", 1))
        models = exp.get("models", [{"type": "heuristic"}])
        max_workers = int(exp.get("max_workers", 0)) or None

        tasks = []
        for model in models:
            for seed in seeds:
                for r in range(replicas):
                    tasks.append((model, seed, r))

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_map = {
                executor.submit(run_single, config_path, model, seed, out_dir): (model, seed, r) for model, seed, r in tasks
            }

            for fut in as_completed(future_map):
                model, seed, _ = future_map[fut]
                try:
                    res = fut.result()
                except Exception as exc:  # pragma: no cover
                    summary_rows.append(
                        {
                            "run_id": "error",
                            "model": f"{model.get('provider', 'heuristic')}/{model.get('model', 'heuristic')}",
                            "reasoning": model.get("reasoning_effort", ""),
                            "seed": seed,
                            "cash_final": "error",
                            "tool_calls": "error",
                            "tokens_in": "error",
                            "tokens_out": "error",
                            "cost_total": f"error: {exc}",
                        }
                    )
                    continue

                summary_rows.append(
                    {
                        "run_id": res["run_id"],
                        "model": f"{model.get('provider', 'heuristic')}/{model.get('model', 'heuristic')}",
                        "reasoning": model.get("reasoning_effort", ""),
                        "seed": seed,
                        "cash_final": res["cash_final"],
                        "tool_calls": res["tool_calls"],
                        "tokens_in": res["tokens_in"],
                        "tokens_out": res["tokens_out"],
                        "cost_total": res["cost_total"],
                    }
                )

    # Guardar summary.csv
    csv_path = out_dir / "summary.csv"
    if summary_rows:
        with csv_path.open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(
                f,
                fieldnames=[
                    "run_id",
                    "model",
                    "reasoning",
                    "seed",
                    "cash_final",
                    "tool_calls",
                    "tokens_in",
                    "tokens_out",
                    "cost_total",
                ],
            )
            writer.writeheader()
            writer.writerows(summary_rows)
    return out_dir


