from __future__ import annotations

import math
from typing import Dict

import numpy as np

from .types import DemandParams, Order, PriceMap, ProductName


def _find_order_mix_segment(params: DemandParams, turn_idx: int) -> Dict[str, float]:
    """
    Devuelve el diccionario de probabilidades de perfil de pedido para el
    segmento horario que contiene el turno dado. Si ninguno encaja, usa
    el último segmento.
    """
    for seg in params.order_mix_segments:
        if seg.from_turn <= turn_idx <= seg.to_turn:
            return seg.profile_probs
    # Fallback razonable: último segmento definido
    if params.order_mix_segments:
        return params.order_mix_segments[-1].profile_probs
    # Si no hay segmentos, suponer reparto uniforme entre perfiles definidos
    if params.order_profiles:
        n = len(params.order_profiles)
        return {name: 1.0 / float(n) for name in params.order_profiles.keys()}
    # Sin perfiles: no hay pedidos
    return {}


def _sample_profile(profile_probs: Dict[str, float], rng: np.random.Generator) -> str:
    """
    Muestrea un perfil de pedido según las probabilidades dadas.
    """
    names = list(profile_probs.keys())
    probs = np.array([float(profile_probs[n]) for n in names], dtype=float)
    total = probs.sum()
    if total <= 0:
        probs = np.ones_like(probs) / len(probs)
    else:
        probs = probs / total
    idx = int(rng.choice(len(names), p=probs))
    return names[idx]


def _compute_expected_ticket(
    prices: PriceMap,
    params: DemandParams,
    turn_idx: int,
) -> float:
    """
    Estima el precio medio de ticket de un cliente en este turno,
    usando la mezcla de productos configurada.
    """
    # Para el ticket medio, usamos los perfiles ponderados por su probabilidad
    profile_probs = _find_order_mix_segment(params, turn_idx)
    expected = 0.0
    if not profile_probs:
        # Fallback: media simple de precios de productos
        for p in ["pintxo", "bocadillo", "sidra"]:
            expected += float(prices[p]) / 3.0
        return expected

    for profile_name, prob in profile_probs.items():
        profile = params.order_profiles[profile_name]
        ticket_profile = 0.0
        for product, qty in profile.items.items():
            ticket_profile += float(qty) * float(prices[product])
        expected += float(prob) * ticket_profile
    return expected


def sample_customers_for_agent(
    prices: PriceMap,
    params: DemandParams,
    turn_idx: int,
    rng: np.random.Generator,
) -> int:
    """
    Calcula cuántos clientes de mercado eligen el puesto del agente en este turno.

    1) `customers_curve[t]` define el número esperado de clientes de mercado (4 puestos).
    2) Se calcula un precio medio de ticket para el agente y para un competidor
       (usando `price_ref`).
    3) Se aplica una elasticidad competitiva a nivel de clientes para obtener
       la cuota del agente frente a 3 competidores simétricos.
    """
    # 1) Clientes de mercado esperados para este turno
    market_customers = float(params.customers_curve[turn_idx])

    # 2) Precio medio de ticket del agente y del competidor
    ticket_agent = _compute_expected_ticket(prices, params, turn_idx)
    # Para los competidores usamos price_ref como sus precios fijos
    ticket_comp = _compute_expected_ticket(params.price_ref, params, turn_idx)

    epsilon_c = float(params.elasticity_customers)

    ticket_agent = max(ticket_agent, 1e-6)
    ticket_comp = max(ticket_comp, 1e-6)

    # 3) Atractividad del agente vs 3 competidores
    a_agent = math.pow(ticket_agent / ticket_comp, -epsilon_c)
    a_comp = 1.0
    total_attr = a_agent + 3.0 * a_comp
    if total_attr <= 1e-12:
        share_agent = 0.0
    else:
        share_agent = a_agent / total_attr

    expected_customers_agent = market_customers * share_agent

    # Ruido multiplicativo (si se quiere reutilizar noise_std a nivel de clientes)
    if params.noise_std > 0:
        noise = float(rng.lognormal(mean=0.0, sigma=params.noise_std))
    else:
        noise = 1.0

    q = max(0.0, expected_customers_agent * noise)
    return int(round(q))


def sample_orders_for_agent(
    prices: PriceMap,
    params: DemandParams,
    turn_idx: int,
    rng: np.random.Generator,
) -> Dict[str, any]:
    """
    Genera los pedidos (cola nueva) que llegan al puesto del agente en este turno.

    Devuelve:
        {
            "orders": List[Order],
            "new_customers": int,
            "demand_products": Dict[ProductName, int]  # demanda de productos de los NUEVOS clientes
        }
    """
    new_customers = sample_customers_for_agent(prices, params, turn_idx, rng)
    profile_probs = _find_order_mix_segment(params, turn_idx)

    orders: list[Order] = []
    # Inicializamos demanda agregada a cero para todos los productos
    demand_products: Dict[ProductName, int] = {"pintxo": 0, "bocadillo": 0, "sidra": 0}

    for _ in range(new_customers):
        if not profile_probs:
            break
        profile_name = _sample_profile(profile_probs, rng)
        profile = params.order_profiles[profile_name]
        items: Dict[ProductName, int] = dict(profile.items)
        orders.append({"items": items, "arrival_turn": turn_idx})
        for product, qty in items.items():
            demand_products[product] = demand_products.get(product, 0) + int(qty)

    return {
        "orders": orders,
        "new_customers": new_customers,
        "demand_products": demand_products,
    }


