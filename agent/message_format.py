from __future__ import annotations

from typing import Any, List

from sim.types import Observation


def format_observation_message(o: Observation) -> str:
    """
    Formatea una Observation en el mismo mensaje de usuario
    que se envía a los modelos de IA.
    """
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
            items: dict[str, Any] = {}
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
            items: dict[str, Any] = {}
            if isinstance(order, dict):
                items = order.get("items", order)
            parts = [f"{int(qty)} {prod}" for prod, qty in items.items()]
            lines.append(f"- Pedido {i}: " + ", ".join(parts))
    else:
        lines.append("")
        lines.append("No ha quedado ningún pedido sin atender por capacidad.")

    return "\n".join(lines)




