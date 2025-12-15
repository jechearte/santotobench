from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Literal, Optional, TypedDict


IngredientName = Literal["txistorra", "pan", "sidra"]
ProductName = Literal["pintxo", "bocadillo", "sidra"]
TaskName = Literal[
    "atender_clientes",
    "freir_txistorra",
    "preparar_pintxos",
    "abrir_sidra",
    "comprar",
]


StockMap = Dict[IngredientName, float]
IngredientWeightMap = Dict[IngredientName, float]
PriceMap = Dict[ProductName, float]
CostMap = Dict[IngredientName, float]
Recipe = Dict[IngredientName, float]
RecipeBook = Dict[ProductName, Recipe]


class Delivery(TypedDict):
    arrival_turn: int
    quantities: StockMap


class Order(TypedDict):
    """
    Pedido de un cliente en cola.

    - `items`: mapa producto -> unidades pedidas (normalmente 1 por producto).
    - `arrival_turn`: turno en el que el cliente llegó al puesto (para estadísticas internas).
    """

    items: Dict[ProductName, int]
    arrival_turn: int


@dataclass
class OrderProfile:
    """
    Perfil de pedido multi-producto.

    `items` define cuántas unidades de cada producto incluye el pedido.
    """

    name: str
    items: Dict[ProductName, int]


@dataclass
class OrderMixSegment:
    """
    Segmento horario de mezcla de pedidos.

    from_turn / to_turn son inclusivos y usan el índice de turno discreto.
    profile_probs define la probabilidad de que un cliente tenga cada perfil
    de pedido (que puede incluir varios productos).
    """

    from_turn: int
    to_turn: int
    profile_probs: Dict[str, float]


@dataclass
class InitialState:
    cash: float
    stock: StockMap
    prices: PriceMap
    # Asignaciones iniciales de trabajadores (vacío = sin asignar)
    worker_assignments: Optional[List["EmployeeAssignment"]] = None


@dataclass
class DemandParams:
    price_ref: Dict[ProductName, float]
    elasticity: Dict[ProductName, float]
    noise_std: float
    # Número de clientes de mercado (todos los puestos) por turno
    customers_curve: List[float]
    # Elasticidad competitiva a nivel de clientes (en torno al precio medio del ticket)
    elasticity_customers: float
    # Perfiles de pedido multi-producto
    order_profiles: Dict[str, OrderProfile]
    # Mezcla de perfiles por tramo horario
    order_mix_segments: List[OrderMixSegment]


@dataclass
class WorkerCapacities:
    """
    Capacidades derivadas de las asignaciones de trabajadores (por turno).
    """

    customers_per_turn: float = 0.0
    txistorra_strips_per_turn: float = 0.0
    sidra_bottles_per_turn: float = 0.0


@dataclass
class Config:
    num_turns: int
    lead_time: int
    seed: int
    initial: InitialState
    costs: CostMap
    ingredient_weights: IngredientWeightMap
    worker_max_carry_weight: float
    recipes: RecipeBook
    demand: DemandParams
    num_workers: int = 8


@dataclass
class TurnSummary:
    """
    Resumen del último turno expuesto al agente a través de Observation.

    No incluye ya demanda/ventas agregadas; se centra en colas y servicio.
    """

    queue_start: int = 0
    new_customers: int = 0
    served_customers: int = 0
    queue_end: int = 0
    # Clientes que abandonaron la cola por esperar demasiado
    dropped_from_queue: int = 0
    # Lista de pedidos servidos en el turno. Cada pedido incluye los productos.
    orders_served: List[Order] = field(default_factory=list)
    # Pedidos que no pudieron atenderse por falta de capacidad (cola/parrilla/sidra)
    unserved_orders: List[Order] = field(default_factory=list)
    # Flags de bloqueo por capacidad o stock durante el turno
    blocked_by_customers_capacity: bool = False
    blocked_by_grill_capacity: bool = False
    blocked_by_sidra_capacity: bool = False
    blocked_by_stock: bool = False
    # Mensajes informativos que se envían al agente
    messages: List[str] = field(default_factory=list)
    # Asignaciones usadas en este turno (opcional para trazabilidad)
    worker_assignments: List["EmployeeAssignment"] = field(default_factory=list)
    worker_capacities: WorkerCapacities = field(default_factory=WorkerCapacities)


@dataclass
class State:
    turn: int
    cash: float
    stock_on_hand: StockMap
    inbound_deliveries: List[Delivery]
    prices: PriceMap
    last_turn: Optional[TurnSummary] = None
    # Cola de pedidos pendientes de servir
    order_queue: List[Order] = field(default_factory=list)
    # Asignaciones actuales de los 8 empleados (puede estar vacío al inicio)
    worker_assignments: List["EmployeeAssignment"] = field(default_factory=list)
    worker_capacities: WorkerCapacities = field(default_factory=WorkerCapacities)
    # Trabajadores que están de viaje comprando: employee_id -> turnos restantes
    workers_on_trip: Dict[int, int] = field(default_factory=dict)


class Observation(TypedDict):
    turn: int
    time: str
    last_turn_summary: Dict
    costs: CostMap
    recipes: RecipeBook
    lead_time: int
    # Capacidades de servicio por turno (dinámicas según asignaciones)
    capacity_customers_per_turn: float
    capacity_txistorra_strips_per_turn: float
    capacity_sidra_bottles_per_turn: float
    worker_assignments: List["EmployeeAssignment"]
    workers_on_trip: Dict[int, int]


class InboundDeliveryView(TypedDict):
    """
    Representación de una entrega entrante tal y como se expone al agente
    a través de las tools. Usa la hora de llegada en formato HH:MM en vez
    del índice de turno interno.
    """

    arrival_time: str
    quantities: StockMap


class ToolResult(TypedDict, total=False):
    ok: bool
    reason: str
    cash: float
    stock_on_hand: StockMap
    inbound_deliveries: List[InboundDeliveryView]
    current_prices: PriceMap
    accepted: bool
    worker_assignments: List["EmployeeAssignment"]
    worker_capacities: WorkerCapacities
    workers_on_trip: Dict[int, int]


class Action(TypedDict, total=False):
    type: Literal[
        "get_status",
        "get_prices",
        "set_prices",
        "place_order",
        "assign_workers",
        "end_turn",
    ]
    prices: PriceMap
    quantities: StockMap
    assignments: List["EmployeeAssignment"]
    workers: List[int]


class EmployeeAssignment(TypedDict):
    employee_id: int
    task: TaskName


