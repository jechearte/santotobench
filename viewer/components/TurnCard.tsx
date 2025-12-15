"use client";

import { useState } from "react";
import Image from "next/image";
import { AgentAction, RunTurn } from "@/lib/types";
import { formatEur, formatNumber } from "@/lib/parseRun";

interface TurnCardProps {
  turn: RunTurn;
  index: number;
  defaultExpanded?: boolean;
  previousTurn?: RunTurn | null;
}

export function TurnCard({ turn, index, defaultExpanded = false, previousTurn }: TurnCardProps) {
  const [expandedToolCalls, setExpandedToolCalls] = useState<Set<string>>(new Set());

  const getEndTime = (startTime: string): string => {
    const [hourStr, minuteStr] = startTime.split(":");
    const hour = Number(hourStr);
    const minute = Number(minuteStr);

    if (Number.isNaN(hour) || Number.isNaN(minute)) {
      return startTime;
    }

    const totalMinutes = hour * 60 + minute + 15;
    const endHour = Math.floor(totalMinutes / 60) % 24;
    const endMinute = totalMinutes % 60;

    return `${endHour.toString().padStart(2, "0")}:${endMinute.toString().padStart(2, "0")}`;
  };

  const toggleToolCall = (id: string) => {
    setExpandedToolCalls(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Get initial state: always from state_before of the turn itself,
  // with fallback to first get_status tool call if needed
  const getInitialState = () => {
    // Try to use state_before from the turn itself
    const stateBefore = (turn.state_before || {}) as {
      cash?: number;
      stock?: { txistorra: number; pan: number; sidra: number };
      queue_start?: number;
    };

    if (
      stateBefore &&
      typeof stateBefore === "object" &&
      typeof stateBefore.cash === "number" &&
      stateBefore.stock
    ) {
      return {
        time: turn.time,
        stock: stateBefore.stock,
        cash: stateBefore.cash,
        queue: typeof stateBefore.queue_start === "number" ? stateBefore.queue_start : undefined,
      };
    }

    // Second attempt: search in first get_status tool call
    const getStatusCall = turn.tool_calls.find(tc => tc.name === "get_status");
    if (getStatusCall?.result && typeof getStatusCall.result === "object") {
      const result = getStatusCall.result as {
        cash?: number;
        stock_on_hand?: { txistorra: number; pan: number; sidra: number };
        queue_start?: number;
      };
      return {
        time: turn.time,
        stock: result.stock_on_hand || { txistorra: 0, pan: 0, sidra: 0 },
        cash: result.cash || 0,
        queue: typeof result.queue_start === "number" ? result.queue_start : undefined,
      };
    }
    return {
      time: turn.time,
      stock: { txistorra: 0, pan: 0, sidra: 0 },
      cash: 0,
      queue: undefined,
    };
  };

  const initialState = getInitialState();

  // Build list of actions to display (reasoning + tool_calls),
  // always hiding the end_turn tool_call. For compatibility with
  // old files, if there are no agent_actions we use tool_calls.
  type DisplayAction =
    | (AgentAction & { type: "reasoning" })
    | (AgentAction & { type: "tool_call" });

  const rawActions: AgentAction[] =
    (Array.isArray(turn.agent_actions) && turn.agent_actions.length > 0
      ? turn.agent_actions
      : (turn.tool_calls || []).map(tc => ({
          type: "tool_call",
          ...tc,
        }))) as AgentAction[];

  const displayActions: DisplayAction[] = rawActions.filter(action => {
    if (action.type === "tool_call") {
      const toolAction = action as AgentAction & { name?: string };
      return toolAction.name !== "end_turn";
    }
    // Always show reasoning
    if (action.type === "reasoning") {
      return true;
    }
    // For now we hide other types (set_prices/place_order are already shown in tool_calls)
    return false;
  }) as DisplayAction[];

  type ProductKey = "pintxo" | "bocadillo" | "sidra";

  // Calculate units sold (demand - unmet demand)
  const unitsSold = {
    pintxo: turn.demand_realized.pintxo - turn.demand_realized.unmet.pintxo,
    bocadillo: turn.demand_realized.bocadillo - turn.demand_realized.unmet.bocadillo,
    sidra: turn.demand_realized.sidra - turn.demand_realized.unmet.sidra,
  };

  const productDetails: Array<{ key: ProductKey; label: string; iconSrc: string; alt: string }> = [
    { key: "pintxo", label: "Pintxo", iconSrc: "/icons/pintxo.png", alt: "Pintxo" },
    { key: "bocadillo", label: "Sandwich", iconSrc: "/icons/bocadillo.png", alt: "Sandwich" },
    { key: "sidra", label: "Cider", iconSrc: "/icons/botella_sidra.png", alt: "Cider" },
  ];

  const workerAssignments =
    Array.isArray((turn.state_after as any).worker_assignments) && (turn.state_after as any).worker_assignments.length > 0
      ? ((turn.state_after as any).worker_assignments as Array<{ task?: string }>)
      : Array.isArray((turn.state_before as any).worker_assignments)
        ? ((turn.state_before as any).worker_assignments as Array<{ task?: string }>)
        : [];

  const workersByTask = workerAssignments.reduce<Record<string, number>>((acc, assignment) => {
    if (assignment && typeof assignment.task === "string") {
      acc[assignment.task] = (acc[assignment.task] || 0) + 1;
    }
    return acc;
  }, {});

  const taskDisplayOrder = ["atender_clientes", "freir_txistorra", "preparar_pintxos", "abrir_sidra"];

  const taskLabels: Record<string, { label: string; icon: string }> = {
    atender_clientes: { label: "Serve customers", icon: "🙋" },
    freir_txistorra: { label: "Fry txistorra", icon: "🍳" },
    preparar_pintxos: { label: "Prepare pintxos and bocadillos", icon: "🥘" },
    abrir_sidra: { label: "Open cider", icon: "🍾" },
  };

  const orderedTasks = [
    ...taskDisplayOrder.filter(task => workersByTask[task] !== undefined),
    ...Object.keys(workersByTask).filter(task => !taskDisplayOrder.includes(task)),
  ];

  const clientsAttended = Array.isArray(turn.orders_served) ? turn.orders_served.length : 0;

  const workerCapacities =
    (turn.state_after as any)?.worker_capacities ??
    (turn.state_before as any)?.worker_capacities ??
    { customers_per_turn: 0, txistorra_strips_per_turn: 0, sidra_bottles_per_turn: 0 };

  const llmCostFormatted = (() => {
    const value = Number(turn.llm_metrics?.cost_eur || 0);
    const fixed = value.toFixed(5);
    const [intPart, decimalPart] = fixed.split(".");
    const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `€${withThousands}.${decimalPart}`;
  })();

  const tokensIn = Number(turn.llm_metrics?.tokens_in ?? 0);
  const tokensOut = Number(turn.llm_metrics?.tokens_out ?? 0);
  const formatInt = (value: number) =>
    new Intl.NumberFormat("en-US", {
      useGrouping: true,
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    }).format(value);
  const tokensTotalFormatted = formatInt(tokensIn + tokensOut);
  const tokensInFormatted = formatInt(tokensIn);
  const tokensOutFormatted = formatInt(tokensOut);

  return (
    <div className="bg-white rounded-2xl border border-pizarra-200 overflow-hidden">
      {/* Situación inicial y final lado a lado */}
      <div className="px-6 py-4 bg-pizarra-50 border-b border-pizarra-200">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.2fr)_auto_minmax(0,1.2fr)] items-start gap-6 md:gap-10">
          {/* Situación inicial */}
          <div>
            <h3 className="text-sm font-semibold text-pizarra-600 mb-3">Initial state</h3>
            <div className="flex flex-col gap-2">
              {/* Row 1: time and people in queue */}
              <div className="flex items-center gap-6 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🕐</span>
                  <span className="text-lg font-bold text-pizarra-800 font-mono">{turn.time}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Image
                    src="/icons/cola.png"
                    alt="People in queue"
                    width={28}
                    height={28}
                    className="inline-block"
                  />
                  <span className="text-lg font-semibold text-pizarra-700">
                    {typeof initialState.queue === "number" ? initialState.queue : 0}
                  </span>
                </div>
              </div>

              {/* Row 2: ingredient stock (+ cash) */}
              <div className="flex items-center gap-6 flex-wrap">
                <div className="flex items-center gap-2">
                  <Image
                    src="/icons/tira_txistorra.png"
                    alt="Txistorra stock"
                    width={28}
                    height={28}
                    className="inline-block"
                  />
                  <span className="text-lg font-semibold text-pizarra-700">
                    {initialState.stock.txistorra?.toFixed(1) || 0}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Image
                    src="/icons/barra_pan.png"
                    alt="Bread stock"
                    width={28}
                    height={28}
                    className="inline-block"
                  />
                  <span className="text-lg font-semibold text-pizarra-700">
                    {initialState.stock.pan?.toFixed(1) || 0}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Image
                    src="/icons/botella_sidra.png"
                    alt="Cider stock"
                    width={28}
                    height={28}
                    className="inline-block"
                  />
                  <span className="text-lg font-semibold text-pizarra-700">
                    {initialState.stock.sidra?.toFixed(0) || 0}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">💵</span>
                  <span className="text-lg font-bold text-green-600">{formatEur(initialState.cash)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Separator between states: horizontal on mobile, vertical on desktop */}
          <div className="flex items-stretch justify-center py-2 md:py-0">
            <div className="w-full h-px md:w-px md:h-16 lg:h-20 bg-pizarra-200 rounded-full" />
          </div>

          {/* Final state */}
          <div>
            <h3 className="text-sm font-semibold text-pizarra-600 mb-3">Final state</h3>
            <div className="flex flex-col gap-2">
              {/* Row 1: time and people in queue */}
              <div className="flex items-center gap-6 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🕐</span>
                  <span className="text-lg font-bold text-pizarra-800 font-mono">
                    {getEndTime(turn.time)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Image
                    src="/icons/cola.png"
                    alt="People in queue"
                    width={28}
                    height={28}
                    className="inline-block"
                  />
                  <span className="text-lg font-semibold text-pizarra-700">
                    {typeof (turn.state_after as any).queue_end === "number"
                      ? (turn.state_after as any).queue_end
                      : 0}
                  </span>
                </div>
              </div>

              {/* Row 2: ingredient stock (+ cash) */}
              <div className="flex items-center gap-6 flex-wrap">
                <div className="flex items-center gap-2">
                  <Image
                    src="/icons/tira_txistorra.png"
                    alt="Txistorra stock"
                    width={28}
                    height={28}
                    className="inline-block"
                  />
                  <span className="text-lg font-semibold text-pizarra-700">
                    {turn.state_after.stock.txistorra.toFixed(1)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Image
                    src="/icons/barra_pan.png"
                    alt="Bread stock"
                    width={28}
                    height={28}
                    className="inline-block"
                  />
                  <span className="text-lg font-semibold text-pizarra-700">
                    {turn.state_after.stock.pan.toFixed(1)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Image
                    src="/icons/botella_sidra.png"
                    alt="Cider stock"
                    width={28}
                    height={28}
                    className="inline-block"
                  />
                  <span className="text-lg font-semibold text-pizarra-700">
                    {turn.state_after.stock.sidra.toFixed(0)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">💵</span>
                  <span className="text-lg font-bold text-green-600">
                    {formatEur(turn.state_after.cash)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tool Calls (always hiding end_turn) */}
      <div className="px-6 py-4 space-y-3">
        {displayActions.map((action, i) => {
          const id = (action as any).id ?? `${i}`;
          const isExpanded = expandedToolCalls.has(id);

          const isReasoning = action.type === "reasoning";
          const icon = isReasoning ? "🧠" : "🛠️";
          const title =
            action.type === "reasoning"
              ? "Reasoning"
              : (action as any).name ?? "tool_call";
          const summary = isReasoning
            ? ((action as any).summary as string[] | undefined)
            : undefined;
          const args = !isReasoning ? (action as any).arguments : undefined;
          const result = !isReasoning ? (action as any).result : undefined;
          
          return (
            <div 
              key={id}
              className="border border-pizarra-200 rounded-xl overflow-hidden"
            >
              {/* Header colapsable */}
              <button
                onClick={() => toggleToolCall(id)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-pizarra-50 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-full bg-pizarra-200 flex items-center justify-center text-base">
                    {icon}
                  </span>
                  <span className="font-medium text-pizarra-800">
                    {title}
                  </span>
                </div>
                <svg
                  className={`w-4 h-4 text-pizarra-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Contenido expandido */}
              {isExpanded && (
                <div className="border-t border-pizarra-200 p-4 bg-pizarra-900 text-pizarra-100 text-xs overflow-x-auto">
                  {isReasoning ? (
                    <div className="space-y-2">
                      {summary?.map((chunk, idx) => (
                        <p key={idx} className="whitespace-pre-wrap text-sm leading-relaxed">
                          {chunk}
                        </p>
                      )) || (
                        <p className="text-pizarra-400 text-sm">
                          No summary available for this reasoning.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="font-mono">
                      <div className="mb-2">
                        <span className="text-pizarra-500">Arguments:</span>
                        <pre className="text-pizarra-300 mt-1">
                          {JSON.stringify(args ?? {}, null, 2)}
                        </pre>
                      </div>
                      <div>
                        <span className="text-green-500">Result:</span>
                        <pre className="text-green-300 mt-1">
                          {JSON.stringify(result ?? {}, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div> 
              )}
            </div>
          );
        })}
      </div>

      {/* Task assignment, Capacities, Products sold, Metrics */}
      <div className="px-6 py-4 border-t border-pizarra-200">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Workers by task */}
          <div className="bg-sky-50 rounded-xl p-4 border border-sky-200">
            <h4 className="text-sm font-semibold text-sky-700 mb-3 text-center">Task assignment</h4>
            <div className="space-y-2 text-sm">
              {orderedTasks.length === 0 ? (
                <p className="text-center text-pizarra-500">No assignments recorded</p>
              ) : (
                orderedTasks.map(task => {
                  const count = workersByTask[task] ?? 0;
                  const metadata = taskLabels[task] ?? { label: task, icon: "👷" };
                  return (
                    <div key={task} className="flex justify-between items-center">
                      <span className="text-pizarra-600 flex items-center gap-2">
                        {task === "abrir_sidra" ? (
                          <Image
                            src="/icons/botella_sidra.png"
                            alt="Open cider"
                            width={20}
                            height={20}
                            className="inline-block"
                          />
                        ) : task === "preparar_pintxos" ? (
                          <Image
                            src="/icons/barra_pan.png"
                            alt="Prepare pintxos and bocadillos"
                            width={20}
                            height={20}
                            className="inline-block"
                          />
                        ) : (
                          <span>{metadata.icon}</span>
                        )}
                        <span>{metadata.label}</span>
                      </span>
                      <span className="font-semibold text-sky-700">{count}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Station capacities */}
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
            <h4 className="text-sm font-semibold text-blue-700 mb-3 text-center">Maximum turn capacity</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-pizarra-600 flex items-center gap-2">
                  <span>👥</span>
                  <span>Customers</span>
                </span>
                <span className="font-semibold text-blue-700">
                  {workerCapacities.customers_per_turn?.toFixed
                    ? workerCapacities.customers_per_turn.toFixed(0)
                    : workerCapacities.customers_per_turn}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-pizarra-600 flex items-center gap-2">
                  <Image
                    src="/icons/tira_txistorra.png"
                    alt="Txistorra strips"
                    width={24}
                    height={24}
                    className="inline-block"
                  />
                  <span>Txistorra strips</span>
                </span>
                <span className="font-semibold text-blue-700">
                  {workerCapacities.txistorra_strips_per_turn?.toFixed
                    ? workerCapacities.txistorra_strips_per_turn.toFixed(1)
                    : workerCapacities.txistorra_strips_per_turn}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-pizarra-600 flex items-center gap-2">
                  <Image
                    src="/icons/botella_sidra.png"
                    alt="Cider bottles"
                    width={24}
                    height={24}
                    className="inline-block"
                  />
                  <span>Cider bottles</span>
                </span>
                <span className="font-semibold text-blue-700">
                  {workerCapacities.sidra_bottles_per_turn?.toFixed
                    ? workerCapacities.sidra_bottles_per_turn.toFixed(0)
                    : workerCapacities.sidra_bottles_per_turn}
                </span>
              </div>
            </div>
          </div>

          {/* Products sold (units, price and revenue) */}
          <div className="bg-green-50 rounded-xl p-4 border border-green-200">
            <h4 className="text-sm font-semibold text-green-700 mb-3 text-center">Turn sales</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-pizarra-600 flex items-center gap-2">
                  <span>🧑‍🤝‍🧑</span>
                  <span>Customers served</span>
                </span>
                <span className="font-semibold text-green-700">
                  {formatNumber(clientsAttended)}
                </span>
              </div>
              {productDetails.map(product => {
                const units = unitsSold[product.key];
                const price = turn.state_after.prices[product.key];
                const revenue = turn.sales.by_product[product.key];

                return (
                  <div key={product.key} className="flex justify-between items-center">
                    <span className="text-pizarra-600 flex items-center gap-2">
                      <Image
                        src={product.iconSrc}
                        alt={product.alt}
                        width={24}
                        height={24}
                        className="inline-block"
                      />
                      <span>{product.label}</span>
                    </span>
                    <div className="text-right font-semibold text-green-700">
                      {formatNumber(units)} x {formatEur(price)} = {formatEur(revenue)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Turn metrics */}
          <div className="bg-purple-50 rounded-xl p-4 border border-purple-200">
            <h4 className="text-sm font-semibold text-purple-700 mb-3 text-center">Agent cost</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-pizarra-600">🤖 LLM cost</span>
                <span className="font-semibold text-purple-700">{llmCostFormatted}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-pizarra-600">⚡ Total tokens</span>
                <span className="font-semibold text-purple-700">
                  {tokensTotalFormatted}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-pizarra-600">⬇️ Input tokens</span>
                <span className="font-semibold text-purple-700">
                  {tokensInFormatted}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-pizarra-600">⬆️ Output tokens</span>
                <span className="font-semibold text-purple-700">
                  {tokensOutFormatted}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      
    </div>
  );
}
