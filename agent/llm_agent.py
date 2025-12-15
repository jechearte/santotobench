from __future__ import annotations

from typing import List, Optional, Type

from sim.engine import AgentProtocol, ToolExecutor
from sim.types import Action, Observation
from .providers.openai import OpenAIResponder
from .providers.xai import XAIResponder
from .providers.anthropic import AnthropicResponder
from .providers.gemini import GeminiResponder
from .costs import estimate_cost_eur


# Registro de proveedores soportados.
# La clave es el nombre del proveedor (tal y como se pasa en la CLI/experiments.yml)
# y el valor es la clase "Responder" que expone un método:
#   decide(obs: Observation, tools: ToolExecutor) -> tuple[list[Action], int, int]
PROVIDERS: dict[str, Type] = {
    "openai": OpenAIResponder,
    "xai": XAIResponder,
    "anthropic": AnthropicResponder,
    "gemini": GeminiResponder,
}


class LLMAgent(AgentProtocol):
    """
    Contenedor para un agente LLM con tool calling.
    El contexto se conserva usando previous_response_id almacenado en el engine.
    """

    def __init__(self, provider: str, model: str, reasoning_effort: Optional[str] = None, debug: bool = False):
        self.provider = provider
        self.model = model
        self.reasoning_effort = reasoning_effort
        self.debug = debug

    def _build_responder(self) -> Optional[object]:
        """
        Construye el responder adecuado según el proveedor configurado.

        Devuelve None si el proveedor no está soportado todavía.
        """
        ResponderCls = PROVIDERS.get(self.provider)
        if ResponderCls is None:
            return None
        return ResponderCls(
            model=self.model,
            reasoning_effort=self.reasoning_effort,
            debug=self.debug,
        )

    def play_turn(self, obs: Observation, tools: ToolExecutor) -> List[Action]:
        responder = self._build_responder()

        if responder is not None:
            # El historial se gestiona en tools.engine.message_history (cuando aplique)
            actions, tokens_in, tokens_out = responder.decide(obs, tools)

            # Instrumentación básica de tokens/coste (acumulada en el engine)
            tools.engine.metrics_tokens_in += tokens_in
            tools.engine.metrics_tokens_out += tokens_out

            # Clave genérica proveedor:modelo, alineada con agent/costs.py
            model_key = f"{self.provider}:{self.model}"
            tools.engine.metrics_cost_eur += estimate_cost_eur(model_key, tokens_in, tokens_out)
            return actions

        # Fallback simple si no hay proveedor reconocido
        actions: List[Action] = []
        tools.get_status()
        actions.append({"type": "get_status"})
        tools.get_prices()
        actions.append({"type": "get_prices"})
        actions.append({"type": "end_turn"})
        tools.end_turn()
        return actions
