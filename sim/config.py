from __future__ import annotations

import pathlib
from typing import Any, Dict, List

import yaml

from .types import Config, DemandParams, InitialState, OrderMixSegment, OrderProfile


def _load_order_profiles(raw_profiles: Dict[str, Dict[str, Any]]) -> Dict[str, OrderProfile]:
    profiles: Dict[str, OrderProfile] = {}
    for name, cfg in raw_profiles.items():
        items = {k: int(v) for k, v in cfg.items()}
        profiles[name] = OrderProfile(name=name, items=items)
    return profiles


def _load_order_mix_segments(raw_segments: List[Dict[str, Any]]) -> List[OrderMixSegment]:
    segments: List[OrderMixSegment] = []
    for seg in raw_segments:
        profile_probs = {k: float(v) for k, v in seg["profile_probs"].items()}
        segments.append(
            OrderMixSegment(
                from_turn=int(seg["from_turn"]),
                to_turn=int(seg["to_turn"]),
                profile_probs=profile_probs,
            )
        )
    return segments


def _as_config(d: Dict[str, Any]) -> Config:
    initial = d["initial"]
    demand_cfg = d["demand"]
    ingredient_weights = {k: float(v) for k, v in d["ingredient_weights"].items()}
    worker_max_carry_weight = float(d["worker_max_carry_weight"])
    num_workers = int(d.get("num_workers", 8))
    cfg = Config(
        num_turns=int(d["num_turns"]),
        lead_time=int(d["lead_time"]),
        seed=int(d["seed"]),
        initial=InitialState(
            cash=float(initial["cash"]),
            stock={k: float(v) for k, v in initial["stock"].items()},
            prices={k: float(v) for k, v in initial["prices"].items()},
        ),
        costs={k: float(v) for k, v in d["costs"].items()},
        ingredient_weights=ingredient_weights,
        worker_max_carry_weight=worker_max_carry_weight,
        num_workers=num_workers,
        recipes={p: {k: float(v) for k, v in r.items()} for p, r in d["recipes"].items()},
        demand=DemandParams(
            price_ref={k: float(v) for k, v in demand_cfg["price_ref"].items()},
            elasticity={k: float(v) for k, v in demand_cfg["elasticity"].items()},
            noise_std=float(demand_cfg["noise_std"]),
            customers_curve=[float(x) for x in demand_cfg["customers_curve"]],
            elasticity_customers=float(demand_cfg["elasticity_customers"]),
            order_profiles=_load_order_profiles(demand_cfg["order_profiles"]),
            order_mix_segments=_load_order_mix_segments(demand_cfg["order_mix_segments"]),
        ),
    )
    return cfg


def load_config(path: str | pathlib.Path) -> Config:
    p = pathlib.Path(path)
    with p.open("r", encoding="utf-8") as f:
        raw = yaml.safe_load(f)
    return _as_config(raw)


