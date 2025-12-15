from __future__ import annotations

from typing import List
import pathlib

from sim.engine import AgentProtocol, ToolExecutor
from sim.types import Action, Observation
from .message_format import format_observation_message


def _print_system_instructions() -> None:
    """
    Muestra por pantalla las instrucciones completas del juego
    (las mismas que se usan como system prompt para los modelos).
    """
    system_path = pathlib.Path("configs") / "prompts" / "system.txt"
    if not system_path.exists():
        print("⚠️ No se ha encontrado configs/prompts/system.txt")
        return

    text = system_path.read_text(encoding="utf-8")
    print("\n" + "=" * 80)
    print("INSTRUCCIONES DEL JUEGO:\n")
    print(text)
    print("=" * 80 + "\n")


class HumanAgent(AgentProtocol):
    """
    Agente que permite a un humano jugar al simulador vía CLI.

    El humano solo puede interactuar usando las mismas tools disponibles
    para los modelos (get_status, get_prices, set_prices, assign_workers,
    place_order, end_turn).
    """

    def play_turn(self, obs: Observation, tools: ToolExecutor) -> List[Action]:
        actions: List[Action] = []

        print("\n" + "=" * 80)
        print(f"Turno {obs['turn']} - Hora {obs['time']}")
        print("=" * 80)

        # Mostrar EXACTAMENTE el mismo mensaje que se envía al modelo de IA
        # a partir de la Observation.
        print()
        print(format_observation_message(obs))

        print("\nComandos disponibles (tools):")
        print("  status          -> get_status")
        print("  prices          -> get_prices")
        print("  set_prices      -> set_prices")
        print("  assign_workers  -> assign_workers")
        print("  order           -> place_order")
        print("  end             -> end_turn")
        print("  help            -> volver a mostrar esta lista")
        print("  instructions    -> ver las instrucciones completas del juego")

        while True:
            cmd = input(
                "\n¿Qué quieres hacer? [status/prices/set_prices/assign_workers/order/end/help]: "
            ).strip()

            if cmd in ("help", "?"):
                print(
                    "\nComandos disponibles: status, prices, set_prices, assign_workers, "
                    "order, end, instructions"
                )
                continue

            if cmd in ("instructions", "instrucciones"):
                _print_system_instructions()
                continue

            if cmd == "status":
                res = tools.get_status(call_id="human_get_status", arguments={})
                actions.append({"type": "get_status"})
                print("\nEstado actual:")
                print(f"  Caja: {res['cash']:.2f} €")
                print(f"  Stock: {res['stock_on_hand']}")
                print(f"  Entregas programadas: {res['inbound_deliveries']}")
                print(f"  Trabajadores de viaje: {res['workers_on_trip']}")
                print(f"  Asignaciones actuales: {res['worker_assignments']}")
                continue

            if cmd == "prices":
                res = tools.get_prices(call_id="human_get_prices", arguments={})
                actions.append({"type": "get_prices"})
                print("\nPrecios actuales:")
                for prod, price in res["current_prices"].items():
                    print(f"  {prod}: {price:.2f} €")
                continue

            if cmd == "set_prices":
                print("\nIntroduce los nuevos precios (deja vacío para no cambiar):")
                try:
                    pintxo = input("  Precio pintxo: ").strip()
                    bocadillo = input("  Precio bocadillo: ").strip()
                    sidra = input("  Precio sidra: ").strip()
                    prices = {}
                    if pintxo:
                        prices["pintxo"] = float(pintxo)
                    if bocadillo:
                        prices["bocadillo"] = float(bocadillo)
                    if sidra:
                        prices["sidra"] = float(sidra)

                    res = tools.set_prices(
                        prices,
                        call_id="human_set_prices",
                        arguments={"prices": prices},
                    )
                    actions.append({"type": "set_prices", "prices": prices})
                    print("Resultado:", res)
                except ValueError:
                    print("❌ Entrada inválida, intenta de nuevo.")
                continue

            if cmd == "assign_workers":
                print(
                    "\nVas a asignar tareas a los 8 trabajadores.\n"
                    "Tareas válidas: atender_clientes, freir_txistorra, preparar_pintxos, abrir_sidra, comprar"
                )
                assignments = []
                for emp_id in range(1, 9):
                    task = input(
                        f"  Trabajador {emp_id} (atender_clientes/freir_txistorra/preparar_pintxos/abrir_sidra/comprar, vacío = sin cambio): "
                    ).strip()
                    if not task:
                        continue
                    assignments.append({"employee_id": emp_id, "task": task})
                if not assignments:
                    print("No se han introducido asignaciones.")
                    continue
                res = tools.assign_workers(
                    assignments,
                    call_id="human_assign_workers",
                    arguments={"assignments": assignments},
                )
                actions.append({"type": "assign_workers", "assignments": assignments})
                print("Resultado:", res)
                continue

            if cmd == "order":
                print("\nNueva compra de ingredientes.")
                quantities = {}
                try:
                    tx = input("  Cantidad de tiras de txistorra (entero, vacío = 0): ").strip()
                    pan = input("  Cantidad de barras de pan (entero, vacío = 0): ").strip()
                    sidra = input("  Cantidad de botellas de sidra (entero, vacío = 0): ").strip()
                    if tx:
                        quantities["txistorra"] = int(tx)
                    if pan:
                        quantities["pan"] = int(pan)
                    if sidra:
                        quantities["sidra"] = int(sidra)

                    workers_raw = input(
                        "  IDs de trabajadores para ir a comprar (ej: 5 6, vacío = ninguno): "
                    ).strip()
                    workers = [int(w) for w in workers_raw.split()] if workers_raw else []

                    args = {
                        "items": [
                            {"ingredient": k, "quantity": v} for k, v in quantities.items()
                        ],
                        "workers": workers,
                    }
                    res = tools.place_order(
                        quantities,
                        workers,
                        call_id="human_place_order",
                        arguments=args,
                    )
                    actions.append(
                        {
                            "type": "place_order",
                            "quantities": quantities,
                            "workers": workers,
                        }
                    )
                    print("Resultado:", res)
                except ValueError:
                    print("❌ Entrada inválida, intenta de nuevo.")
                continue

            if cmd == "end":
                res = tools.end_turn(call_id="human_end_turn", arguments={})
                actions.append({"type": "end_turn"})
                print("Fin del turno. Resultado:", res)
                break

            print("Comando no reconocido. Escribe 'help' para ver las opciones.")

        return actions


