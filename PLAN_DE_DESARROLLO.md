## Plan de desarrollo – Simulador del puesto de txistorra (Santo Tomás)

### Resumen ejecutivo
Objetivo: construir un simulador para evaluar un agente de IA que gestiona un puesto de venta (pintxo de txistorra, bocadillo de txistorra, sidra) durante la feria de Santo Tomás de San Sebastián. El sistema permitirá variar el modelo LLM y el “esfuerzo de razonamiento”, y medirá caja final, tool_calls, tokens y coste total. En fases posteriores, habrá una aplicación web para visualizar decisiones y permitir el juego humano vs agente.

Nota sobre turnos: 10:00–20:00 a intervalos de 15’ son 40 turnos. Si se desea 41 turnos, se parametriza (`num_turns`). Valor por defecto: 40 para coherencia temporal.


## Alcance del MVP
- Motor de simulación determinístico con RNG semillado.
- Agente LLM con herramientas: `set_prices`, `place_order`, `end_turn`.
- Métricas: caja final, nº tool_calls, tokens (in/out) y coste total por proveedor/modelo.
- Runner de experimentos (rejilla de modelos × razonamiento × semillas).
- Persistencia de trazas por turno (JSONL) y resumen (CSV/JSON).


## Reglas del juego
### Tiempo
- `num_turns`: 40 por defecto (o 41 si se configura).
- Cada turno representa un bloque de 15 minutos, desde 10:00 hasta 20:00.

### Estado
- `cash`: caja disponible (euros).
- `stock_on_hand`: ingredientes disponibles: `{ txistorra, pan, sidra }`.
- `inbound_deliveries`: lista de entregas programadas, cada una con `{arrival_turn, quantities}`.
- `prices`: precios de venta: `{ pintxo, bocadillo, sidra }`.
- `lead_time`: 2 turnos (las compras llegan 2 turnos después).

### Acciones por turno (libre con cierre explícito)
El agente puede emitir cualquier número de acciones por turno y debe finalizar el turno con `end_turn()` para que se simule la demanda.
1) `place_order(quantities)`: comprar `{txistorra, pan, sidra}`.
   - El coste se descuenta inmediatamente de `cash`.
   - Si `coste > cash`, la compra se rechaza (no hay recorte). El agente deberá emitir otra orden cuyo coste sea `<= cash` (en el mismo turno, antes de `end_turn`, o en turnos posteriores).
   - Los ingredientes llegan en `turno_actual + lead_time`.
2) `set_prices(prices)`: fijar los tres precios libremente (sin límite duro, la demanda reacciona).
3) `end_turn()`: declara que el agente ha terminado sus acciones en el turno y desea avanzar a la simulación de demanda.
Además, el agente dispone de tools informativas:
- `get_status()` para consultar `cash`, `stock_on_hand` e `inbound_deliveries`.
- `get_prices()` para consultar `current_prices`.

### Demanda y ventas
- Tras las acciones, se simula la demanda por producto.
- Si `demanda > stock`, sólo se vende el stock disponible (resto es demanda no atendida).
- Ingresos = suma de `ventas_producto * precio_producto`.
- Reducción de stock por receta (ver “Recetas”).
- Entregas entrantes del turno se suman al final del turno (tras ventas).

### Recetas (por defecto, configurables)
- Pintxo: `txistorra: 1`, `pan: 0`.
- Bocadillo: `txistorra: 2`, `pan: 1`.
- Sidra: `sidra: 1` (botella/unidad).


## Modelo de demanda (MVP, extensible)
### Curva base por franja horaria
- Base por turno con picos en mediodía y meseta por la tarde. Definida en `config.yml` por producto.

### Elasticidad al precio
- Fórmula: `q = base_t * (p / p_ref)^(-ε) * noise`.
  - `p_ref`: precio de referencia.
  - `ε` (epsilon): elasticidad (>0).
  - `noise`: ruido multiplicativo (lognormal o normal truncada, semillado).

### Cross-selling simple (opcional)
- Precio de sidra bajo aumenta probabilidad de compra conjunta con bocadillo (parámetro `cross_sell_factor`).

### Reproducibilidad
- Semilla (`seed`) para RNG; resultados reproducibles por configuración.


## Configuración (ejemplo `configs/config.yml`)
```yaml
num_turns: 40
lead_time: 2
seed: 42
initial:
  cash: 500.0
  stock:
    txistorra: 200
    pan: 120
    sidra: 40
  prices:
    pintxo: 3.0
    bocadillo: 6.0
    sidra: 7.0
costs:
  txistorra: 0.9
  pan: 0.4
  sidra: 2.5
recipes:
  pintxo:
    txistorra: 1
  bocadillo:
    txistorra: 2
    pan: 1
  sidra:
    sidra: 1
demand:
  price_ref:
    pintxo: 3.0
    bocadillo: 6.0
    sidra: 7.0
  elasticity:
    pintxo: 1.2
    bocadillo: 1.0
    sidra: 0.8
  noise_std: 0.1
  base_curve:
    pintxo: [ ... 40 valores ... ]
    bocadillo: [ ... 40 valores ... ]
    sidra: [ ... 40 valores ... ]
```


## Interfaz del agente LLM
### Observación por turno (entrada)
El estado sensible (caja, stock, entregas entrantes y precios) no se entrega en la observación. El agente debe consultarlo mediante las tools `get_status` y `get_prices`.
```json
{
  "turn": 17,
  "time": "14:15",
  "last_turn_summary": {
    "demand": {"pintxo": 30, "bocadillo": 17, "sidra": 11},
    "sold": {"pintxo": 28, "bocadillo": 14, "sidra": 10},
    "unmet": {"bocadillo": 3}
  },
  "costs": {"txistorra": 0.9, "pan": 0.4, "sidra": 2.5},
  "recipes": {"pintxo": {"txistorra": 1}, "bocadillo": {"txistorra": 2, "pan": 1}, "sidra": {"sidra": 1}},
  "lead_time": 2
}
```

### Acciones (salida estrictamente JSON)
```json
{
  "action_plan": [
    {"type": "get_status"},
    {"type": "get_prices"},
    {"type": "set_prices", "prices": {"pintxo": 2.8, "bocadillo": 5.5, "sidra": 6.0}},
    {"type": "place_order", "quantities": {"txistorra": 120, "pan": 60, "sidra": 24}},
    {"type": "end_turn"}
  ]
}
```

### Herramientas expuestas (function/tool calling)
- `set_prices(prices: Record<string, number>)`
- `place_order(quantities: Record<string, number>)`
- `end_turn()`
- `get_status()` → devuelve `{ cash, stock_on_hand, inbound_deliveries }`
- `get_prices()` → devuelve `{ current_prices }`

### Validación
- Tipos y límites: cantidades no negativas, precios no negativos.
- Si el coste de compra excede `cash`, la compra se rechaza (no se descuenta nada ni se recortan cantidades). El agente puede emitir otra orden válida en este turno (si le queda acción) o esperar al siguiente.
- El turno termina únicamente cuando el agente invoca `end_turn()`. Se recomienda que `end_turn` sea la última acción del `action_plan` y no modifica el estado.
- Las tools `get_status` y `get_prices` son de sólo lectura; no alteran el estado pero cuentan en `tool_calls`.


## Métricas e instrumentación
- Por turno:
  - `tool_calls`: nº de invocaciones de herramientas del LLM.
  - `tokens_in`, `tokens_out` por llamada de decisión.
  - `cost_eur` estimado (mapa por proveedor/modelo).
  - `demand_realized`, `sold`, `unmet`, `revenue`.
- Agregadas (run):
  - `cash_final`, `tool_calls_total`, `tokens_in_total`, `tokens_out_total`, `cost_total_eur`, `unmet_total`.
- Límites/cortes:
  - `max_cost_per_run_eur` (opcional) para abortar si se supera el presupuesto.


## Soporte multi-proveedor (adaptadores)
- Proveedores previstos: OpenAI, Anthropic, Google Gemini, etc.
- Cada adaptador debe:
  - Exponer una interfaz uniforme de llamada con tool calling.
  - Reportar tokens in/out (vía API si existe, o estimación local).
  - Calcular coste por llamada con tarifas oficiales (o aproximación).
  - Aceptar `reasoning_effort` cuando el modelo lo soporte (p.ej., `low/medium/high` o modelos “reasoning”). Si no aplica, aproximar vía `temperature`, `max_output_tokens` y prompt.


## Runner de experimentos
### Definición (ejemplo `configs/experiments.yml`)
```yaml
experiments:
  - name: baseline_grid
    seeds: [1, 2, 3, 4, 5]
    replicas: 1
    models:
      - provider: openai
        model: gpt-4.1
        reasoning_effort: medium
      - provider: anthropic
        model: claude-3-5-sonnet
        reasoning_effort: medium
      - provider: google
        model: gemini-1.5-pro
        reasoning_effort: medium
    config_path: configs/config.yml
```

### Salidas por `run_id`
- `runs/<timestamp>-<hash>/config.json`
- `runs/<timestamp>-<hash>/trace.jsonl`
- `runs/<timestamp>-<hash>/metrics.json`
- `runs/<timestamp>-<hash>/summary.csv` (una fila por run)

### Formato de traza (`trace.jsonl`, por línea/turno)
```json
{
  "turn": 17,
  "time": "14:15",
  "state_before": {"cash": 421.0, "stock": {"txistorra": 55, "pan": 20, "sidra": 15}, "inbound": [{"turn": 19, "qty": {"txistorra": 100}}], "prices": {"pintxo": 3.2, "bocadillo": 6.5, "sidra": 7.5}},
  "agent_actions": [{"type": "get_status"}, {"type": "get_prices"}, {"type": "place_order", "quantities": {"pan": 60}}, {"type": "set_prices", "prices": {"bocadillo": 6.8}}, {"type": "end_turn"}],
  "tool_calls": 5,
  "demand_realized": {"pintxo": 28, "bocadillo": 14, "sidra": 10, "unmet": {"bocadillo": 3}},
  "sales": {"revenue": 260.4, "by_product": {"pintxo": 89.6, "bocadillo": 95.2, "sidra": 75.6}},
  "state_after": {"cash": 602.4, "stock": {"txistorra": 13, "pan": 6, "sidra": 5}, "inbound": [{"turn": 19, "qty": {"txistorra": 100}}, {"turn": 19, "qty": {"pan": 60}}]},
  "llm_metrics": {"tokens_in": 910, "tokens_out": 210, "cost_eur": 0.045}
}
```


## Estructura de proyecto
```
sim/
  engine.py          # loop de turnos, entregas, aplicación de reglas
  demand.py          # curva base, elasticidad, ruido
  types.py           # DTOs (pydantic/dataclasses)
  config.py          # carga/validación YAML
agent/
  llm_agent.py       # prompt, herramientas, parsing JSON, validación
  providers/
    openai.py
    anthropic.py
    gemini.py
  costs.py           # precios por modelo + cálculo coste
runner/
  experiment.py      # grid, semillas, ejecución
  report.py          # agregados y CSV
configs/
  config.yml
  experiments.yml
runs/                # salidas por run
cli.py               # CLI para jugar una partida o ejecutar experimentos
web/                 # (futuro) frontend
Dockerfile
docker-compose.yml
README.md
```


## CLI (interfaz de línea de comandos)
### Ejecutar una partida única
```bash
python cli.py play --config configs/config.yml --seed 42 --model openai/gpt-4.1 --reasoning-effort medium
```

### Ejecutar experimentos
```bash
python cli.py run-experiments --experiments configs/experiments.yml
```


## Roadmap
1) Motor de simulación + demanda + CLI de una partida.
2) Agente LLM con herramientas y validación JSON + instrumentación tokens/coste.
3) Runner de experimentos y agregados.
4) Escenarios de prueba y agente heurístico baseline (comparativa vs LLM).
5) Persistencia en SQLite y API REST de lectura.
6) UI web (timeline de decisiones, gráficos de caja/stock/demanda).
7) Modo “humano vs agente” (UI interactiva).


## Backlog de mejoras
- Demanda avanzada: meteorología, competencia, colas, tiempos de servicio.
- Costes variables (mayoristas alternativos, descuentos por volumen).
- Pérdidas: caducidad/mermas.
- Calendario ampliado: varios días/ferias.
- Estrategias de precios dinámicos con restricciones (mínimo/máximo).
- Evaluación de riesgo: penalizar stock-out o demanda insatisfecha.


## Web futura
- Backend: FastAPI para servir runs, trazas y agregados.
- Frontend: React/Next.js con gráficos (Recharts/Chart.js).
  - Regla de estilo: el cursor debe ser `pointer` al hacer hover en cualquier elemento clicable.
- Vistas:
  - Timeline por turno (acciones, ventas, caja, stock).
  - Gráficos: caja vs tiempo, stock vs tiempo, demanda vs ventas.
  - Comparativa humano vs agente: métricas finales y evolución.


## Docker
- Build multi-plataforma en local (regla del proyecto):
```bash
docker build --platform linux/amd64 -t santo-tomas-sim .
```

- Ejecución con `docker-compose` (cuando haya API/UI):
```bash
docker-compose up --build
```


## Testing y QA
- Tests unitarios:
  - Motor (`engine`): aplicación de recetas, entregas diferidas, política de compras (rechazo si falta caja), fin de turno obligatorio con `end_turn`.
  - Demanda: elasticidad, ruido, límites y reproducibilidad con `seed`.
  - Agente: validación JSON de acciones y presencia de `end_turn` por turno.
- Tests de integración:
  - Partida completa reproducible (semilla fija), snapshot de `summary.csv`.
  - Estimación de costes por proveedor con casos controlados.
- Invariantes:
  - Caja nunca negativa; compras que exceden caja se rechazan.
  - Stock nunca negativo.


## Seguridad, costes y operaciones
- Variables de entorno para claves: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`.
- Límite de presupuesto por run (`max_cost_per_run_eur`) y corte temprano.
- Registro de tool_calls y tokens para trazabilidad y auditoría.
- Sanitización de prompts (no incluir datos sensibles).


## Decisiones abiertas
- 40 vs 41 turnos: por defecto 40; parametrizable.
- Curvas base por producto (calibración inicial).
- Límites de precio (¿imponer mínimos/máximos? por ahora libre).


## Apéndice A: Pseudocódigo del bucle de simulación
```python
state = init_state(config)
for t in range(num_turns):
    obs = build_observation(state, t)
    decision = agent.decide(obs)  # cuenta tokens, tool_calls
    actions = validate(decision.action_plan, require_end_turn=True)

    # Acciones del turno (n ≥ 0) hasta end_turn
    for action in actions:
        if action.type == "set_prices":
            state.prices.update(action.prices)
        elif action.type == "place_order":
            cost = compute_cost(action.quantities, costs)
            if cost > state.cash:
                continue  # reject: compra no realizada por falta de caja
            state.cash -= cost
            schedule_delivery(state.inbound, t + lead_time, action.quantities)
        elif action.type == "get_status":
            _ = {
                "cash": state.cash,
                "stock_on_hand": state.stock_on_hand,
                "inbound_deliveries": state.inbound
            }  # sólo lectura; no altera estado
        elif action.type == "get_prices":
            _ = {"current_prices": state.prices}  # sólo lectura; no altera estado
        elif action.type == "end_turn":
            break

    # Simular demanda y ventas
    demand = sample_demand(state.prices, demand_params, t, rng)
    sales = fulfill_demand(demand, state.stock_on_hand, recipes)
    revenue = compute_revenue(sales, state.prices)
    state.cash += revenue

    # Aplicar reducción de stock por recetas
    consume_ingredients(state.stock_on_hand, sales, recipes)

    # Recibir entregas al final del turno
    receive_deliveries(state, t)

    # Log de traza por turno
    log_turn(trace_writer, state, t, actions, demand, sales, revenue, llm_metrics)

final_metrics = summarize_run(trace_file)
```


## Apéndice B: Esquema de acciones (JSON Schema simplificado)
```json
{
  "type": "object",
  "properties": {
    "action_plan": {
      "type": "array",
      "minItems": 1,
      "contains": {
        "type": "object",
        "properties": { "type": { "const": "end_turn" } },
        "required": ["type"]
      },
      "items": {
        "type": "object",
        "oneOf": [
          {
            "properties": {
              "type": {"const": "set_prices"},
              "prices": {
                "type": "object",
                "additionalProperties": {"type": "number", "minimum": 0}
              }
            },
            "required": ["type", "prices"],
            "additionalProperties": false
          },
          {
            "properties": {
              "type": {"const": "place_order"},
              "quantities": {
                "type": "object",
                "additionalProperties": {"type": "number", "minimum": 0}
              }
            },
            "required": ["type", "quantities"],
            "additionalProperties": false
          },
          {
            "properties": { "type": {"const": "get_status"} },
            "required": ["type"],
            "additionalProperties": false
          },
          {
            "properties": { "type": {"const": "get_prices"} },
            "required": ["type"],
            "additionalProperties": false
          },
          {
            "properties": { "type": {"const": "end_turn"} },
            "required": ["type"],
            "additionalProperties": false
          }
        ]
      }
    }
  },
  "required": ["action_plan"],
  "additionalProperties": false
}
```


## Licencia
Por defecto, se recomienda MIT para permitir uso, modificación y distribución con atribución.


