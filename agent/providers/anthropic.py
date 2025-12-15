from __future__ import annotations

import json
import os
import pathlib
from typing import Any, Dict, List, Tuple

import yaml
from dotenv import load_dotenv
from anthropic import Anthropic

from sim.engine import ToolExecutor
from sim.types import Action, Observation

load_dotenv()


def _project_root() -> pathlib.Path:
    return pathlib.Path(__file__).resolve().parents[2]


def _load_system_prompt() -> str:
    p = _project_root() / "configs" / "prompts" / "system.txt"
    return p.read_text(encoding="utf-8").strip()


def _load_tools_config() -> Dict[str, Any]:
    p = _project_root() / "configs" / "tools.yml"
    return yaml.safe_load(p.read_text(encoding="utf-8"))


def _to_anthropic_tools(tools_cfg: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Transforma tools.yml al formato de Anthropic Messages API.

    Anthropic usa 'input_schema' en lugar de 'parameters'.
    """
    tools: List[Dict[str, Any]] = []
    for t in tools_cfg.get("tools", []):
        tools.append({
            "name": t["name"],
            "description": t.get("description", ""),
            "input_schema": t.get("parameters", {"type": "object", "properties": {}}),
        })
    return tools


class AnthropicResponder:
    """
    Adaptador de la API de Anthropic (Messages API) al simulador.

    Soporta:
    - Tool calling con formato específico de Anthropic
    - Extended thinking (razonamiento) con budget_tokens configurable
    - Historial de mensajes entre turnos
    """

    def __init__(
        self,
        model: str,
        reasoning_effort: str | None = None,
        temperature: float = 0.2,
        debug: bool = False,
    ):
        self.model = model
        self.reasoning_effort = reasoning_effort
        self.temperature = temperature
        self.debug = debug

        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise RuntimeError("ANTHROPIC_API_KEY no está configurada")

        self.client = Anthropic(api_key=api_key)

        # Mapeo de reasoning_effort a budget_tokens
        self._thinking_budgets = {
            "low": 8000,
            "medium": 16000,
            "high": 32000,
        }

    def _format_observation_message(self, o: Observation) -> str:
        """Formatea una observación como mensaje de usuario."""
        time_str = o.get("time", "")
        lts = o.get("last_turn_summary", {}) or {}
        queue_len = int(lts.get("queue_end", 0))
        dropped_from_queue = int(lts.get("dropped_from_queue", 0))
        info_messages = lts.get("messages", []) or []
        orders_served = lts.get("orders_served", []) or []
        unserved_orders = lts.get("unserved_orders", []) or []

        lines: List[str] = []
        lines.append(f"Hora: {time_str}")
        lines.append("")
        lines.append(f"Hay {queue_len} personas esperando para pedir en la cola del puesto.")

        for msg in info_messages:
            lines.append("")
            lines.append(msg)
        if not info_messages and dropped_from_queue > 0:
            lines.append("")
            lines.append(
                f"{dropped_from_queue} persona{'s' if dropped_from_queue != 1 else ''} se han ido de la cola porque llevaban más de media hora esperando."
            )

        if orders_served:
            lines.append("")
            lines.append("Pedidos servidos en los últimos 15 minutos:")
            for i, order in enumerate(orders_served, 1):
                items: Dict[str, Any] = {}
                if isinstance(order, dict):
                    items = order.get("items", order)
                parts = [f"{int(qty)} {prod}" for prod, qty in items.items()]
                lines.append(f"- Pedido {i}: " + ", ".join(parts))
        else:
            lines.append("")
            lines.append("En los últimos 15 minutos no se ha servido ningún pedido.")

        if unserved_orders:
            lines.append("")
            lines.append("Pedidos que no han podido ser atendidos por capacidad:")
            for i, order in enumerate(unserved_orders, 1):
                items: Dict[str, Any] = {}
                if isinstance(order, dict):
                    items = order.get("items", order)
                parts = [f"{int(qty)} {prod}" for prod, qty in items.items()]
                lines.append(f"- Pedido {i}: " + ", ".join(parts))
        else:
            lines.append("")
            lines.append("No ha quedado ningún pedido sin atender por capacidad.")

        return "\n".join(lines)

    def _execute_tool(
        self, name: str, args: Dict[str, Any], tool_use_id: str, tools: ToolExecutor
    ) -> Tuple[Dict[str, Any], Action | None]:
        """Ejecuta una tool en el simulador y devuelve (resultado, acción)."""
        if name == "get_status":
            res = tools.get_status(call_id=tool_use_id, arguments={})
            return res, {"type": "get_status"}
        elif name == "get_prices":
            res = tools.get_prices(call_id=tool_use_id, arguments={})
            return res, {"type": "get_prices"}
        elif name == "set_prices":
            prices_list = args.get("prices") or []
            prices = {}
            for it in prices_list:
                product = it.get("product")
                price = it.get("price")
                if product and price is not None:
                    prices[product] = float(price)
            res = tools.set_prices(prices, call_id=tool_use_id, arguments=args)
            return res, {"type": "set_prices", "prices": prices}
        elif name == "place_order":
            items_list = args.get("items") or []
            quantities = {}
            for it in items_list:
                ingredient = it.get("ingredient")
                quantity = it.get("quantity")
                if ingredient and quantity is not None:
                    quantities[ingredient] = int(float(quantity))
            workers = [int(w) for w in (args.get("workers") or []) if w is not None]
            res = tools.place_order(quantities, workers, call_id=tool_use_id, arguments=args)
            return res, {"type": "place_order", "quantities": quantities, "workers": workers}
        elif name == "assign_workers":
            assignments_list = args.get("assignments") or []
            assignments = []
            for it in assignments_list:
                emp_id = it.get("employee_id")
                task = it.get("task")
                if emp_id is not None and task is not None:
                    assignments.append({"employee_id": int(emp_id), "task": task})
            res = tools.assign_workers(assignments, call_id=tool_use_id, arguments=args)
            return res, {"type": "assign_workers", "assignments": assignments}
        elif name == "end_turn":
            res = tools.end_turn(call_id=tool_use_id, arguments={})
            return res, {"type": "end_turn"}
        else:
            return {"ok": False, "reason": f"Tool desconocida: {name}"}, None

    def decide(
        self,
        obs: Observation,
        tools: ToolExecutor,
        history: List[Observation] | None = None,
    ) -> Tuple[List[Action], int, int]:
        """
        Ejecuta un bucle de tool-calling hasta que el modelo invoque end_turn.

        Devuelve (acciones_ejecutadas, tokens_in, tokens_out).
        Mantiene el historial de mensajes en tools.engine.anthropic_messages.
        """
        actions: List[Action] = []
        tokens_in_total = 0
        tokens_out_total = 0

        system_prompt = _load_system_prompt()
        tools_def = _to_anthropic_tools(_load_tools_config())
        user_content = self._format_observation_message(obs)

        # Obtener historial de mensajes previos
        messages: List[Dict[str, Any]] = getattr(tools.engine, "anthropic_messages", [])
        if messages is None:
            messages = []

        # Añadir el nuevo mensaje de usuario
        messages.append({"role": "user", "content": user_content})

        if self.debug:
            print(f"\n=== DEBUG Anthropic: Turno {obs.get('turn', '?')} ===")
            print(f"Mensajes en historial: {len(messages)}")
            try:
                print("Observation actual:")
                print(json.dumps(obs, indent=2, ensure_ascii=False))
            except TypeError:
                print(f"Observation (raw): {obs}")

        turn_finished = False

        while not turn_finished:
            # Construir request
            request_kwargs: Dict[str, Any] = {
                "model": self.model,
                "max_tokens": 20000,
                "system": system_prompt,
                "messages": messages,
                "tools": tools_def,
                "tool_choice": {"type": "auto", "disable_parallel_tool_use": False },
            }

            # Añadir thinking si está configurado
            if self.reasoning_effort:
                budget = self._thinking_budgets.get(self.reasoning_effort, 16000)
                request_kwargs["thinking"] = {
                    "type": "enabled",
                    "budget_tokens": budget,
                }

            # Usar el endpoint beta con interleaved-thinking
            response = self.client.beta.messages.create(
                betas=["interleaved-thinking-2025-05-14"],
                **request_kwargs
            )

            # Acumular tokens
            if hasattr(response, "usage"):
                tokens_in_total += int(getattr(response.usage, "input_tokens", 0))
                tokens_out_total += int(getattr(response.usage, "output_tokens", 0))

            # Procesar el contenido de la respuesta
            assistant_content: List[Dict[str, Any]] = []
            tool_uses: List[Dict[str, Any]] = []

            for block in response.content:
                block_type = getattr(block, "type", "")

                if block_type == "text":
                    text = getattr(block, "text", "")
                    assistant_content.append({"type": "text", "text": text})
                    if self.debug:
                        print(f"  -> texto: {text[:100]}...")

                elif block_type == "thinking":
                    thinking_text = getattr(block, "thinking", "")
                    thinking_signature = getattr(block, "signature", "")
                    # Incluir en el historial para que Anthropic pueda validar
                    assistant_content.append({
                        "type": "thinking",
                        "thinking": thinking_text,
                        "signature": thinking_signature,
                    })
                    # Registrar en la traza de razonamiento (sin guardar el signature/id, sin truncar)
                    tools.engine.agent_actions_trace.append({
                        "type": "reasoning",
                        "summary": [thinking_text],
                    })
                    if self.debug:
                        print(f"  -> thinking: {thinking_text[:100]}...")

                elif block_type == "tool_use":
                    tool_name = getattr(block, "name", "")
                    tool_input = getattr(block, "input", {})
                    tool_id = getattr(block, "id", "")

                    assistant_content.append({
                        "type": "tool_use",
                        "id": tool_id,
                        "name": tool_name,
                        "input": tool_input,
                    })
                    tool_uses.append({
                        "id": tool_id,
                        "name": tool_name,
                        "input": tool_input,
                    })

                    if self.debug:
                        print(f"  -> tool_use: {tool_name}({json.dumps(tool_input)[:50]}...) id={tool_id[:20]}...")

            # Añadir respuesta del asistente al historial
            if assistant_content:
                messages.append({"role": "assistant", "content": assistant_content})

            # Si no hay tool_uses, forzamos end_turn
            if not tool_uses:
                if self.debug:
                    print("  -> Sin tool_use, forzando end_turn")
                tools.end_turn()
                actions.append({"type": "end_turn"})
                turn_finished = True
                break

            # Ejecutar tools y preparar resultados
            tool_results: List[Dict[str, Any]] = []
            for tu in tool_uses:
                res, action = self._execute_tool(tu["name"], tu["input"], tu["id"], tools)

                if action:
                    actions.append(action)

                if tu["name"] == "end_turn":
                    turn_finished = True

                # Formato de tool_result para Anthropic
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tu["id"],
                    "content": json.dumps(res, ensure_ascii=False),
                })

                if self.debug:
                    print(f"  -> tool ejecutada: {tu['name']}")

            # Añadir resultados de tools como mensaje de usuario (siempre, incluso si el turno terminó)
            messages.append({"role": "user", "content": tool_results})

            if turn_finished:
                break

        # Guardar historial para el siguiente turno
        tools.engine.anthropic_messages = messages

        if self.debug:
            print(f"=== DEBUG Anthropic: Fin del turno ===\n")

        return actions, tokens_in_total, tokens_out_total

