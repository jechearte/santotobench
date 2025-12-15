"use client";

import {
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
} from "recharts";
import { RunTurn } from "@/lib/types";

interface ToolCallsChartProps {
  turns: RunTurn[];
}

type ToolCallsChartDataPoint = {
  turn: number;
  time: string;
  // Dynamic keys per tool name (values are counts)
  [toolName: string]: number | string;
};

const COLORS = [
  "#0EA5E9",
  "#6366F1",
  "#22C55E",
  "#F97316",
  "#EC4899",
  "#A855F7",
  "#14B8A6",
  "#EAB308",
];

function prettifyToolName(name: string): string {
  switch (name) {
    case "get_status":
      return "get_status";
    case "set_prices":
      return "set_prices";
    case "place_order":
      return "place_order";
    case "get_prices":
      return "get_prices";
    default:
      return name || "desconocido";
  }
}

export function ToolCallsChart({ turns }: ToolCallsChartProps) {
  if (turns.length === 0) {
    return null;
  }

  const toolTypesSet = new Set<string>();

  const data: ToolCallsChartDataPoint[] = turns.map((turn) => {
    const counts: Record<string, number> = {};

    for (const tc of turn.tool_calls || []) {
      const name = tc.name || "desconocido";
      if (name === "end_turn") continue;
      toolTypesSet.add(name);
      counts[name] = (counts[name] || 0) + 1;
    }

    return {
      turn: turn.turn,
      time: turn.time,
      ...counts,
    };
  });

  const toolTypes = Array.from(toolTypesSet).sort();

  const maxTotal = Math.max(
    ...data.map((d) =>
      toolTypes.reduce((sum, t) => {
        const v = d[t];
        return sum + (typeof v === "number" ? v : 0);
      }, 0),
    ),
    0,
  );

  const yMax = Math.max(1, maxTotal);
  const step = yMax <= 10 ? 1 : yMax <= 20 ? 2 : 5;

  const yTicks: number[] = [];
  for (let v = 0; v <= yMax; v += step) {
    yTicks.push(v);
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
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
          domain={[0, yMax]}
          ticks={yTicks}
          tick={{ fill: "#6b7280", fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          width={40}
          allowDecimals={false}
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
            const label = prettifyToolName(name);
            return [value, label];
          }}
          labelFormatter={(label) => `${label}`}
        />
        <Legend
          wrapperStyle={{ paddingTop: 8 }}
          formatter={(value) => prettifyToolName(value as string)}
        />
        {toolTypes.map((tool, index) => (
          <Bar
            key={tool}
            dataKey={tool}
            stackId="tools"
            fill={COLORS[index % COLORS.length]}
            radius={
              index === toolTypes.length - 1 ? [4, 4, 0, 0] : undefined
            }
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}


