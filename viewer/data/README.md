# Carpeta de datos

Copia aquí los ficheros `.jsonl` generados por el simulador para visualizarlos en la web.

## Formato esperado

Cada fichero `.jsonl` debe contener una línea JSON por turno con la siguiente estructura:

```json
{
  "turn": 0,
  "time": "10:00",
  "agent_actions": [...],
  "tool_calls": [...],
  "demand_realized": {...},
  "sales": {...},
  "state_after": {...},
  "llm_metrics": {...}
}
```

## Cómo añadir nuevos ficheros

1. Copia el fichero `.jsonl` desde la carpeta `runs/` del simulador a esta carpeta.
2. La web detectará automáticamente los nuevos ficheros (no es necesario reiniciar).

## Ejemplo

```bash
cp ../runs/gpt-5.1_20251128-153629.jsonl ./data/
```





