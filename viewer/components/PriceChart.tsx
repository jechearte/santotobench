"use client";

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

interface PriceChartProps {
  turns: RunTurn[];
}

interface PriceChartDataPoint {
  turn: number;
  time: string;
  pintxo: number;
  bocadillo: number;
  sidra: number;
}

export function PriceChart({ turns }: PriceChartProps) {
  if (turns.length === 0) {
    return null;
  }

  const data: PriceChartDataPoint[] = turns.map((turn) => ({
    turn: turn.turn,
    time: turn.time,
    pintxo: turn.state_after.prices.pintxo,
    bocadillo: turn.state_after.prices.bocadillo,
    sidra: turn.state_after.prices.sidra,
  }));

  const allPrices = data.flatMap((d) => [d.pintxo, d.bocadillo, d.sidra]);
  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);

  // Escala Y en múltiplos de 5€ con márgenes redondeados
  const minTick = Math.max(0, Math.floor(minPrice / 5) * 5);
  const maxTick = Math.ceil(maxPrice / 5) * 5 || 5;

  const yTicks: number[] = [];
  for (let v = minTick; v <= maxTick; v += 5) {
    yTicks.push(v);
  }

  const formatPriceTick = (value: number) =>
    `${new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)} €`;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={data}
        margin={{ top: 10, right: 30, left: 10, bottom: 10 }}
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
          tick={{ fill: "#6b7280", fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          width={60}
          tickFormatter={formatPriceTick}
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
              name === "pintxo"
                ? "Pintxo"
                : name === "bocadillo"
                ? "Bocadillo"
                : "Sidra";
            return [`${value.toFixed(2)}€`, label];
          }}
          labelFormatter={(label) => `${label}`}
        />
        <Legend
          wrapperStyle={{ paddingTop: 8 }}
          formatter={(value) => {
            if (value === "pintxo") return "Pintxo";
            if (value === "bocadillo") return "Bocadillo";
            if (value === "sidra") return "Sidra";
            return value;
          }}
        />
        <Line
          type="monotone"
          dataKey="pintxo"
          stroke="#10B981"
          strokeWidth={2}
          dot={false}
          activeDot={{
            r: 5,
            fill: "#10B981",
            stroke: "white",
            strokeWidth: 2,
          }}
        />
        <Line
          type="monotone"
          dataKey="bocadillo"
          stroke="#3B82F6"
          strokeWidth={2}
          dot={false}
          activeDot={{
            r: 5,
            fill: "#3B82F6",
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
