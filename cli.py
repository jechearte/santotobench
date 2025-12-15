from __future__ import annotations

import json
import pathlib
import time
from typing import Optional

import typer
import numpy as np

from sim.config import load_config
from sim.engine import Simulator
from agent.heuristic import HeuristicAgent
from agent.llm_agent import LLMAgent
from agent.human_agent import HumanAgent
from runner.experiment import run_experiments


app = typer.Typer(help="Simulador del puesto de txistorra - CLI")


def _print_system_instructions() -> None:
    """
    Muestra por pantalla las mismas instrucciones que se le dan al LLM
    en configs/prompts/system.txt, para que el humano juegue en las
    mismas condiciones.
    """
    system_path = pathlib.Path("configs") / "prompts" / "system.txt"
    if not system_path.exists():
        typer.echo("⚠️ No se ha encontrado configs/prompts/system.txt")
        return

    text = system_path.read_text(encoding="utf-8")
    typer.echo("\n" + "=" * 80)
    typer.echo("INSTRUCCIONES DEL JUEGO (las mismas que para el LLM):\n")
    typer.echo(text)
    typer.echo("=" * 80 + "\n")


@app.command()
def play(
    config: str = typer.Option("configs/config.yml", help="Ruta al archivo de configuración YAML"),
    seed: int = typer.Option(None, help="Semilla RNG (override)"),
    agent: str = typer.Option("heuristic", help="Agente: heuristic | human | provider/model"),
    reasoning_effort: Optional[str] = typer.Option(None, help="low|medium|high (si aplica)"),
    save_trace: bool = typer.Option(True, help="Guardar traza JSONL en runs/"),
    debug: bool = typer.Option(False, help="Mostrar debug del historial de mensajes"),
):
    cfg = load_config(config)
    if seed is not None:
        cfg.seed = int(seed)
    sim = Simulator(cfg, np.random.default_rng(cfg.seed))

    if agent == "heuristic":
        the_agent = HeuristicAgent()
        model_name = "heuristic"
        provider_name = "heuristic"
    elif agent == "human":
        # El humano juega usando las mismas tools que el LLM.
        the_agent = HumanAgent()
        model_name = "human"
        provider_name = "human"
        _print_system_instructions()
    else:
        if "/" not in agent:
            raise typer.BadParameter("Formato de agente inválido. Use provider/model o 'heuristic' o 'human'.")
        provider_name, model_name = agent.split("/", 1)
        the_agent = LLMAgent(provider=provider_name, model=model_name, reasoning_effort=reasoning_effort, debug=debug)

    runs_dir = pathlib.Path("runs")
    runs_dir.mkdir(exist_ok=True)
    run_id = time.strftime("%Y%m%d-%H%M%S")
    # Nombre de traza: {model_name}_{date}.jsonl (sanitizado)
    safe_model = "".join(c if c.isalnum() or c in ("-", "_", ".") else "_" for c in model_name)
    trace_path = runs_dir / f"{safe_model}_{run_id}.jsonl"

    wrote_header = False

    def writer(d: dict) -> None:
        nonlocal wrote_header
        if save_trace:
            with trace_path.open("a", encoding="utf-8") as f:
                if not wrote_header:
                    header = {
                        "type": "meta",
                        "model": model_name,
                        # Nombre abreviado (por defecto = nombre completo).
                        # Se puede editar a mano en la primera línea del .jsonl.
                        "model_short": model_name,
                        "provider": provider_name,
                        "reasoning_effort": reasoning_effort,
                        "date": run_id,
                    }
                    f.write(json.dumps(header, ensure_ascii=False) + "\n")
                    wrote_header = True
                f.write(json.dumps(d, ensure_ascii=False) + "\n")

    metrics = sim.run_episode(the_agent, trace_writer=writer if save_trace else None)
    typer.echo(json.dumps(metrics, indent=2, ensure_ascii=False))
    if save_trace:
        typer.echo(f"Traza guardada en: {trace_path}")


@app.command("run-experiments")
def run_exps(
    experiments: str = typer.Option("configs/experiments.yml", help="Ruta a experiments.yml"),
):
    out = run_experiments(experiments)
    typer.echo(f"Resultados en: {out}")


if __name__ == "__main__":
    app()
