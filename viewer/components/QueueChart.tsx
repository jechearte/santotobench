"use client";

import { useEffect, useState } from "react";
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

function useIsMobile(breakpointPx = 640): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(`(max-width: ${breakpointPx}px)`);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);

    // Set initial value
    setIsMobile(mql.matches);

    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [breakpointPx]);

  return isMobile;
}

interface QueueChartProps {
  turns: RunTurn[];
}

interface ChartDataPoint {
  turn: number;
  time: string;
  queue: number;
}

export function QueueChart({ turns }: QueueChartProps) {
  const isMobile = useIsMobile(640);

  if (turns.length === 0) {
    return null;
  }

  // Prepare data for the chart: we use queue_start at the START of each turn
  const data: ChartDataPoint[] = turns.map((turn) => {
    const stateBefore = turn.state_before as {
      queue_start?: number;
    };
    
    let queue: number = 0;
    if (typeof stateBefore?.queue_start === "number") {
      queue = stateBefore.queue_start;
    } else {
      // Fallback: try to get from get_status tool call
      const getStatusCall = turn.tool_calls.find(tc => tc.name === "get_status");
      if (getStatusCall?.result && typeof getStatusCall.result === "object") {
        const result = getStatusCall.result as {
          queue_start?: number;
        };
        queue = typeof result.queue_start === "number" ? result.queue_start : 0;
      }
    }

    return {
      turn: turn.turn,
      time: turn.time,
      queue,
    };
  });

  const maxQueue = Math.max(...data.map((d) => d.queue));
  
  // Eje Y: desde 0 hasta el siguiente múltiplo de 5
  const yMin = 0;
  const yMax = Math.max(5, Math.ceil(maxQueue / 5) * 5);
  
  // Generar ticks en tramos de 5 personas
  const yTicks: number[] = [];
  for (let tick = 0; tick <= yMax; tick += 5) {
    yTicks.push(tick);
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={data}
        margin={
          isMobile
            ? { top: 10, right: 12, left: 0, bottom: 10 }
            : { top: 10, right: 30, left: 10, bottom: 10 }
        }
      >
        <defs>
          <linearGradient id="queueGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0.05} />
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
          tick={{ fill: "#6b7280", fontSize: isMobile ? 10 : 12 }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
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
          labelStyle={{ color: "#374151", fontWeight: 600, marginBottom: 4 }}
          formatter={(value: number) => [`${value.toFixed(0)} people`, "Queue"]}
          labelFormatter={(label) => `${label}`}
        />
        {/* Área bajo la curva */}
        <Area
          type="monotone"
          dataKey="queue"
          fill="url(#queueGradient)"
          stroke="none"
          tooltipType="none"
        />
        {/* Línea principal */}
        <Line
          type="monotone"
          dataKey="queue"
          stroke="#8B5CF6"
          strokeWidth={2.5}
          dot={false}
          activeDot={{
            r: 6,
            fill: "#8B5CF6",
            stroke: "white",
            strokeWidth: 2,
          }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}


