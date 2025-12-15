"use client";

import { useEffect, useState } from "react";
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LineChart,
} from "recharts";
import { RunTurn } from "@/lib/types";

function useIsMobile(breakpointPx = 640): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(`(max-width: ${breakpointPx}px)`);
    const onChange = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile("matches" in e ? e.matches : (e as MediaQueryList).matches);
    };

    onChange(mql);
    if (typeof mql.addEventListener === "function") {
      const handler = onChange as (e: MediaQueryListEvent) => void;
      mql.addEventListener("change", handler);
      return () => mql.removeEventListener("change", handler);
    }

    // Safari legacy fallback (MediaQueryList#addListener/removeListener)
    const legacyMql = mql as unknown as {
      addListener?: (listener: (e: MediaQueryListEvent) => void) => void;
      removeListener?: (listener: (e: MediaQueryListEvent) => void) => void;
    };
    const handler = onChange as (e: MediaQueryListEvent) => void;
    legacyMql.addListener?.(handler);
    return () => legacyMql.removeListener?.(handler);
  }, [breakpointPx]);

  return isMobile;
}

interface StockChartProps {
  turns: RunTurn[];
}

interface StockChartDataPoint {
  turn: number;
  time: string;
  txistorra: number;
  pan: number;
  sidra: number;
}

export function StockChart({ turns }: StockChartProps) {
  const isMobile = useIsMobile(640);

  if (turns.length === 0) {
    return null;
  }

  // Initial stock for each hour: we use stock at the START of the turn
  // We prefer state_before.stock and, if missing, fall back to final stock from the previous turn.
  const data: StockChartDataPoint[] = turns.map((turn, index) => {
    type StateBeforeWithStock = {
      stock?: {
        txistorra: number;
        pan: number;
        sidra: number;
      };
    };

    const before = turn.state_before as StateBeforeWithStock;

    let txistorra: number;
    let pan: number;
    let sidra: number;

    if (before.stock) {
      txistorra = before.stock.txistorra;
      pan = before.stock.pan;
      sidra = before.stock.sidra;
    } else if (index > 0) {
      txistorra = turns[index - 1].state_after.stock.txistorra;
      pan = turns[index - 1].state_after.stock.pan;
      sidra = turns[index - 1].state_after.stock.sidra;
    } else {
      // Fallback defensivo si no hay datos
      txistorra = turn.state_after.stock.txistorra;
      pan = turn.state_after.stock.pan;
      sidra = turn.state_after.stock.sidra;
    }

    return {
      turn: turn.turn,
      time: turn.time,
      txistorra,
      pan,
      sidra,
    };
  });

  const allValues = data.flatMap((d) => [d.txistorra, d.pan, d.sidra]);
  const minValue = Math.min(...allValues);
  const maxValue = Math.max(...allValues);

  // Escala Y con mínimos y máximos redondeados a múltiplos de 10 unidades
  const minTick = Math.max(0, Math.floor(minValue / 10) * 10);
  const maxTick = Math.ceil(maxValue / 10) * 10 || 10;

  const yTicks: number[] = [];
  for (let v = minTick; v <= maxTick; v += 10) {
    yTicks.push(v);
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={data}
        margin={
          isMobile
            ? { top: 10, right: 12, left: 0, bottom: 10 }
            : { top: 10, right: 30, left: 10, bottom: 10 }
        }
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="#e5e7eb"
          vertical={false}
        />
        <XAxis
          dataKey="time"
          tick={{ fill: "#6b7280", fontSize: 12 }}
          tickLine={false}
          axisLine={{ stroke: "#e5e7eb" }}
          interval="preserveStartEnd"
          minTickGap={40}
        />
        <YAxis
          domain={[minTick, maxTick]}
          ticks={yTicks}
          tick={{ fill: "#6b7280", fontSize: isMobile ? 10 : 12 }}
          tickLine={false}
          axisLine={false}
          width={isMobile ? 40 : 60}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "white",
            border: "1px solid #e5e7eb",
            borderRadius: "12px",
            boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
            padding: "12px 16px",
          }}
          labelStyle={{
            color: "#374151",
            fontWeight: 600,
            marginBottom: 4,
          }}
          formatter={(value: number, name: string) => {
            const label =
              name === "txistorra"
                ? "Txistorra"
                : name === "pan"
                ? "Bread"
                : "Cider";
            return [`${value.toFixed(1)} uds`, label];
          }}
          labelFormatter={(label) => `${label}`}
        />
        <Legend
          wrapperStyle={{ paddingTop: 8 }}
          formatter={(value) => {
            if (value === "txistorra") return "Txistorra";
            if (value === "pan") return "Pan";
            if (value === "sidra") return "Cider";
            return value;
          }}
        />
        <Line
          type="monotone"
          dataKey="txistorra"
          stroke="#6366F1"
          strokeWidth={2}
          dot={false}
          activeDot={{
            r: 5,
            fill: "#6366F1",
            stroke: "white",
            strokeWidth: 2,
          }}
        />
        <Line
          type="monotone"
          dataKey="pan"
          stroke="#22C55E"
          strokeWidth={2}
          dot={false}
          activeDot={{
            r: 5,
            fill: "#22C55E",
            stroke: "white",
            strokeWidth: 2,
          }}
        />
        <Line
          type="monotone"
          dataKey="sidra"
          stroke="#F97316"
          strokeWidth={2}
          dot={false}
          activeDot={{
            r: 5,
            fill: "#F97316",
            stroke: "white",
            strokeWidth: 2,
          }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}


