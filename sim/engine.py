from __future__ import annotations

import json
from dataclasses import asdict
from typing import Any, Callable, Dict, List, Optional, Tuple

import numpy as np

from .demand import sample_orders_for_agent
from .types import (
    Action,
    Config,
    Delivery,
    EmployeeAssignment,
    Observation,
    PriceMap,
    ProductName,
    RecipeBook,
    State,
    TaskName,
    ToolResult,
    TurnSummary,
    WorkerCapacities,
)


TURN_MINUTES = 15  # Duración de cada turno en minutos
# Número máximo de turnos que un cliente espera en cola antes de irse
MAX_QUEUE_WAIT_TURNS = 2


def format_time(turn_idx: int) -> str:
    # 10:00 to 20:00, 15' per turn, default 40 turns
    start_minutes = 10 * 60
    minutes = start_minutes + TURN_MINUTES * turn_idx
    h = minutes // 60
    m = minutes % 60
    return f"{int(h):02d}:{int(m):02d}"


class ToolExecutor:
    def __init__(self, engine: "Simulator"):
        self.engine = engine

    def _record_tool_call(self, name: str, call_id: str, arguments: Dict[str, Any], result: ToolResult) -> None:
        """Guarda los detalles de una tool_call para el trace unificado del agente."""
        entry = {
            "type": "tool_call",
            "id": call_id,
            "name": name,
            "arguments": arguments,
            "result": dict(result),
        }
        self.engine.agent_actions_trace.append(entry)

    def get_status(self, call_id: str = "", arguments: Optional[Dict[str, Any]] = None) -> ToolResult:
        self.engine.metrics_tool_calls += 1
        s = self.engine.state
        # Exponemos al agente las entregas entrantes con hora legible (HH:MM)
        # en lugar del índice de turno interno.
        inbound_view = [
            {
                "arrival_time": format_time(d["arrival_turn"]),
                "quantities": dict(d["quantities"]),
            }
            for d in s.inbound_deliveries
        ]
        result = ToolResult(
            ok=True,
            cash=s.cash,
            stock_on_hand=dict(s.stock_on_hand),
            inbound_deliveries=inbound_view,
            worker_assignments=list(s.worker_assignments),
            workers_on_trip=dict(s.workers_on_trip),
        )
        self._record_tool_call("get_status", call_id, arguments or {}, result)
        return result

    def get_prices(self, call_id: str = "", arguments: Optional[Dict[str, Any]] = None) -> ToolResult:
        self.engine.metrics_tool_calls += 1
        result = ToolResult(ok=True, current_prices=dict(self.engine.state.prices))
        self._record_tool_call("get_prices", call_id, arguments or {}, result)
        return result

    def set_prices(self, prices: PriceMap, call_id: str = "", arguments: Optional[Dict[str, Any]] = None) -> ToolResult:
        self.engine.metrics_tool_calls += 1
        # Validación básica
        for k, v in prices.items():
            if v < 0:
                result = ToolResult(ok=False, reason=f"Precio negativo para {k}")
                self._record_tool_call("set_prices", call_id, arguments or {"prices": prices}, result)
                return result
        self.engine.state.prices.update(prices)
        result = ToolResult(ok=True)
        self._record_tool_call("set_prices", call_id, arguments or {"prices": prices}, result)
        return result

    def place_order(
        self,
        quantities: Dict[str, int],
        workers: List[int],
        call_id: str = "",
        arguments: Optional[Dict[str, Any]] = None,
    ) -> ToolResult:
        self.engine.metrics_tool_calls += 1
        # Validaciones de cantidades
        cost = 0.0
        for ing, qty in quantities.items():
            if qty < 0:
                result = ToolResult(ok=False, reason=f"Cantidad negativa para {ing}")
                self._record_tool_call("place_order", call_id, arguments or {"quantities": quantities, "workers": workers}, result)
                return result
            cost += self.engine.config.costs[ing] * qty

        # Validaciones de workers
        if not workers:
            result = ToolResult(ok=False, reason="Debe enviar al menos un trabajador a comprar")
            self._record_tool_call("place_order", call_id, arguments or {"quantities": quantities, "workers": workers}, result)
            return result

        seen_workers = set()
        for w in workers:
            if not isinstance(w, int) or w < 1 or w > self.engine.config.num_workers:
                result = ToolResult(ok=False, reason=f"ID de trabajador inválido: {w}")
                self._record_tool_call("place_order", call_id, arguments or {"quantities": quantities, "workers": workers}, result)
                return result
            if w in seen_workers:
                result = ToolResult(ok=False, reason=f"ID de trabajador duplicado: {w}")
                self._record_tool_call("place_order", call_id, arguments or {"quantities": quantities, "workers": workers}, result)
                return result
            if w in self.engine.state.workers_on_trip:
                result = ToolResult(ok=False, reason=f"El trabajador {w} ya está de viaje")
                self._record_tool_call("place_order", call_id, arguments or {"quantities": quantities, "workers": workers}, result)
                return result
            seen_workers.add(w)

        # Validación de peso total vs capacidad de carga
        total_weight = 0.0
        for ing, qty in quantities.items():
            weight = self.engine.config.ingredient_weights.get(ing, 0.0)
            total_weight += weight * float(qty)

        max_weight = len(workers) * self.engine.config.worker_max_carry_weight
        if total_weight > max_weight + 1e-9:
            result = ToolResult(
                ok=False,
                reason="La compra excede la capacidad de carga de los trabajadores seleccionados",
                accepted=False,
            )
            self._record_tool_call("place_order", call_id, arguments or {"quantities": quantities, "workers": workers}, result)
            return result

        if cost > self.engine.state.cash:
            result = ToolResult(ok=False, reason="Compra rechazada: coste > caja", accepted=False)
            self._record_tool_call("place_order", call_id, arguments or {"quantities": quantities, "workers": workers}, result)
            return result

        # Aceptada: se descuenta caja y se programa entrega
        self.engine.state.cash -= cost
        arrival_turn = self.engine.state.turn + self.engine.config.lead_time
        self.engine.state.inbound_deliveries.append(
            Delivery(arrival_turn=arrival_turn, quantities=dict(quantities))
        )
        # Los workers enviados abandonan su tarea actual
        remaining_assignments: List[EmployeeAssignment] = [
            a for a in self.engine.state.worker_assignments if int(a.get("employee_id")) not in seen_workers
        ]
        self.engine._set_worker_assignments(remaining_assignments)

        # Registrar viaje de workers
        for w in seen_workers:
            self.engine.state.workers_on_trip[w] = self.engine.config.lead_time

        result = ToolResult(
            ok=True,
            accepted=True,
            worker_assignments=self.engine.state.worker_assignments,
            workers_on_trip=dict(self.engine.state.workers_on_trip),
        )
        self._record_tool_call("place_order", call_id, arguments or {"quantities": quantities, "workers": workers}, result)
        return result

    def assign_workers(self, assignments: List[EmployeeAssignment], call_id: str = "", arguments: Optional[Dict[str, Any]] = None) -> ToolResult:
        """
        Asigna funciones a los 8 trabajadores con validaciones de cupos.
        """
        self.engine.metrics_tool_calls += 1
        seen_ids = set()
        counts: Dict[TaskName, int] = {
            "atender_clientes": 0,
            "freir_txistorra": 0,
            "preparar_pintxos": 0,
            "abrir_sidra": 0,
            "comprar": 0,
        }
        valid_tasks = set(counts.keys())

        for a in assignments:
            emp_id = a.get("employee_id")
            task = a.get("task")
            if not isinstance(emp_id, int) or emp_id < 1 or emp_id > self.engine.config.num_workers:
                result = ToolResult(ok=False, reason=f"employee_id inválido: {emp_id}")
                self._record_tool_call("assign_workers", call_id, arguments or {"assignments": assignments}, result)
                return result
            if emp_id in self.engine.state.workers_on_trip:
                result = ToolResult(ok=False, reason=f"El trabajador {emp_id} está de viaje y no puede ser asignado")
                self._record_tool_call("assign_workers", call_id, arguments or {"assignments": assignments}, result)
                return result
            if emp_id in seen_ids:
                result = ToolResult(ok=False, reason=f"employee_id duplicado: {emp_id}")
                self._record_tool_call("assign_workers", call_id, arguments or {"assignments": assignments}, result)
                return result
            seen_ids.add(emp_id)
            if task not in valid_tasks:
                result = ToolResult(ok=False, reason=f"Tarea inválida: {task}")
                self._record_tool_call("assign_workers", call_id, arguments or {"assignments": assignments}, result)
                return result
            counts[task] += 1

        # Cupos máximos (excepto "comprar")
        for task_name, limit in [
            ("atender_clientes", 3),
            ("freir_txistorra", 3),
            ("preparar_pintxos", 3),
            ("abrir_sidra", 3),
        ]:
            if counts[task_name] > limit:
                result = ToolResult(ok=False, reason=f"Máximo {limit} para {task_name}")
                self._record_tool_call("assign_workers", call_id, arguments or {"assignments": assignments}, result)
                return result

        self.engine._set_worker_assignments(assignments)
        capacities = self.engine.state.worker_capacities
        result = ToolResult(
            ok=True,
            worker_assignments=self.engine.state.worker_assignments,
        )
        self._record_tool_call("assign_workers", call_id, arguments or {"assignments": assignments}, result)
        return result

    def end_turn(self, call_id: str = "", arguments: Optional[Dict[str, Any]] = None) -> ToolResult:
        self.engine.metrics_tool_calls += 1
        self.engine._end_turn_requested = True
        result = ToolResult(ok=True)
        self._record_tool_call("end_turn", call_id, arguments or {}, result)
        return result


class Simulator:
    def __init__(self, config: Config, rng: Optional[np.random.Generator] = None):
        self.config = config
        self.rng = rng or np.random.default_rng(config.seed)
        self.state: State = self._init_state()
        # Identificador de la última respuesta de OpenAI para reusar contexto server-side
        self.previous_response_id: Optional[str] = None
        # Traza unificada de acciones del agente (razonamientos + tool_calls) en este turno
        self.agent_actions_trace: List[Dict[str, Any]] = []
        # Salidas de tool pendientes de enviar al próximo turno (para previous_response_id)
        self.pending_tool_outputs: List[Dict[str, Any]] = []
        # Métricas por episodio
        self.metrics_tool_calls = 0
        self.metrics_tokens_in = 0
        self.metrics_tokens_out = 0
        self.metrics_cost_eur = 0.0
        self._end_turn_requested = False

    @staticmethod
    def _normalize_assignments(assignments: List[EmployeeAssignment]) -> List[EmployeeAssignment]:
        """Normaliza el orden de las asignaciones por employee_id para estabilidad."""
        return sorted(assignments, key=lambda a: int(a["employee_id"]))

    @staticmethod
    def _count_tasks(assignments: List[EmployeeAssignment]) -> Dict[TaskName, int]:
        counts: Dict[TaskName, int] = {
            "atender_clientes": 0,
            "freir_txistorra": 0,
            "preparar_pintxos": 0,
            "abrir_sidra": 0,
            "comprar": 0,
        }
        for a in assignments:
            counts[a["task"]] = counts.get(a["task"], 0) + 1
        return counts

    def _compute_worker_capacities(self, assignments: List[EmployeeAssignment]) -> WorkerCapacities:
        counts = self._count_tasks(assignments)
        n_atencion = counts["atender_clientes"]
        n_txistorra = counts["freir_txistorra"]
        n_sidra = counts["abrir_sidra"]

        cap_customers_per_turn = 1.0 * n_atencion * TURN_MINUTES
        cap_txistorra_per_turn = (4.0 / 60.0) * TURN_MINUTES * n_txistorra
        cap_sidra_per_turn = 2.0 * n_sidra * TURN_MINUTES

        return WorkerCapacities(
            customers_per_turn=cap_customers_per_turn,
            txistorra_strips_per_turn=cap_txistorra_per_turn,
            sidra_bottles_per_turn=cap_sidra_per_turn,
        )

    def _set_worker_assignments(self, assignments: List[EmployeeAssignment]) -> None:
        normalized = self._normalize_assignments(assignments)
        self.state.worker_assignments = normalized
        self.state.worker_capacities = self._compute_worker_capacities(normalized)

    def _update_worker_trips(self) -> None:
        """
        Decrementa los turnos restantes de los trabajadores en viaje y los libera cuando vuelven.
        No asigna tareas automáticamente; quedan sin tarea hasta que el agente llame a assign_workers.
        """
        updated: Dict[int, int] = {}
        for emp_id, turns_left in self.state.workers_on_trip.items():
            remaining = int(turns_left) - 1
            if remaining > 0:
                updated[emp_id] = remaining
        self.state.workers_on_trip = updated

    def _init_state(self) -> State:
        initial_assignments = (
            self.config.initial.worker_assignments
            if self.config.initial.worker_assignments is not None
            else []
        )
        capacities = self._compute_worker_capacities(initial_assignments)
        return State(
            turn=0,
            cash=self.config.initial.cash,
            stock_on_hand=dict(self.config.initial.stock),
            inbound_deliveries=[],
            prices=dict(self.config.initial.prices),
            last_turn=None,
            order_queue=[],
            worker_assignments=initial_assignments,
            worker_capacities=capacities,
            workers_on_trip={},
        )

    def reset(self) -> None:
        self.state = self._init_state()
        self.previous_response_id = None
        self.agent_actions_trace = []
        self.pending_tool_outputs = []
        self.metrics_tool_calls = 0
        self.metrics_tokens_in = 0
        self.metrics_tokens_out = 0
        self.metrics_cost_eur = 0.0
        self._end_turn_requested = False
        self.state.workers_on_trip = {}

    def _build_observation(self) -> Observation:
        return Observation(
            turn=self.state.turn,
            time=format_time(self.state.turn),
            last_turn_summary=(asdict(self.state.last_turn) if self.state.last_turn else {}),
            costs=self.config.costs,
            recipes=self.config.recipes,
            lead_time=self.config.lead_time,
            # Capacidades dinámicas según las asignaciones actuales
            capacity_customers_per_turn=self.state.worker_capacities.customers_per_turn,
            capacity_txistorra_strips_per_turn=self.state.worker_capacities.txistorra_strips_per_turn,
            capacity_sidra_bottles_per_turn=self.state.worker_capacities.sidra_bottles_per_turn,
            worker_assignments=list(self.state.worker_assignments),
            workers_on_trip=dict(self.state.workers_on_trip),
        )

    def _receive_deliveries(self) -> None:
        current_turn = self.state.turn
        remaining: List[Delivery] = []
        for d in self.state.inbound_deliveries:
            if d["arrival_turn"] == current_turn:
                for ing, qty in d["quantities"].items():
                    self.state.stock_on_hand[ing] = self.state.stock_on_hand.get(ing, 0) + qty
            else:
                remaining.append(d)
        self.state.inbound_deliveries = remaining

    def _compute_revenue(self, sold: Dict[ProductName, int]) -> float:
        rev = 0.0
        for product, units in sold.items():
            rev += self.state.prices[product] * float(units)
        return rev

    def _simulate_demand_and_sales(
        self,
    ) -> Tuple[
        Dict[ProductName, int],
        Dict[ProductName, int],
        List[Dict],
        List[Dict],
        Dict[str, Any],
    ]:
        """
        Simula la llegada de nuevos pedidos, la cola y las ventas sujetas a:
        - capacidad máxima de clientes atendidos por turno
        - capacidad máxima de tiras de txistorra cocinadas por turno

        Devuelve:
            demand_products: demanda de productos de los NUEVOS clientes de este turno
            sold_products: productos vendidos (nuevos + cola)
            orders_served: lista de pedidos servidos en este turno
            stats: métricas de cola/capacidad para este turno
        """
        turn_idx = self.state.turn

        # 1) Llegan nuevos pedidos para este turno
        new_batch = sample_orders_for_agent(
            self.state.prices, self.config.demand, turn_idx, self.rng
        )
        new_orders = new_batch["orders"]
        new_customers = int(new_batch["new_customers"])
        demand_products = new_batch["demand_products"]

        # 2) Filtrar cola: clientes que han esperado >= MAX_QUEUE_WAIT_TURNS se van
        filtered_queue: List[Dict] = []
        dropped_from_queue = 0
        for order in self.state.order_queue:
            arrival_turn = order.get("arrival_turn", turn_idx)
            waited_turns = turn_idx - arrival_turn
            if waited_turns >= MAX_QUEUE_WAIT_TURNS:
                dropped_from_queue += 1
            else:
                filtered_queue.append(order)
        self.state.order_queue = filtered_queue

        # 3) Actualizamos cola: primero los que ya estaban (filtrados), luego los nuevos
        queue_start_len = len(self.state.order_queue)
        all_orders = self.state.order_queue + new_orders

        # 3) Procesar cola con límites de capacidad
        max_customers = float(self.state.worker_capacities.customers_per_turn)
        max_txistorra_strips = float(self.state.worker_capacities.txistorra_strips_per_turn)
        max_sidra_bottles = float(self.state.worker_capacities.sidra_bottles_per_turn)
        remaining_customers = max_customers
        remaining_txistorra = max_txistorra_strips
        remaining_sidra = max_sidra_bottles

        sold_products: Dict[ProductName, int] = {
            "pintxo": 0,
            "bocadillo": 0,
            "sidra": 0,
        }
        unserved_orders: List[Dict] = []
        served_customers = 0
        blocked_by_customers_capacity = 0
        blocked_by_grill_capacity = 0
        blocked_by_sidra_capacity = 0
        blocked_by_stock = False

        next_queue: List[Dict] = []
        orders_served: List[Dict] = []
        recipes = self.config.recipes

        for idx, order in enumerate(all_orders):
            if remaining_customers <= 0:
                # No se pueden atender más clientes este turno
                blocked_by_customers_capacity += len(all_orders) - idx
                for o in all_orders[idx:]:
                    unserved_orders.append({"items": dict(o.get("items", {}))})
                next_queue.extend(all_orders[idx:])
                break

            items = order["items"]
            # Calcular txistorra necesaria para este pedido
            txistorra_needed = 0.0
            sidra_needed = 0.0
            for product, qty in items.items():
                recipe = recipes.get(product, {})
                per_unit_txistorra = recipe.get("txistorra", 0.0)
                txistorra_needed += per_unit_txistorra * float(qty)
                sidra_needed += recipe.get("sidra", 0.0) * float(qty)

            if txistorra_needed > remaining_txistorra + 1e-9:
                # No hay capacidad de parrilla para ESTE pedido:
                # el cliente se queda esperando pero NO bloquea al resto de la cola.
                blocked_by_grill_capacity += 1
                next_queue.append(order)
                unserved_orders.append({"items": dict(items)})
                continue

            if sidra_needed > remaining_sidra + 1e-9:
                # No hay capacidad de abrir sidra este turno para este pedido.
                blocked_by_sidra_capacity += 1
                next_queue.append(order)
                unserved_orders.append({"items": dict(items)})
                continue

            # Comprobar stock suficiente para TODOS los productos del pedido
            can_fulfill = True
            needed_ingredients: Dict[str, float] = {}
            for product, qty in items.items():
                recipe = recipes.get(product, {})
                for ing, per_unit in recipe.items():
                    if per_unit <= 0:
                        continue
                    need = per_unit * float(qty)
                    needed_ingredients[ing] = needed_ingredients.get(ing, 0.0) + need

            for ing, total_need in needed_ingredients.items():
                available = self.state.stock_on_hand.get(ing, 0.0)
                if total_need > available + 1e-9:
                    can_fulfill = False
                    break

            if not can_fulfill:
                # No hay stock suficiente para este pedido:
                # el cliente se queda en la cola para el siguiente turno,
                # pero NO bloquea a los que vienen detrás.
                blocked_by_stock = True
                next_queue.append(order)
                continue

            # Servimos el pedido: consumimos stock y capacidad
            for ing, total_need in needed_ingredients.items():
                self.state.stock_on_hand[ing] = self.state.stock_on_hand.get(ing, 0.0) - total_need

            remaining_txistorra -= txistorra_needed
            remaining_sidra -= sidra_needed
            remaining_customers -= 1
            served_customers += 1

            # Registrar pedido servido (solo items para el resumen expuesto al agente)
            orders_served.append({"items": dict(items)})

            # Actualizar ventas por producto
            for product, qty in items.items():
                sold_products[product] = sold_products.get(product, 0) + int(qty)

        # Lo que quede en next_queue se convierte en la cola del siguiente turno
        self.state.order_queue = next_queue
        queue_end_len = len(self.state.order_queue)

        stats = {
            "new_customers": new_customers,
            "served_customers": served_customers,
            "queue_start": queue_start_len,
            "queue_end": queue_end_len,
            "blocked_by_customers_capacity": blocked_by_customers_capacity,
            "blocked_by_grill_capacity": blocked_by_grill_capacity,
            "blocked_by_sidra_capacity": blocked_by_sidra_capacity,
            "blocked_by_stock": blocked_by_stock,
            "dropped_from_queue": dropped_from_queue,
        }

        return demand_products, sold_products, orders_served, unserved_orders, stats

    def run_episode(
        self,
        agent: "AgentProtocol",
        trace_writer: Optional[Callable[[Dict], None]] = None,
    ) -> Dict:
        self.reset()
        tools = ToolExecutor(self)

        for t in range(self.config.num_turns):
            self.state.turn = t
            self._end_turn_requested = False
            self.agent_actions_trace = []  # Resetear acciones del agente del turno

            # Actualizar viajes de workers antes de decisiones
            self._update_worker_trips()

            # Entregas al comienzo del turno (antes de decisiones y demanda)
            self._receive_deliveries()

            # Snapshot del estado al inicio del turno (ya con entregas recibidas, antes de decisiones y demanda)
            state_before_snapshot = {
                "cash": self.state.cash,
                "stock": dict(self.state.stock_on_hand),
                "inbound": list(self.state.inbound_deliveries),
                "prices": dict(self.state.prices),
                "worker_assignments": list(self.state.worker_assignments),
                "worker_capacities": asdict(self.state.worker_capacities),
                "workers_on_trip": dict(self.state.workers_on_trip),
            }

            # Snapshot de métricas LLM antes del turno para poder obtener el delta
            tokens_in_before = self.metrics_tokens_in
            tokens_out_before = self.metrics_tokens_out
            cost_before = self.metrics_cost_eur

            # Fase de decisiones: el agente puede invocar múltiples tools hasta end_turn()
            obs = self._build_observation()
            tool_calls_before = self.metrics_tool_calls
            actions = agent.play_turn(obs, tools)
            tool_calls_after = self.metrics_tool_calls
            tool_calls_this_turn = tool_calls_after - tool_calls_before

            # Métricas LLM específicas de este turno (no acumuladas)
            tokens_in_turn = self.metrics_tokens_in - tokens_in_before
            tokens_out_turn = self.metrics_tokens_out - tokens_out_before
            # Redondeamos el coste del turno a 6 decimales para traza estable
            cost_turn = round(self.metrics_cost_eur - cost_before, 6)

            # Validación mínima: el último debe ser end_turn
            if not actions or actions[-1]["type"] != "end_turn":
                raise ValueError("El plan de acciones debe finalizar con 'end_turn'")

            # Fase de demanda/ventas (con colas y cuellos de botella)
            _, sold, orders_served, unserved_orders, queue_stats = self._simulate_demand_and_sales()
            revenue = self._compute_revenue(sold)
            self.state.cash += revenue

            # Enriquecemos el snapshot inicial con la longitud de la cola al inicio del turno
            state_before_snapshot["queue_start"] = queue_stats["queue_start"]

            messages: List[str] = []
            if queue_stats.get("dropped_from_queue", 0) > 0:
                dropped = queue_stats["dropped_from_queue"]
                messages.append(
                    f"{dropped} persona{'s' if dropped != 1 else ''} se han ido de la cola porque llevaban más de media hora esperando."
                )

            self.state.last_turn = TurnSummary(
                queue_start=queue_stats["queue_start"],
                new_customers=queue_stats["new_customers"],
                served_customers=queue_stats["served_customers"],
                queue_end=queue_stats["queue_end"],
                dropped_from_queue=queue_stats.get("dropped_from_queue", 0),
                orders_served=orders_served,
                unserved_orders=unserved_orders,
                blocked_by_customers_capacity=queue_stats["blocked_by_customers_capacity"] > 0,
                blocked_by_grill_capacity=queue_stats["blocked_by_grill_capacity"] > 0,
                blocked_by_sidra_capacity=queue_stats["blocked_by_sidra_capacity"] > 0,
                blocked_by_stock=bool(queue_stats.get("blocked_by_stock", False)),
                messages=messages,
                worker_assignments=list(self.state.worker_assignments),
                worker_capacities=self.state.worker_capacities,
            )

            # Traza
            if trace_writer:
                trace_writer(
                    {
                        "turn": t,
                        "time": format_time(t),
                        "state_before": state_before_snapshot,
                        "agent_actions": list(self.agent_actions_trace),
                        "tool_calls_count": tool_calls_this_turn,
                        # Lista de pedidos servidos durante este turno (ya aplicando colas/capacidades)
                        "orders_served": orders_served,
                        "sales": {
                            "revenue": revenue,
                            "by_product": {k: self.state.prices[k] * sold[k] for k in sold},
                        },
                        "state_after": {
                            "cash": self.state.cash,
                            "stock": dict(self.state.stock_on_hand),
                            "inbound": list(self.state.inbound_deliveries),
                            "prices": dict(self.state.prices),
                            "queue_end": queue_stats["queue_end"],
                            "worker_assignments": list(self.state.worker_assignments),
                            "worker_capacities": asdict(self.state.worker_capacities),
                            "workers_on_trip": dict(self.state.workers_on_trip),
                        },
                        "llm_metrics": {
                            "tokens_in": tokens_in_turn,
                            "tokens_out": tokens_out_turn,
                            "cost_eur": cost_turn,
                        },
                    }
                )

        return {
            "cash_final": self.state.cash,
            "tool_calls_total": self.metrics_tool_calls,
            "tokens_in_total": self.metrics_tokens_in,
            "tokens_out_total": self.metrics_tokens_out,
            # Coste total redondeado también a 6 decimales
            "cost_total_eur": round(self.metrics_cost_eur, 6),
        }


class AgentProtocol:
    def play_turn(self, obs: Observation, tools: ToolExecutor) -> List[Action]:  # pragma: no cover
        raise NotImplementedError
