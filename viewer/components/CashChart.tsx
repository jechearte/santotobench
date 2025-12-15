"use client";

import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  ComposedChart,
} from "recharts";
import { RunTurn } from "@/lib/types";

interface CashChartProps {
  turns: RunTurn[];
}

interface ChartDataPoint {
  turn: number;
  time: string;
  cash: number;
}

function formatEur(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function CashChart({ turns }: CashChartProps) {
  if (turns.length === 0) {
    return null;
  }

  // Prepare data for the chart: we use cash at the START of each turn
  // For turn N (N>0), initial cash is final cash from turn N-1
  const data: ChartDataPoint[] = turns.map((turn, index) => {
    let cash: number;
    if (index === 0) {
      // For the first turn, we calculate initial cash by subtracting sales from final cash
      cash = (turn.state_after?.cash ?? 0) - (turn.sales?.revenue ?? 0);
    } else {
      // For other turns, initial cash is final cash from the previous turn
      cash = turns[index - 1].state_after?.cash ?? 0;
    }
    return {
      turn: turn.turn,
      time: turn.time,
      cash,
    };
  });

  const maxCash = Math.max(...data.map((d) => d.cash));
  
  // Eje Y: desde 0 hasta el siguiente múltiplo de 1000
  const yMin = 0;
  const yMax = Math.ceil(maxCash / 1000) * 1000;
  
  // Generar ticks en tramos de 1000€
  const yTicks: number[] = [];
  for (let tick = 0; tick <= yMax; tick += 1000) {
    yTicks.push(tick);
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={data}
        margin={{ top: 10, right: 30, left: 10, bottom: 10 }}
      >
        <defs>
          <linearGradient id="cashGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2E7D32" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#2E7D32" stopOpacity={0.05} />
          </linearGradient>
        </defs>
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
          domain={[yMin, yMax]}
          ticks={yTicks}
          tick={{ fill: "#6b7280", fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => formatEur(value)}
          width={80}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "white",
            border: "1px solid #e5e7eb",
            borderRadius: "12px",
            boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
            padding: "12px 16px",
          }}
          labelStyle={{ color: "#374151", fontWeight: 600, marginBottom: 4 }}
          formatter={(value: number) => [formatEur(value), "Cash"]}
          labelFormatter={(label) => `${label}`}
        />
        {/* Área bajo la curva */}
        <Area
          type="monotone"
          dataKey="cash"
          fill="url(#cashGradient)"
          stroke="none"
          tooltipType="none"
        />
        {/* Línea principal */}
        <Line
          type="monotone"
          dataKey="cash"
          stroke="#2E7D32"
          strokeWidth={2.5}
          dot={false}
          activeDot={{
            r: 6,
            fill: "#2E7D32",
            stroke: "white",
            strokeWidth: 2,
          }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
