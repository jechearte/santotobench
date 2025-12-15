from __future__ import annotations

import json
import os
import pathlib
from typing import Any, Dict, List, Tuple

import yaml
from dotenv import load_dotenv
from xai_sdk import Client as XAIClient
from xai_sdk.chat import system, user, tool, tool_result

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


def _to_xai_tools(tools_cfg: Dict[str, Any]) -> List:
    """
    Transforma tools.yml al formato de xAI SDK usando la función tool().
    """
    tools_list = []
    for t in tools_cfg.get("tools", []):
        tools_list.append(
            tool(
                name=t["name"],
                description=t.get("description", ""),
                parameters=t.get("parameters", {"type": "object", "properties": {}}),
            )
        )
    return tools_list


class XAIResponder:
    """
    Adaptador del SDK de xAI al simulador.

    Mantiene el contexto entre turnos usando previous_response_id y store_messages=True
    para que el servidor de xAI guarde el historial de la conversación.
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

        api_key = os.getenv("XAI_API_KEY")
        if not api_key:
            raise RuntimeError("XAI_API_KEY no está configurada")

        self.client = XAIClient(api_key=api_key, timeout=3600)

    def _format_observation_message(self, o: Observation) -> str:
        """
        Formatea una observación como mensaje de usuario.

        Misma lógica que en OpenAIResponder para que el comportamiento sea
        comparable entre proveedores.
        Incluye pedidos no atendidos por falta de capacidad.
        """
        time_str = o.get("time", "")
        lts = o.get("last_turn_summary", {}) or {}
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

    def _execute_tool(
        self, name: str, args: Dict[str, Any], call_id: str, tools: ToolExecutor
    ) -> Tuple[Dict[str, Any], Action | None]:
        """
        Ejecuta una tool en el simulador y devuelve (resultado, acción).
        """
        if name == "get_status":
            res = tools.get_status(call_id=call_id, arguments={})
            return res, {"type": "get_status"}
        elif name == "get_prices":
            res = tools.get_prices(call_id=call_id, arguments={})
            return res, {"type": "get_prices"}
        elif name == "set_prices":
            prices_list = args.get("prices") or []
            prices = {}
            for it in prices_list:
                product = it.get("product")
                price = it.get("price")
                if product and price is not None:
                    prices[product] = float(price)
            res = tools.set_prices(prices, call_id=call_id, arguments=args)
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
            res = tools.place_order(quantities, workers, call_id=call_id, arguments=args)
            return res, {"type": "place_order", "quantities": quantities, "workers": workers}
        elif name == "assign_workers":
            assignments_list = args.get("assignments") or []
            assignments = []
            for it in assignments_list:
                emp_id = it.get("employee_id")
                task = it.get("task")
                if emp_id is not None and task is not None:
                    assignments.append({"employee_id": int(emp_id), "task": task})
            res = tools.assign_workers(assignments, call_id=call_id, arguments=args)
            return res, {"type": "assign_workers", "assignments": assignments}
        elif name == "end_turn":
            res = tools.end_turn(call_id=call_id, arguments={})
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
        Mantiene el contexto via previous_response_id almacenado en tools.engine.
        El servidor de xAI guarda el historial gracias a store_messages=True.
        """
        actions: List[Action] = []
        tokens_in_total = 0
        tokens_out_total = 0

        system_prompt = _load_system_prompt()
        tools_def = _to_xai_tools(_load_tools_config())
        user_content = self._format_observation_message(obs)

        # Obtener previous_response_id si existe (para continuar conversación)
        previous_response_id = getattr(tools.engine, "previous_response_id", None)

        # Crear el chat (nuevo cada vez, pero con previous_response_id para continuar)
        create_kwargs: Dict[str, Any] = {
            "model": self.model,
            "store_messages": True,  # El servidor guarda el historial
            "tools": tools_def,
        }
        if self.reasoning_effort:
            create_kwargs["reasoning_effort"] = self.reasoning_effort
        if previous_response_id:
            create_kwargs["previous_response_id"] = previous_response_id

        chat = self.client.chat.create(**create_kwargs)

        # Solo añadir system prompt en el primer turno (sin previous_response_id)
        if not previous_response_id:
            chat.append(system(system_prompt))

        if self.debug:
            print(f"\n=== DEBUG xAI: Turno {obs.get('turn', '?')} ===")
            print(f"previous_response_id: {previous_response_id or 'None'}")
            try:
                print("Observation actual:")
                print(json.dumps(obs, indent=2, ensure_ascii=False))
            except TypeError:
                print(f"Observation (raw): {obs}")

        # Añadir el mensaje de usuario del turno actual
        chat.append(user(user_content))

        turn_finished = False

        while not turn_finished:
            # Obtener respuesta del modelo
            response = chat.sample()

            # Guardar el response.id para continuar la conversación
            response_id = getattr(response, "id", None)
            if response_id:
                tools.engine.previous_response_id = response_id

            # Acumular tokens si están disponibles
            usage = getattr(response, "usage", None)
            if usage is not None:
                # xAI expone, entre otros:
                #   - prompt_tokens
                #   - completion_tokens
                #   - reasoning_tokens
                #
                # Para los "output_tokens" del simulador queremos:
                #   completion_tokens + reasoning_tokens
                tokens_in_total += int(getattr(usage, "prompt_tokens", 0))
                completion = int(getattr(usage, "completion_tokens", 0))
                reasoning = int(getattr(usage, "reasoning_tokens", 0))
                tokens_out_total += completion + reasoning

            # Procesar tool_calls si las hay
            tool_calls = getattr(response, "tool_calls", None) or []

            if not tool_calls:
                # Sin tool calls, forzamos end_turn para avanzar
                if self.debug:
                    print("  -> Sin tool_calls, forzando end_turn")
                tools.end_turn()
                actions.append({"type": "end_turn"})
                turn_finished = True
                break

            # Ejecutar todas las tools y recolectar los resultados
            tool_results: List[Dict[str, Any]] = []
            for tc in tool_calls:
                # En el SDK de xAI, cada ToolCall tiene un campo .function con name y arguments.
                function_obj = getattr(tc, "function", None)

                if function_obj is not None:
                    name = getattr(function_obj, "name", "") or ""
                    args_json = getattr(function_obj, "arguments", "{}") or "{}"
                elif isinstance(tc, dict):
                    # Fallback defensivo por si en algún momento la SDK devolviera dicts
                    func = tc.get("function", {}) or {}
                    name = func.get("name") or tc.get("name", "") or ""
                    args_json = func.get("arguments") or tc.get("arguments", "{}") or "{}"
                else:
                    name = ""
                    args_json = "{}"

                call_id = getattr(tc, "id", "") if hasattr(tc, "id") else tc.get("id", "") if isinstance(tc, dict) else ""

                try:
                    args = json.loads(args_json) if isinstance(args_json, str) else args_json
                except Exception:
                    args = {}

                if self.debug:
                    args_str = json.dumps(args, ensure_ascii=False) if args else "{}"
                    printable_name = name or "<sin_nombre>"
                    print(f"  -> xAI tool_call: {printable_name}({args_str[:50]}...) id={str(call_id)[:20]}...")
                    if not name:
                        # Ayuda a depurar si en algún momento cambia la estructura de ToolCall
                        try:
                            print(f"     (estructura ToolCall sin nombre: {tc})")
                        except Exception:
                            pass

                # Ejecutar la tool
                res, action = self._execute_tool(name, args, call_id, tools)

                if action:
                    actions.append(action)

                if name == "end_turn":
                    turn_finished = True

                # Guardar el resultado para añadirlo al nuevo chat
                tool_results.append(
                    {
                        "type": "function_call_output",
                        "call_id": call_id,
                        "output": json.dumps(res, ensure_ascii=False),
                    }
                )

                if self.debug:
                    printable_name = name or "<sin_nombre>"
                    print(f"  -> xAI tool ejecutada: {printable_name}")

            if turn_finished:
                break

            # Crear nuevo chat con previous_response_id para enviar los resultados
            chat = self.client.chat.create(
                model=self.model,
                store_messages=True,
                tools=tools_def,
                previous_response_id=tools.engine.previous_response_id,
            )

            # Añadir los resultados de las tools al nuevo chat
            for result in tool_results:
                # La función tool_result de xAI solo admite el contenido textual del resultado.
                chat.append(tool_result(result["output"]))
                if self.debug:
                    call_id = result.get("call_id", "") or ""
                    print(f"  -> xAI tool result añadido: {str(call_id)[:20]}...")

        if self.debug:
            print(f"=== DEBUG xAI: Fin del turno, response_id={tools.engine.previous_response_id} ===\n")

        return actions, tokens_in_total, tokens_out_total
