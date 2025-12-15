## Santo Tomás Txistorra Stand Simulator

### Requirements
- Python 3.11+
- Install dependencies:
  ```bash
  pip install -r requirements.txt
  ```

### Run a game
```bash
python cli.py play --config configs/config.yml --seed 42 --agent openai/gpt-5.1 --reasoning-effort medium
```

### Run experiments
```bash
python cli.py run-experiments --experiments configs/experiments.yml
```

### Docker
Build image locally (amd64):
```bash
docker build --platform linux/amd64 -t santo-tomas-sim .
```

Run container (CLI help):
```bash
docker compose up --build
```

### Structure
- `sim/`: simulation engine, demand and types
- `agent/`: agents (heuristic, LLM placeholder) and costs
- `runner/`: experiment execution and basic aggregation
- `configs/`: default configuration and experiment matrix
- `runs/`: results (created when executing)

### Notes
- The agent must use `get_status` and `get_prices` to query cash, stock, deliveries and prices.
- Purchases with cost > cash are rejected.
- The turn advances only with `end_turn`.
- To use OpenAI Responses API, configure `OPENAI_API_KEY`:
  - **Option 1 (recommended)**: Create a `.env` file in the project root:
    ```
    OPENAI_API_KEY=sk-your-key-here
    ```
  - **Option 2**: Define the environment variable:
    - macOS/Linux: `export OPENAI_API_KEY="sk-..."`
    - Windows (PowerShell): `$Env:OPENAI_API_KEY="sk-..."`

### Tools and prompt configuration
- Provider-agnostic tools: `configs/tools.yml`. Each provider will transform this schema to the required format.
- Shared system prompt: `agent/prompts/system.txt`.
*** End Patch  ***!
