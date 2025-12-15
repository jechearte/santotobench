import { RunTurn, RunSummary, RunDetail, ToolCall, DemandRealized } from "./types";

export interface RunMeta {
  model?: string;
  model_short?: string;
  provider?: string;
  reasoning_effort?: string;
  date?: string;
}

/**
 * Parsea el contenido de un fichero .jsonl y devuelve un array de turnos
 */
export function parseRunContent(content: string): RunTurn[] {
  const lines = content.trim().split("\n").filter((line) => line.trim());
  const turns: RunTurn[] = [];

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);

      // Ignorar la línea inicial de metadatos del experimento
      if (parsed && typeof parsed === "object" && parsed.type === "meta") {
        continue;
      }

      const raw = parsed as any;

      // Normalizar tool_calls:
      // - Esquema antiguo: campo top-level "tool_calls"
      // - Esquema nuevo: tool calls embebidas en "agent_actions" con type === "tool_call"
      let normalizedToolCalls: ToolCall[] = [];

      if (Array.isArray(raw.tool_calls)) {
        normalizedToolCalls = raw.tool_calls as ToolCall[];
      } else if (Array.isArray(raw.agent_actions)) {
        normalizedToolCalls = raw.agent_actions
          .filter((action: any) => action && action.type === "tool_call")
          .map((action: any) => ({
            id: String(action.id ?? ""),
            name: String(action.name ?? "unknown_tool"),
            arguments:
              action.arguments && typeof action.arguments === "object"
                ? (action.arguments as Record<string, unknown>)
                : {},
            result:
              action.result && typeof action.result === "object"
                ? (action.result as Record<string, unknown>)
                : {},
          }));
      }

      // Normalizar demanda realizada:
      // - Esquema antiguo: campo top-level "demand_realized"
      // - Esquema nuevo: lista "orders_served" con los pedidos servidos
      let demandRealized: DemandRealized | undefined = raw.demand_realized as DemandRealized | undefined;

      if (!demandRealized) {
        const orders = Array.isArray(raw.orders_served) ? raw.orders_served : [];

        const totals = {
          pintxo: 0,
          bocadillo: 0,
          sidra: 0,
        };

        for (const order of orders) {
          if (!order || typeof order !== "object") continue;
          const items = (order as any).items as Record<string, number> | undefined;
          if (!items || typeof items !== "object") continue;

          totals.pintxo += Number(items.pintxo || 0);
          totals.bocadillo += Number(items.bocadillo || 0);
          totals.sidra += Number(items.sidra || 0);
        }

        demandRealized = {
          pintxo: totals.pintxo,
          bocadillo: totals.bocadillo,
          sidra: totals.sidra,
          // Con el nuevo formato no tenemos información directa de demanda no cubierta,
          // así que, por ahora, asumimos 0 en todos los productos.
          unmet: {
            pintxo: 0,
            bocadillo: 0,
            sidra: 0,
          },
        };
      }

      const turn: RunTurn = {
        ...(raw as RunTurn),
        demand_realized:
          demandRealized ||
          ({
            pintxo: 0,
            bocadillo: 0,
            sidra: 0,
            unmet: { pintxo: 0, bocadillo: 0, sidra: 0 },
          } satisfies DemandRealized),
        tool_calls: normalizedToolCalls,
        tool_calls_count:
          typeof raw.tool_calls_count === "number"
            ? raw.tool_calls_count
            : normalizedToolCalls.length,
      };

      turns.push(turn);
    } catch (error) {
      console.error("Error parseando línea JSON:", error);
      // Continuamos con las demás líneas
    }
  }

  return turns;
}

/**
 * Extrae la línea de metadatos inicial (type: "meta") de un fichero .jsonl
 */
export function extractMetaFromContent(content: string): RunMeta | null {
  const firstNonEmptyLine = content
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstNonEmptyLine) {
    return null;
  }

  try {
    const parsed = JSON.parse(firstNonEmptyLine);
    if (parsed && typeof parsed === "object" && (parsed as any).type === "meta") {
      return parsed as RunMeta;
    }
  } catch {
    // Si la primera línea no es JSON válido, ignoramos y devolvemos null
  }

  return null;
}

/**
 * Extrae el nombre del modelo del nombre del fichero
 * Ejemplo: "gpt-5.1_20251128-153629.jsonl" -> "gpt-5.1"
 */
export function extractModelFromFileName(fileName: string): string {
  const match = fileName.match(/^([^_]+)_/);
  return match ? match[1] : "unknown";
}

/**
 * Extrae la fecha del nombre del fichero
 * Ejemplo: "gpt-5.1_20251128-153629.jsonl" -> "2025-11-28 15:36:29"
 */
export function extractDateFromFileName(fileName: string): string {
  const match = fileName.match(/_(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.jsonl$/);
  if (match) {
    const [, year, month, day, hour, min, sec] = match;
    return `${year}-${month}-${day} ${hour}:${min}:${sec}`;
  }
  return "Fecha desconocida";
}

/**
 * Calcula métricas agregadas de una ejecución
 */
export function calculateSummary(
  fileName: string,
  turns: RunTurn[],
  meta?: RunMeta | null,
): RunSummary {
  const totalCostEur = turns.reduce((sum, t) => sum + (t.llm_metrics?.cost_eur || 0), 0);
  const totalRevenue = turns.reduce((sum, t) => sum + (t.sales?.revenue || 0), 0);
  const totalTokensIn = turns.reduce((sum, t) => sum + (t.llm_metrics?.tokens_in || 0), 0);
  const totalTokensOut = turns.reduce((sum, t) => sum + (t.llm_metrics?.tokens_out || 0), 0);

  const lastTurn = turns[turns.length - 1];
  const finalCash = lastTurn?.state_after?.cash || 0;

   // Estimar el cash inicial usando las primeras llamadas a get_status:
   // para cada get_status con campo cash, calculamos:
   //   cash_inicial_candidato = cash_reportado - ingresos_acumulados_hasta_ese_turno
   // y nos quedamos con el máximo (antes de que haya compras que reduzcan la caja).
   let estimatedInitialCash = 0;
   let hasEstimate = false;
   let cumulativeRevenue = 0;

   for (const t of turns) {
     const toolCalls = (t.tool_calls || []) as Array<{ name?: string; result?: any }>;

     for (const tc of toolCalls) {
       const result = tc.result;
       if (
         tc.name === "get_status" &&
         result &&
         typeof result === "object" &&
         typeof (result as any).cash === "number"
       ) {
         const candidate = (result as any).cash - cumulativeRevenue;
         if (!hasEstimate || candidate > estimatedInitialCash) {
           estimatedInitialCash = candidate;
           hasEstimate = true;
         }
       }
     }

     cumulativeRevenue += t.sales?.revenue || 0;
   }

  if (!hasEstimate) {
    // Fallback conservador: asumimos que no hubo compras y aproximamos
    // cash_inicial = cash_final - ingresos_totales
    estimatedInitialCash = finalCash - totalRevenue;
  }

  // Evitar NaN por cualquier dato raro en los ficheros
  let cashGenerated = finalCash - estimatedInitialCash;
  if (!Number.isFinite(cashGenerated)) {
    cashGenerated = 0;
  }

  const modelFromFile = extractModelFromFileName(fileName);
  const model = meta?.model || modelFromFile;
  const modelShort = meta?.model_short || model;

  return {
    fileName,
    model,
    modelShort,
    provider: meta?.provider,
    reasoningEffort: meta?.reasoning_effort,
    createdAt: extractDateFromFileName(fileName),
    turns: turns.length,
    totalCostEur,
    totalRevenue,
    finalCash,
    cashGenerated,
    totalTokensIn,
    totalTokensOut,
  };
}

/**
 * Parsea un fichero completo y devuelve el detalle con resumen
 */
export function parseRunDetail(fileName: string, content: string): RunDetail {
  const turns = parseRunContent(content);
  const meta = extractMetaFromContent(content);
  const summary = calculateSummary(fileName, turns, meta);

  return {
    fileName,
    summary,
    turns,
  };
}

/**
 * Formatea un número como moneda EUR
 */
export function formatEur(value: number): string {
  // Formato manual para garantizar siempre el separador de miles con punto
  // y la coma como separador decimal, independientemente del entorno.
  const fixed = Number(value || 0).toFixed(2); // "1234.56"
  const [intPart, decimalPart] = fixed.split(".");

  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return `${withThousands},${decimalPart} €`;
}

/**
 * Formatea un número grande con separadores de miles
 */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

