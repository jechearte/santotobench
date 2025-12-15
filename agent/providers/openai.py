from __future__ import annotations

import json
import os
import pathlib
from typing import Any, Dict, List, Tuple

import yaml
from dotenv import load_dotenv
from openai import OpenAI

from sim.engine import ToolExecutor
from sim.types import Action, Observation

# Cargar variables de entorno desde .env si existe
load_dotenv()


def _project_root() -> pathlib.Path:
    return pathlib.Path(__file__).resolve().parents[2]


def _load_system_prompt() -> str:
    p = _project_root() / "configs" / "prompts" / "system.txt"
    return p.read_text(encoding="utf-8").strip()


def _load_tools_config() -> Dict[str, Any]:
    p = _project_root() / "configs" / "tools.yml"
    return yaml.safe_load(p.read_text(encoding="utf-8"))


def _to_openai_tools(tools_cfg: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Transforma tools.yml al formato de OpenAI Responses API."""
    tools: List[Dict[str, Any]] = []
    for t in tools_cfg.get("tools", []):
        tools.append(
            {
                "type": "function",
                "name": t["name"],
                "description": t.get("description", ""),
                "parameters": t.get("parameters", {"type": "object", "properties": {}}),
            }
        )
    return tools


class OpenAIResponder:
    def __init__(self, model: str, reasoning_effort: str | None = None, temperature: float = 0.2, debug: bool = False):
        self.model = model
        self.reasoning_effort = reasoning_effort
        self.temperature = temperature
        self.debug = debug
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY no está configurada")
        self.client = OpenAI(api_key=api_key)

    def _format_observation_message(self, o: Observation) -> str:
        """Formatea una observación como mensaje de usuario.

        Solo incluye:
        - Número de personas en la cola al inicio del turno.
        - Pedidos servidos en el turno anterior (si los hay).
        - Pedidos que no se pudieron atender por falta de capacidad.
        """
        time_str = o.get("time", "")
        lts = o.get("last_turn_summary", {}) or {}
        # Aproximamos el tamaño de la cola al inicio del turno actual
        # usando la cola al final del turno anterior.
        queue_len = int(lts.get("queue_end", 0))
        dropped_from_queue = int(lts.get("dropped_from_queue", 0))
        info_messages = lts.get("messages", []) or []
        orders_served = lts.get("orders_served", []) or []
        unserved_orders = lts.get("unserved_orders", []) or []

        lines: List[str] = []

        # Hora del turno actual
        lines.append(f"Hora: {time_str}")

        # Número de personas en cola
        lines.append("")
        lines.append(f"Hay {queue_len} personas esperando para pedir en la cola del puesto.")

        # Mensajes informativos del turno anterior (incluye abandonos de la cola)
        for msg in info_messages:
            lines.append("")
            lines.append(msg)
        if not info_messages and dropped_from_queue > 0:
            lines.append("")
            lines.append(
                f"{dropped_from_queue} persona{'s' if dropped_from_queue != 1 else ''} se han ido de la cola porque llevaban más de media hora esperando."
            )

        # Pedidos servidos
        if orders_served:
            lines.append("")
            lines.append("Pedidos servidos en los últimos 15 minutos:")
            for i, order in enumerate(orders_served, 1):
                # Estructura esperada: {"items": {producto: unidades, ...}}
                items: Dict[str, Any] = {}
                if isinstance(order, dict):
                    items = order.get("items", order)
                parts = [f"{int(qty)} {prod}" for prod, qty in items.items()]
                lines.append(f"- Pedido {i}: " + ", ".join(parts))
        else:
            lines.append("")
            lines.append("En los últimos 15 minutos no se ha servido ningún pedido.")

        # Pedidos no atendidos por capacidad
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

    def decide(self, obs: Observation, tools: ToolExecutor, history: List[Observation] | None = None) -> Tuple[List[Action], int, int]:
        """
        Ejecuta un bucle de tool-calling hasta que el modelo invoque end_turn.
        Devuelve (acciones_ejecutadas, tokens_in, tokens_out).
        Mantiene el contexto vía previous_response_id almacenado en tools.engine.
        """
        actions: List[Action] = []
        tokens_in_total = 0
        tokens_out_total = 0

        system_prompt = _load_system_prompt()
        tools_def = _to_openai_tools(_load_tools_config())

        user_content = self._format_observation_message(obs)
        previous_response_id = getattr(tools.engine, "previous_response_id", None)
        pending_inputs: List[Dict[str, Any]] = []
        pending_outputs = getattr(tools.engine, "pending_tool_outputs", []) or []
        if pending_outputs:
            pending_inputs.extend(pending_outputs)
            tools.engine.pending_tool_outputs = []
        if not previous_response_id and not pending_outputs:
            pending_inputs.append({"role": "system", "content": system_prompt})
        pending_inputs.append({"role": "user", "content": user_content})

        turn_finished = False

        if self.debug:
            print(f"\n=== DEBUG: Turno {obs.get('turn', '?')} ===")
            print(f"previous_response_id usado: {previous_response_id or 'None'}")
            # Mostrar la Observation completa para depuración
            try:
                print("Observation actual:")
                print(json.dumps(obs, indent=2, ensure_ascii=False))
            except TypeError:
                # Fallback por si algún valor no es serializable por JSON
                print(f"Observation (raw): {obs}")

        while pending_inputs:
            request_kwargs: Dict[str, Any] = {
                "model": self.model,
                "input": pending_inputs,
                "tools": tools_def,
                "tool_choice": "required",
                "store": True,
            }
            if self.reasoning_effort:
                request_kwargs["reasoning"] = {"effort": self.reasoning_effort, "summary": "detailed"}
            if previous_response_id:
                request_kwargs["previous_response_id"] = previous_response_id

            response = self.client.responses.create(**request_kwargs)
            previous_response_id = getattr(response, "id", None)
            tools.engine.previous_response_id = previous_response_id

            # Acumular uso si viene
            if getattr(response, "usage", None):
                tokens_in_total += int(getattr(response.usage, "input_tokens", 0))
                tokens_out_total += int(getattr(response.usage, "output_tokens", 0))

            # Procesar los items de la respuesta EN ORDEN (un solo loop para mantener el orden correcto)
            any_function_call = False
            tool_output_messages: List[Dict[str, Any]] = []

            for item in getattr(response, "output", []) or []:
                item_type = getattr(item, "type", "")

                # Registrar razonamientos del modelo en la traza unificada
                if item_type == "reasoning":
                    rid = getattr(item, "id", "")
                    raw_summary_list = getattr(item, "summary", None) or []
                    texts: List[str] = []
                    for s in raw_summary_list:
                        text = getattr(s, "text", None)
                        if text:
                            texts.append(text)
                    if texts:
                        tools.engine.agent_actions_trace.append(
                            {
                                "type": "reasoning",
                                "id": rid,
                                "summary": texts,
                            }
                        )
                    continue

                # La Responses API usa "function_call" como tipo
                if item_type == "function_call":
                    any_function_call = True
                    name = getattr(item, "name", "")
                    call_id = getattr(item, "call_id", "")
                    args_json = getattr(item, "arguments", "{}") or "{}"
                    try:
                        args = json.loads(args_json)
                    except Exception:
                        args = {}

                    if self.debug:
                        print(f"  -> function_call: {name}({args_json[:50]}...) call_id={call_id[:20]}...")

                    # Ejecutar tool real en el simulador
                    if name == "get_status":
                        res = tools.get_status(call_id=call_id, arguments={})
                        actions.append({"type": "get_status"})
                    elif name == "get_prices":
                        res = tools.get_prices(call_id=call_id, arguments={})
                        actions.append({"type": "get_prices"})
                    elif name == "set_prices":
                        # Formato: {"prices": [{"product": "sidra", "price": 5.0}, ...]}
                        prices_list = args.get("prices") or []
                        prices = {}
                        for item in prices_list:
                            product = item.get("product")
                            price = item.get("price")
                            if product and price is not None:
                                prices[product] = float(price)
                        res = tools.set_prices(prices, call_id=call_id, arguments=args)
                        actions.append({"type": "set_prices", "prices": prices})
                    elif name == "place_order":
                        # Formato: {"items": [{"ingredient": "pan", "quantity": 50}, ...]}
                        items_list = args.get("items") or []
                        quantities = {}
                        for item in items_list:
                            ingredient = item.get("ingredient")
                            quantity = item.get("quantity")
                            if ingredient and quantity is not None:
                                quantities[ingredient] = int(float(quantity))
                        workers = [int(w) for w in (args.get("workers") or []) if w is not None]
                        res = tools.place_order(quantities, workers, call_id=call_id, arguments=args)
                        actions.append({"type": "place_order", "quantities": quantities, "workers": workers})
                    elif name == "assign_workers":
                        assignments_list = args.get("assignments") or []
                        assignments = []
                        for it in assignments_list:
                            emp_id = it.get("employee_id")
                            task = it.get("task")
                            if emp_id is not None and task is not None:
                                assignments.append({"employee_id": int(emp_id), "task": task})
                        res = tools.assign_workers(assignments, call_id=call_id, arguments=args)
                        actions.append({"type": "assign_workers", "assignments": assignments})
                    elif name == "end_turn":
                        res = tools.end_turn(call_id=call_id, arguments={})
                        actions.append({"type": "end_turn"})
                        turn_finished = True
                    else:
                        # Tool desconocida: devolver error al modelo
                        res = {"ok": False, "reason": f"Tool desconocida: {name}"}

                    # Preparar mensaje con el resultado para la siguiente petición
                    tool_output_messages.append({
                        "type": "function_call_output",
                        "call_id": call_id,
                        "output": json.dumps(res, ensure_ascii=False),
                    })

                    if self.debug:
                        print(f"  -> function_call_output añadido para {name}")

            if tool_output_messages:
                if turn_finished:
                    tools.engine.pending_tool_outputs = tool_output_messages
                    pending_inputs = []
                    break
                pending_inputs = tool_output_messages
                continue

            pending_inputs = []

            if turn_finished:
                break

            if not any_function_call:
                # No hay function calls; forzamos end_turn para avanzar
                res = tools.end_turn()
                actions.append({"type": "end_turn"})
                turn_finished = True
                break

        if self.debug:
            print(f"=== DEBUG: Fin del turno, previous_response_id={tools.engine.previous_response_id} ===\n")

        return actions, tokens_in_total, tokens_out_total
