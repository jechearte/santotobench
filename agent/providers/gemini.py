from __future__ import annotations

import json
import os
import pathlib
import time
from typing import Any, Dict, List, Tuple

import copy
import yaml
from dotenv import load_dotenv
from google import genai
from google.genai import types
from google.genai import errors as genai_errors

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


def _clean_schema_for_gemini(schema: Any) -> Any:
    """
    Limpia un schema JSON para cumplir con la API de Gemini Function Calling.
    
    Gemini solo admite un subconjunto de JSON Schema. Los campos soportados son:
    - type, properties, required, description, items, enum
    
    Campos NO soportados que se eliminan:
    - additionalProperties / additional_properties
    - minimum / maximum (restricciones numéricas)
    - minItems / maxItems (restricciones de arrays)
    - minLength / maxLength (restricciones de strings)
    - pattern (regex)
    - format
    """
    # Campos de JSON Schema que Gemini NO soporta
    UNSUPPORTED_KEYS = {
        "additionalProperties",
        "additional_properties",
        "minimum",
        "maximum",
        "minItems",
        "maxItems",
        "minLength",
        "maxLength",
        "pattern",
        "format",
        "exclusiveMinimum",
        "exclusiveMaximum",
        "default",
    }
    
    if isinstance(schema, dict):
        cleaned: Dict[str, Any] = {}
        for k, v in schema.items():
            if k in UNSUPPORTED_KEYS:
                continue
            cleaned[k] = _clean_schema_for_gemini(v)
        return cleaned
    if isinstance(schema, list):
        return [_clean_schema_for_gemini(it) for it in schema]
    return schema


def _to_gemini_tools(tools_cfg: Dict[str, Any]) -> List[types.Tool]:
    """
    Transforma tools.yml al formato de Gemini Function Calling.

    - Convierte cada tool en FunctionDeclaration
    - Limpia campos de JSON Schema no soportados por Gemini
    """
    function_declarations = []
    for t in tools_cfg.get("tools", []):
        params = t.get("parameters", {"type": "object", "properties": {}})
        params = _clean_schema_for_gemini(copy.deepcopy(params))
        function_declarations.append(
            types.FunctionDeclaration(
                name=t["name"],
                description=t.get("description", ""),
                parameters=params,
            )
        )
    return [types.Tool(function_declarations=function_declarations)]


class GeminiResponder:
    """
    Adaptador de la API de Google Gemini al simulador.

    Soporta:
    - Tool calling con formato específico de Gemini
    - Thinking (razonamiento):
      - Gemini 3 (gemini-3-pro-preview): usa thinking_level (LOW/HIGH)
      - Otros modelos: usa thinking_budget (4096/8192/16384 tokens)
    - Historial de mensajes entre turnos con thought signatures
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

        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY no está configurada")

        self.client = genai.Client(api_key=api_key)

        # Mapeo de reasoning_effort a thinking_level de Gemini 3
        # Gemini 3 solo soporta LOW y HIGH (no existe MEDIUM)
        self._thinking_levels = {
            "low": "LOW",
            "medium": "HIGH",  # Fallback: medium → high
            "high": "HIGH",
        }

        # Mapeo de reasoning_effort a thinking_budget para otros modelos (Gemini 2.x, etc.)
        self._thinking_budgets = {
            "low": 8000,
            "medium": 16000,
            "high": 24000,
        }

        # Modelos que usan thinking_level en lugar de thinking_budget
        self._models_with_thinking_level = {"gemini-3-pro-preview"}

    def _format_observation_message(self, o: Observation) -> str:
        """Formatea una observación como mensaje de usuario."""
        time_str = o.get("time", "")
        lts = o.get("last_turn_summary", {}) or {}
        queue_len = int(lts.get("queue_end") or 0)
        dropped_from_queue = int(lts.get("dropped_from_queue") or 0)
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
        self, name: str, args: Dict[str, Any], tools: ToolExecutor
    ) -> Tuple[Dict[str, Any], Action | None]:
        """Ejecuta una tool en el simulador y devuelve (resultado, acción)."""
        # Generamos un call_id simple para compatibilidad con el engine
        call_id = f"gemini_{name}_{id(args)}"

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
        Mantiene el historial de mensajes en tools.engine.gemini_messages,
        incluyendo las thought signatures para validación.
        """
        actions: List[Action] = []
        tokens_in_total = 0
        tokens_out_total = 0

        system_prompt = _load_system_prompt()
        tools_def = _to_gemini_tools(_load_tools_config())
        user_content = self._format_observation_message(obs)

        # Obtener historial de mensajes previos
        messages: List[types.Content] = getattr(tools.engine, "gemini_messages", [])
        if messages is None:
            messages = []

        # Construir configuración de thinking si está habilitado
        thinking_config = None
        if self.reasoning_effort:
            # Gemini 3 usa thinking_level (LOW/HIGH)
            # Otros modelos usan thinking_budget (número de tokens)
            if self.model in self._models_with_thinking_level:
                level = self._thinking_levels.get(self.reasoning_effort, "HIGH")
                thinking_config = types.ThinkingConfig(
                    thinking_level=level,
                    include_thoughts=True,
                )
            else:
                budget = self._thinking_budgets.get(self.reasoning_effort, 8192)
                thinking_config = types.ThinkingConfig(
                    thinking_budget=budget,
                    include_thoughts=True,
                )

        # Configuración de generación
        generate_config = types.GenerateContentConfig(
            temperature=self.temperature,
            thinking_config=thinking_config,
            tools=tools_def,
            tool_config=types.ToolConfig(
                function_calling_config=types.FunctionCallingConfig(mode="AUTO")
            ),
            system_instruction=system_prompt
        )

        # Añadir el nuevo mensaje de usuario
        messages.append(
            types.Content(
                role="user",
                parts=[types.Part.from_text(text=user_content)],
            )
        )

        if self.debug:
            print(f"\n=== DEBUG Gemini: Turno {obs.get('turn', '?')} ===")
            print(f"Mensajes en historial: {len(messages)}")
            try:
                print("Observation actual:")
                print(json.dumps(obs, indent=2, ensure_ascii=False))
            except TypeError:
                print(f"Observation (raw): {obs}")

        turn_finished = False

        max_retries = 3
        retry_count = 0

        while not turn_finished:
            # Construir request
            # System instruction solo se envía una vez y Gemini lo mantiene
            request_kwargs: Dict[str, Any] = {
                "model": self.model,
                "contents": messages,
                "config": generate_config,
            }

            try:
                response = self.client.models.generate_content(**request_kwargs)
            except genai_errors.ClientError as exc:
                # ClientError incluye 429 RESOURCE_EXHAUSTED
                status_code = getattr(exc, "code", None) or getattr(exc, "status_code", 429)
                print(f"\n⚠️  Gemini error {status_code}: {exc}")
                if status_code == 429 and retry_count < max_retries:
                    retry_count += 1
                    print(f"    Reintentando en 65s ({retry_count}/{max_retries})...")
                    time.sleep(65)
                    continue
                print(f"    No se reintentará. Propagando error.")
                raise

            # Acumular tokens (usar "or 0" porque los valores pueden ser None)
            if hasattr(response, "usage_metadata") and response.usage_metadata:
                usage = response.usage_metadata
                prompt_tokens = int(getattr(usage, "prompt_token_count", 0) or 0)
                total_tokens = int(getattr(usage, "total_token_count", 0) or 0)
                # Para Gemini contamos output_tokens como total - prompt (candidates puede venir None o incompleto)
                tokens_in_total += prompt_tokens
                tokens_out_total += max(total_tokens - prompt_tokens, 0)
                retry_count = 0

            # Procesar el contenido de la respuesta
            if not response.candidates or not response.candidates[0].content:
                # Obtener finish_reason para decidir si reintentar
                finish_reason = None
                if response.candidates:
                    candidate = response.candidates[0]
                    finish_reason = getattr(candidate, 'finish_reason', None)
                
                # MALFORMED_FUNCTION_CALL es un error transitorio de Gemini, reintentar
                finish_reason_str = str(finish_reason) if finish_reason else ""
                if "MALFORMED_FUNCTION_CALL" in finish_reason_str and retry_count < max_retries:
                    retry_count += 1
                    print(f"\n⚠️  Gemini generó MALFORMED_FUNCTION_CALL, reintentando ({retry_count}/{max_retries})...")
                    time.sleep(1)  # Pequeña pausa antes de reintentar
                    continue
                
                # Sin respuesta válida - mostrar info y detener evaluación
                print("\n=== ERROR: Gemini no devolvió respuesta válida ===")
                print(f"  response.candidates: {response.candidates}")
                if response.candidates:
                    candidate = response.candidates[0]
                    print(f"  candidate.content: {getattr(candidate, 'content', 'N/A')}")
                    print(f"  candidate.finish_reason: {finish_reason}")
                    print(f"  candidate.safety_ratings: {getattr(candidate, 'safety_ratings', 'N/A')}")
                    print(f"  candidate.citation_metadata: {getattr(candidate, 'citation_metadata', 'N/A')}")
                    # Intentar mostrar partes raw si existen
                    if hasattr(candidate, 'content') and candidate.content:
                        print(f"  candidate.content.parts: {getattr(candidate.content, 'parts', 'N/A')}")
                print(f"  response.prompt_feedback: {getattr(response, 'prompt_feedback', 'N/A')}")
                print(f"  response.usage_metadata: {getattr(response, 'usage_metadata', 'N/A')}")
                print("=== FIN ERROR ===\n")
                raise RuntimeError(f"Gemini no devolvió respuesta válida. finish_reason: {finish_reason}")
            
            # Reset retry count on success
            retry_count = 0

            candidate_content = response.candidates[0].content
            assistant_parts: List[types.Part] = []
            function_calls: List[Dict[str, Any]] = []

            for part in candidate_content.parts:
                # Es un pensamiento (thought)
                if hasattr(part, "thought") and part.thought:
                    thought_text = getattr(part, "text", "") or ""
                    # Guardar en traza de razonamiento (sin truncar)
                    tools.engine.agent_actions_trace.append({
                        "type": "reasoning",
                        "summary": [thought_text],
                    })
                    # IMPORTANTE: Incluir en historial para mantener thought signature
                    assistant_parts.append(part)
                    if self.debug:
                        print(f"  -> thought: {thought_text[:100]}...")

                # Es una llamada a función
                elif hasattr(part, "function_call") and part.function_call:
                    fc = part.function_call
                    fc_name = getattr(fc, "name", "") or ""
                    fc_args = dict(fc.args) if hasattr(fc, "args") and fc.args else {}
                    function_calls.append({
                        "name": fc_name,
                        "args": fc_args,
                    })
                    assistant_parts.append(part)
                    if self.debug:
                        print(f"  -> function_call: {fc_name}({json.dumps(fc_args)[:50]}...)")

                # Es texto normal
                elif hasattr(part, "text") and part.text:
                    assistant_parts.append(part)
                    if self.debug:
                        print(f"  -> texto: {part.text[:100]}...")

            # Añadir respuesta del asistente al historial
            if assistant_parts:
                messages.append(types.Content(role="model", parts=assistant_parts))

            # Si no hay function_calls, forzamos end_turn
            if not function_calls:
                if self.debug:
                    print("  -> Sin function_call, forzando end_turn")
                tools.end_turn()
                actions.append({"type": "end_turn"})
                turn_finished = True
                break

            # Ejecutar tools y preparar resultados
            function_response_parts: List[types.Part] = []
            for fc in function_calls:
                res, action = self._execute_tool(fc["name"], fc["args"], tools)

                if action:
                    actions.append(action)

                if fc["name"] == "end_turn":
                    turn_finished = True

                # Crear FunctionResponse para Gemini
                function_response_parts.append(
                    types.Part.from_function_response(
                        name=fc["name"],
                        response=res,
                    )
                )

                if self.debug:
                    print(f"  -> tool ejecutada: {fc['name']}")

            # Añadir resultados de functions como mensaje de usuario
            if function_response_parts:
                messages.append(types.Content(role="user", parts=function_response_parts))

            if turn_finished:
                break

        # Guardar historial para el siguiente turno
        tools.engine.gemini_messages = messages

        if self.debug:
            print(f"=== DEBUG Gemini: Fin del turno ===\n")

        return actions, tokens_in_total, tokens_out_total

