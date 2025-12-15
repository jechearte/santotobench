from __future__ import annotations

from typing import Dict


# Tabla simplificada de precios por millón de tokens (EUR aprox., placeholder)
MODEL_PRICES_EUR_PER_MTOK = {
    "openai:gpt-5.1": {"in": 1.25, "out": 10.0},
    "openai:gpt-5.1-mini": {"in": 0.25, "out": 2.0},
    "openai:gpt-5.2": {"in": 1.75, "out": 14.0},
    # Alias usados en la CLI / trazas
    "openai:gpt-5-mini": {"in": 0.25, "out": 2.0},
    "openai:gpt-5-nano": {"in": 0.05, "out": 0.40},
    "openai:gpt-5": {"in": 1.25, "out": 10.0},
    # Anthropic
    "anthropic:claude-sonnet-4-5-20250929": {"in": 3.0, "out": 15.0},
    "anthropic:claude-opus-4-5-20251101": {"in": 5.0, "out": 25.0},
    "anthropic:claude-haiku-4-5-20251001": {"in": 1, "out": 5.0},
    # Google Gemini
    "gemini:gemini-3-pro-preview": {"in": 2, "out": 12.0},
    "gemini:gemini-2.5-flash": {"in": 0.30, "out": 2.50},
    "gemini:gemini-2.5-pro": {"in": 1.25, "out": 10.0},
    # xAI
    "xai:grok-4-1-fast-reasoning": {"in": 0.20, "out": 0.50},
    "xai:grok-4-0709": {"in": 3, "out": 15},
}


def estimate_cost_eur(model_key: str, tokens_in: int, tokens_out: int) -> float:
    prices = MODEL_PRICES_EUR_PER_MTOK.get(model_key)
    if not prices:
        return 0.0
    return (tokens_in / 1_000_000.0) * prices["in"] + (tokens_out / 1_000_000.0) * prices["out"]


