## Simulador del puesto de txistorra – Santo Tomás

### Requisitos
- Python 3.11+
- Instalar dependencias:
  ```bash
  pip install -r requirements.txt
  ```

### Ejecutar una partida
```bash
python cli.py play --config configs/config.yml --seed 42 --agent openai/gpt-5.1 --reasoning-effort medium
```

### Ejecutar experimentos
```bash
python cli.py run-experiments --experiments configs/experiments.yml
```

### Docker
Construir imagen en local (amd64):
```bash
docker build --platform linux/amd64 -t santo-tomas-sim .
```

Lanzar contenedor (ayuda CLI):
```bash
docker compose up --build
```

### Estructura
- `sim/`: motor de simulación, demanda y tipos
- `agent/`: agentes (heurístico, LLM placeholder) y costes
- `runner/`: ejecución de experimentos y agregación básica
- `configs/`: configuración por defecto y matriz de experimentos
- `runs/`: resultados (se crea al ejecutar)

### Notas
- El agente debe usar `get_status` y `get_prices` para consultar caja, stock, entregas y precios.
- Compras con coste > caja son rechazadas.
- El turno avanza únicamente con `end_turn`.
- Para usar OpenAI Responses API, configura `OPENAI_API_KEY`:
  - **Opción 1 (recomendada)**: Crea un archivo `.env` en la raíz del proyecto:
    ```
    OPENAI_API_KEY=sk-tu-clave-aqui
    ```
  - **Opción 2**: Define la variable de entorno:
    - macOS/Linux: `export OPENAI_API_KEY="sk-..."`
    - Windows (PowerShell): `$Env:OPENAI_API_KEY="sk-..."`

### Configuración de tools y prompt
- Tools agnósticas al proveedor: `configs/tools.yml`. Cada proveedor transformará este esquema al formato requerido.
- Prompt del sistema compartido: `agent/prompts/system.txt`.
*** End Patch  ***!

