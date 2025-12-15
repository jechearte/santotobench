from __future__ import annotations

from typing import Dict, List

from sim.engine import AgentProtocol, ToolExecutor
from sim.types import Action, Observation


class HeuristicAgent(AgentProtocol):
    """
    Agente baseline heurístico:
    - Consulta estado y precios al inicio del turno.
    - Si el stock efectivo de ingredientes claves < umbral, realiza pedidos ajustados al presupuesto.
    - Mantiene precios base (o aplica un leve ajuste).
    - Siempre finaliza con end_turn.
    """

    def __init__(self, safety_cash_buffer: float = 50.0):
        self.safety_cash_buffer = safety_cash_buffer

    def play_turn(self, obs: Observation, tools: ToolExecutor) -> List[Action]:
        actions: List[Action] = []

        # Consultar estado y precios
        tools.get_status()
        actions.append({"type": "get_status"})
        tools.get_prices()
        actions.append({"type": "get_prices"})

        # Heurística simple:
        # - Intentar mantener: txistorra >= 150, pan >= 80, sidra >= 40
        status = tools.get_status()
        actions.append({"type": "get_status"})
        prices = tools.get_prices()
        actions.append({"type": "get_prices"})

        cash = status["cash"]
        stock = status["stock_on_hand"]

        target = {"txistorra": 150, "pan": 80, "sidra": 40}
        to_buy: Dict[str, int] = {}
        for ing, tgt in target.items():
            cur = stock.get(ing, 0)
            if cur < tgt:
                to_buy[ing] = max(0, tgt - cur)

        # Lista de workers disponibles (no de viaje)
        workers_on_trip = status.get("workers_on_trip", {}) or {}
        available_workers = [w for w in range(1, 9) if w not in workers_on_trip]

        # Ajustar según presupuesto (rechazo si coste > caja)
        # Estrategia: ordenar por importancia y fraccionar si excede caja.
        importance = ["txistorra", "pan", "sidra"]
        for ing in importance:
            qty = to_buy.get(ing, 0)
            if qty <= 0:
                continue
            # Intentar desde qty hacia abajo hasta que quepa en caja - buffer
            q = qty
            placed = False
            while q > 0:
                if not available_workers:
                    break
                selected_workers = [available_workers[0]]
                res = tools.place_order({ing: q}, selected_workers)
                actions.append({"type": "place_order", "quantities": {ing: q}, "workers": selected_workers})
                if res.get("ok") and res.get("accepted"):
                    placed = True
                    # actualizar cash local
                    cash -= q * obs["costs"][ing]
                    # Marcar worker como de viaje localmente
                    available_workers = available_workers[1:]
                    break
                q = q // 2  # reducir a la mitad y reintentar
            if not placed:
                # no fue posible
                pass

        # Pequeño ajuste de precios: mantener los actuales (no cambiar)
        actions.append({"type": "end_turn"})
        tools.end_turn()
        return actions


