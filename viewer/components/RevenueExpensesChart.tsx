"use client";

import {
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  ReferenceLine,
} from "recharts";
import { RunTurn } from "@/lib/types";

interface RevenueExpensesChartProps {
  turns: RunTurn[];
}

interface ChartDataPoint {
  turn: number;
  time: string;
  revenue: number;
  expenses: number;
}

function formatEur(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function RevenueExpensesChart({ turns }: RevenueExpensesChartProps) {
  if (turns.length === 0) {
    return null;
  }

  // Calculate revenue and expenses per turn
  // Revenue = sales.revenue
  // Expenses = negative cash difference not explained by revenue
  // That is: expenses = (cash_before + revenue) - cash_after
  // If positive, it means there were expenses (purchases)
  const data: ChartDataPoint[] = turns.map((turn, index) => {
    const revenue = turn.sales?.revenue ?? 0;

    // Cash before the turn
    let cashBefore: number;
    if (index === 0) {
      // For the first turn, we calculate initial cash
      cashBefore = (turn.state_after?.cash ?? 0) - revenue;
      // But if there were purchases, we need to adjust
      const stateBefore = turn.state_before as { cash?: number };
      if (stateBefore?.cash !== undefined) {
        cashBefore = stateBefore.cash;
      }
    } else {
      cashBefore = turns[index - 1].state_after?.cash ?? 0;
    }

    const cashAfter = turn.state_after?.cash ?? 0;

    // Expenses = what's "missing" after adding revenue
    // If cashBefore + revenue - cashAfter > 0, there were expenses
    const expenses = cashBefore + revenue - cashAfter;

    return {
      turn: turn.turn,
      time: turn.time,
      revenue: revenue,
      // Show expenses as negative value so the bar grows downward
      expenses: expenses > 0 ? -expenses : 0,
    };
  });

  // Calcular el rango del eje Y usando exactamente los valores extremos de las barras
  const allValues = data.flatMap((d) => [d.revenue, d.expenses]);
  const yMax = Math.max(...allValues, 0);
  const yMin = Math.min(...allValues, 0);

  // Generar ticks enteros repartidos entre yMin e yMax
  const yTicks: number[] = [];
  const range = yMax - yMin || 1;
  const approxSteps = 6;
  const step = Math.max(1, Math.round(range / approxSteps));
  for (let tick = Math.floor(yMin); tick <= Math.ceil(yMax); tick += step) {
    yTicks.push(tick);
  }
  if (yTicks[yTicks.length - 1] !== yMax) {
    yTicks.push(yMax);
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={data}
        margin={{ top: 10, right: 30, left: 10, bottom: 10 }}
        barGap={0}
        stackOffset="sign"
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
          domain={[yMin, yMax]}
          ticks={yTicks}
          tick={{ fill: "#6b7280", fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => `${value} €`}
          width={60}
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
            const label = name === "revenue" ? "Revenue" : "Purchases";
            // Mostramos el valor absoluto para las compras
            const displayValue = name === "expenses" ? Math.abs(value) : value;
            return [formatEur(displayValue), label];
          }}
          labelFormatter={(label) => `${label}`}
        />
        <ReferenceLine y={0} stroke="#9ca3af" strokeWidth={1} />
        <Bar
          dataKey="revenue"
          name="revenue"
          fill="#22c55e"
          radius={[4, 4, 0, 0]}
          stackId="stack"
        />
        <Bar
          dataKey="expenses"
          name="expenses"
          fill="#ef4444"
          radius={[4, 4, 0, 0]}
          stackId="stack"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

