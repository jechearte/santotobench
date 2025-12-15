// Tipos para los datos del simulador

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result: Record<string, unknown>;
}

export type AgentAction =
  // Razonamientos del modelo
  | {
      type: "reasoning";
      id: string;
      summary?: string[];
      [key: string]: unknown;
    }
  // Llamadas a herramientas embebidas dentro de agent_actions
  | (ToolCall & {
      type: "tool_call";
    })
  // Otras acciones de alto nivel (set_prices, place_order, etc.)
  | {
      type: string;
      prices?: Record<string, number>;
      quantities?: Record<string, number>;
      [key: string]: unknown;
    };

export interface DemandRealized {
  pintxo: number;
  bocadillo: number;
  sidra: number;
  unmet: {
    pintxo: number;
    bocadillo: number;
    sidra: number;
  };
}

export interface OrderItems {
  pintxo?: number;
  bocadillo?: number;
  sidra?: number;
  // Permitimos productos adicionales por si el simulador se amplía en el futuro
  [key: string]: number | undefined;
}

export interface OrderServed {
  items: OrderItems;
}

export interface Sales {
  revenue: number;
  by_product: {
    pintxo: number;
    bocadillo: number;
    sidra: number;
  };
}

export interface Stock {
  txistorra: number;
  pan: number;
  sidra: number;
}

export interface Prices {
  pintxo: number;
  bocadillo: number;
  sidra: number;
}

export interface InboundDelivery {
  arrival_turn: number;
  quantities: Record<string, number>;
}

export interface StateAfter {
  cash: number;
  stock: Stock;
  inbound: InboundDelivery[];
  prices: Prices;
}

export interface LLMMetrics {
  tokens_in: number;
  tokens_out: number;
  cost_eur: number;
}

export interface RunTurn {
  turn: number;
  time: string;
  state_before: Record<string, unknown>;
  agent_actions: AgentAction[];
  tool_calls_count: number;
  tool_calls: ToolCall[];
  demand_realized: DemandRealized;
   /**
    * Lista de pedidos servidos durante el turno.
    * Es el nuevo formato preferido en los .jsonl recientes.
    */
  orders_served?: OrderServed[];
  sales: Sales;
  state_after: StateAfter;
  llm_metrics: LLMMetrics;
}

export interface RunSummary {
  fileName: string;
  model: string;
  /**
   * Nombre abreviado del modelo (meta.model_short).
   * Si no existe en el .jsonl, se usa el nombre completo.
   */
  modelShort?: string;
  /**
   * Proveedor del modelo (meta.provider)
   * Ej: openai, gemini, anthropic, xai
   */
  provider?: string;
  /**
   * Nivel de esfuerzo de razonamiento del modelo (meta.reasoning_effort)
   * Puede ser "low", "medium", "high", etc.
   */
  reasoningEffort?: string;
  createdAt: string;
  turns: number;
  totalCostEur: number;
  totalRevenue: number;
  finalCash: number;
  cashGenerated: number;
  totalTokensIn: number;
  totalTokensOut: number;
}

export interface RunDetail {
  fileName: string;
  summary: RunSummary;
  turns: RunTurn[];
}

