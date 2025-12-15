"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getProviderColor } from "@/lib/providerColors";

interface RunCashDatum {
  id: string;
  label: string;
  model: string;
  provider?: string;
  cashGenerated: number;
}

interface ModelCashBarChartProps {
  data: RunCashDatum[];
}

function formatEur(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatEurCompact(value: number): string {
  if (!Number.isFinite(value)) return "€0";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `€${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `€${Math.round(value / 1_000)}k`;
  return `€${Math.round(value)}`;
}

function truncateLabel(label: string, max = 18): string {
  const safe = String(label ?? "");
  if (safe.length <= max) return safe;
  return `${safe.slice(0, Math.max(0, max - 1))}…`;
}

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

export function ModelCashBarChart({ data }: ModelCashBarChartProps) {
  const isMobile = useIsMobile(640);
  const safeData = Array.isArray(data) ? data : [];

  const mobileHeight = useMemo(() => {
    // Height grows with number of bars to avoid cramped labels on small screens.
    // Keep a sensible minimum so small datasets still look good.
    return Math.max(320, safeData.length * 44 + 80);
  }, [safeData.length]);

  if (safeData.length === 0) return null;

  const humanDatum = safeData.reduce<RunCashDatum | null>((best, current) => {
    const isHuman =
      current.provider === "human" || String(current.model || "").toLowerCase() === "human";
    if (!isHuman) return best;
    if (!best) return current;
    return (current.cashGenerated || 0) > (best.cashGenerated || 0) ? current : best;
  }, null);
  const humanCashGenerated =
    humanDatum && Number.isFinite(humanDatum.cashGenerated) ? humanDatum.cashGenerated : null;
  const humanColor =
    humanDatum !== null ? getProviderColor(humanDatum.provider ?? "human") : null;
  const humanLabel =
    humanCashGenerated !== null ? `Human: ${formatEur(humanCashGenerated)}` : "";
  const humanRefOpacity = 0.55;

  const maxCash = Math.max(...safeData.map((d) => d.cashGenerated));
  const yMin = 0;
  const yMax = Math.ceil(maxCash / 1000) * 1000 || 1000;

  const yTicks: number[] = [];
  for (let tick = 0; tick <= yMax; tick += 1000) {
    yTicks.push(tick);
  }

  return (
    <ResponsiveContainer width="100%" height={isMobile ? mobileHeight : "100%"}>
      <BarChart
        data={safeData}
        layout={isMobile ? "vertical" : undefined}
        margin={
          isMobile
            ? { top: 10, right: 16, left: 8, bottom: 10 }
            : { top: 10, right: 24, left: 0, bottom: 10 }
        }
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="#e5e7eb"
          vertical={isMobile}
          horizontal={!isMobile}
        />

        {isMobile ? (
          <>
            <XAxis
              type="number"
              domain={[yMin, yMax]}
              ticks={yTicks}
              tick={{ fill: "#6b7280", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "#e5e7eb" }}
              tickFormatter={(value) => formatEurCompact(Number(value))}
            />
            <YAxis
              type="category"
              dataKey="label"
              tickFormatter={(value) => truncateLabel(String(value), 18)}
              tick={{ fill: "#6b7280", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={120}
            />
            {humanCashGenerated !== null && humanColor !== null && (
              <ReferenceLine
                x={humanCashGenerated}
                stroke={humanColor}
                strokeOpacity={humanRefOpacity}
                strokeWidth={2}
                strokeDasharray="6 6"
                ifOverflow="extendDomain"
                label={
                  <Label
                    content={(props: any) => {
                      const vb = props?.viewBox as
                        | { x: number; y: number; width: number; height: number }
                        | undefined;
                      if (!vb) return null;
                      // Place label above the line, aligned to the left
                      const x = vb.x + 8;
                      const y = vb.y - 8;
                      return (
                        <text
                          x={x}
                          y={y}
                          textAnchor="start"
                          dominantBaseline="ideographic"
                          fill={humanColor}
                          opacity={humanRefOpacity}
                          fontSize={11}
                          fontWeight={600}
                        >
                          {humanLabel}
                        </text>
                      );
                    }}
                  />
                }
              />
            )}
            <Tooltip
              contentStyle={{
                backgroundColor: "white",
                border: "1px solid #e5e7eb",
                borderRadius: "12px",
                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                padding: "12px 16px",
              }}
              labelStyle={{ color: "#374151", fontWeight: 600, marginBottom: 4 }}
              formatter={(value: number) => [formatEur(value), "Cash generated"]}
              labelFormatter={(label, payload) => {
                const first = Array.isArray(payload) ? payload[0] : undefined;
                const model = first?.payload?.model as string | undefined;
                return model ?? String(label);
              }}
            />
            <Bar dataKey="cashGenerated" radius={[0, 8, 8, 0]} className="cursor-default">
              {safeData.map((entry) => (
                <Cell
                  key={entry.id}
                  fill={getProviderColor(entry.provider)}
                  className="cursor-default"
                />
              ))}
            </Bar>
          </>
        ) : (
          <>
            <XAxis
              dataKey="label"
              tick={{ fill: "#6b7280", fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: "#e5e7eb" }}
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
            {humanCashGenerated !== null && humanColor !== null && (
              <ReferenceLine
                y={humanCashGenerated}
                stroke={humanColor}
                strokeOpacity={humanRefOpacity}
                strokeWidth={2}
                strokeDasharray="6 6"
                ifOverflow="extendDomain"
                label={
                  <Label
                    content={(props: any) => {
                      const vb = props?.viewBox as
                        | { x: number; y: number; width: number; height: number }
                        | undefined;
                      if (!vb) return null;
                      // Place label above the line, aligned to the right
                      const x = vb.x + vb.width - 8;
                      const y = vb.y - 8;
                      return (
                        <text
                          x={x}
                          y={y}
                          textAnchor="end"
                          dominantBaseline="ideographic"
                          fill={humanColor}
                          opacity={humanRefOpacity}
                          fontSize={12}
                          fontWeight={600}
                        >
                          {humanLabel}
                        </text>
                      );
                    }}
                  />
                }
              />
            )}
            <Tooltip
              contentStyle={{
                backgroundColor: "white",
                border: "1px solid #e5e7eb",
                borderRadius: "12px",
                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                padding: "12px 16px",
              }}
              labelStyle={{ color: "#374151", fontWeight: 600, marginBottom: 4 }}
              formatter={(value: number) => [formatEur(value), "Cash generated"]}
              labelFormatter={(label, payload) => {
                const first = Array.isArray(payload) ? payload[0] : undefined;
                const model = first?.payload?.model as string | undefined;
                return model ?? String(label);
              }}
            />
            <Bar dataKey="cashGenerated" radius={[8, 8, 0, 0]} className="cursor-default">
              {safeData.map((entry) => (
                <Cell
                  key={entry.id}
                  fill={getProviderColor(entry.provider)}
                  className="cursor-default"
                />
              ))}
            </Bar>
          </>
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}


