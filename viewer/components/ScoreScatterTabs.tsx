"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Label,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ModelCashBarChart } from "./ModelCashBarChart";
import { getProviderColor } from "@/lib/providerColors";

type ScoreScatterPoint = {
  id: string;
  model: string;
  modelShort?: string;
  provider?: string;
  cashGenerated: number;
  totalCostEur: number;
  totalTokens: number;
  createdAt?: string;
};

type CashBarDatum = {
  id: string;
  label: string;
  model: string;
  provider?: string;
  cashGenerated: number;
};

type TabId = "cash-bar" | "cost" | "tokens";

const TABS: { id: TabId; label: string; mobileLabel: string }[] = [
  { id: "cash-bar", label: "Cash generated", mobileLabel: "Cash" },
  { id: "cost", label: "Cash vs Cost", mobileLabel: "Cost" },
  { id: "tokens", label: "Cash vs Tokens", mobileLabel: "Tokens" },
];

function formatEur(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatEurWithDecimals(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(value || 0));
}

function formatEurCompact(value: number): string {
  if (!Number.isFinite(value)) return "€0";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `€${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `€${Math.round(value / 1_000)}k`;
  return `€${Math.round(value)}`;
}

function formatNumberCompact(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(Math.round(value));
}

function useIsMobile(breakpointPx = 640): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(`(max-width: ${breakpointPx}px)`);
    const onChange = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile("matches" in e ? e.matches : (e as MediaQueryList).matches);
    };

    onChange(mql);
    if ("addEventListener" in mql) {
      mql.addEventListener("change", onChange as (e: MediaQueryListEvent) => void);
      return () => mql.removeEventListener("change", onChange as (e: MediaQueryListEvent) => void);
    }
    // Safari fallback
    mql.addListener(onChange as (e: MediaQueryListEvent) => void);
    return () => mql.removeListener(onChange as (e: MediaQueryListEvent) => void);
  }, [breakpointPx]);

  return isMobile;
}

function getNiceTicks(maxValue: number, sections = 4): { ticks: number[]; maxTick: number } {
  if (!Number.isFinite(maxValue) || maxValue <= 0) {
    return { ticks: [0, 1], maxTick: 1 };
  }

  const rawStep = maxValue / sections;
  const power = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const multiples = [1, 2, 5, 10];
  const stepMultiple = multiples.find((m) => m * power >= rawStep) ?? 10;
  const niceStep = stepMultiple * power;

  const maxTick = Math.max(niceStep, Math.ceil(maxValue / niceStep) * niceStep);
  const tickCount = Math.min(8, Math.ceil(maxTick / niceStep) + 1);
  const ticks = Array.from({ length: tickCount }, (_, i) => i * niceStep);

  return { ticks, maxTick };
}

function CustomTooltip({ payload, active }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload as ScoreScatterPoint & { color: string };

  return (
    <div className="rounded-xl border border-pizarra-200 bg-white px-4 py-3 shadow-lg">
      <div className="flex items-center gap-2 text-sm font-semibold text-pizarra-800">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: (point as any).color }}
        />
        {point.model}
      </div>
      <div className="mt-2 space-y-1 text-sm text-pizarra-700">
        <div className="flex items-center justify-between gap-6">
          <span className="text-pizarra-500">Cash generated</span>
          <span className="font-semibold">{formatEur(point.cashGenerated)}</span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="text-pizarra-500">Inference cost</span>
          <span>{formatEurWithDecimals(point.totalCostEur)}</span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="text-pizarra-500">Total tokens</span>
          <span>{formatNumber(point.totalTokens)}</span>
        </div>
      </div>
    </div>
  );
}

function ModelScatterChart({
  data,
  xKey,
  xLabel,
  xFormatter,
  humanCashGenerated,
  isMobile,
}: {
  data: Array<ScoreScatterPoint & { color: string }>;
  xKey: "totalCostEur" | "totalTokens";
  xLabel: string;
  xFormatter: (value: number) => string;
  humanCashGenerated: number | null;
  isMobile: boolean;
}) {
  if (!data || data.length === 0) return null;

  const xValues = data.map((d) => d[xKey] || 0);
  const yValues = data.map((d) => d.cashGenerated || 0);

  const xMax = Math.max(...xValues, 0);
  const yMax = Math.max(...yValues, 0);

  const { ticks: xTicks, maxTick: xMaxTick } = getNiceTicks(xMax, isMobile ? 3 : 4);
  const { ticks: yTicks, maxTick: yMaxTick } = getNiceTicks(yMax, isMobile ? 3 : 4);

  const xDomain: [number, number] = [0, xMaxTick || 1];
  const yDomain: [number, number] = [0, yMaxTick || 1];

  // Calculate Human color for reference line
  const humanPoint = data.find(
    (d) => d.provider === "human" || String(d.model || "").toLowerCase() === "human"
  );
  const humanColor = humanPoint ? humanPoint.color : getProviderColor("human");
  const humanRefOpacity = 0.55;
  const humanLabelShort = "Human";
  const humanLabelFull =
    humanCashGenerated !== null ? `Human: ${formatEur(humanCashGenerated)}` : "";

  // Formatters adaptados a mobile
  const mobileXFormatter = xKey === "totalCostEur" ? formatEurCompact : formatNumberCompact;
  const mobileYFormatter = formatEurCompact;

  return (
    <div className={isMobile ? "h-[300px] w-full" : "h-[360px] w-full"}>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart
          margin={
            isMobile
              ? { top: 20, right: 12, bottom: 36, left: 4 }
              : { top: 8, right: 24, bottom: 12, left: 8 }
          }
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            type="number"
            dataKey={xKey}
            name={xLabel}
            domain={xDomain}
            tickFormatter={isMobile ? mobileXFormatter : xFormatter}
            tick={{ fill: "#6b7280", fontSize: isMobile ? 10 : 12 }}
            tickLine={false}
            axisLine={{ stroke: "#e5e7eb" }}
            ticks={xTicks}
            label={
              isMobile
                ? {
                    value: xKey === "totalCostEur" ? "Cost (€)" : "Tokens",
                    position: "insideBottom",
                    offset: -4,
                    fill: "#475569",
                    fontSize: 10,
                  }
                : {
                    value: xLabel,
                    position: "insideBottom",
                    offset: -2,
                    fill: "#475569",
                    fontSize: 12,
                  }
            }
          />
          <YAxis
            type="number"
            dataKey="cashGenerated"
            name="Cash generated"
            domain={yDomain}
            tickFormatter={isMobile ? mobileYFormatter : formatEur}
            tick={{ fill: "#6b7280", fontSize: isMobile ? 10 : 12 }}
            tickLine={false}
            axisLine={{ stroke: "#e5e7eb" }}
            ticks={yTicks}
            width={isMobile ? 45 : 90}
            label={
              isMobile
                ? undefined
                : {
                    value: "Cash generated (€)",
                    angle: -90,
                    position: "insideLeft",
                    offset: 0,
                    style: { textAnchor: "middle" },
                    fill: "#475569",
                    fontSize: 12,
                  }
            }
          />
          {humanCashGenerated !== null && (
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
                    const vb = props?.viewBox as { x: number; y: number; width: number; height: number } | undefined;
                    if (!vb) return null;
                    // En mobile: label arriba a la derecha, fuera del área de puntos
                    const x = isMobile ? vb.x + vb.width - 4 : vb.x + 8;
                    const y = vb.y - 6;
                    return (
                      <text
                        x={x}
                        y={y}
                        textAnchor={isMobile ? "end" : "start"}
                        dominantBaseline="ideographic"
                        fill={humanColor}
                        opacity={humanRefOpacity}
                        fontSize={isMobile ? 10 : 12}
                        fontWeight={600}
                      >
                        {isMobile ? humanLabelShort : humanLabelFull}
                      </text>
                    );
                  }}
                />
              }
            />
          )}
          <Tooltip cursor={{ strokeDasharray: "3 3" }} content={<CustomTooltip />} />
          <Scatter
            data={data}
            shape={(props: any) => {
              const { cx, cy, payload } = props;
              return (
                <circle
                  cx={cx}
                  cy={cy}
                  r={isMobile ? 9 : 7}
                  fill={payload.color}
                  stroke="#0f172a1a"
                  strokeWidth={2}
                />
              );
            }}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ScoreScatterTabs({
  data,
  barData,
}: {
  data: ScoreScatterPoint[];
  barData?: CashBarDatum[];
}) {
  const [activeTab, setActiveTab] = useState<TabId>("cash-bar");
  const isMobile = useIsMobile(640);
  const hasData = data.length > 0;

  const coloredData = useMemo(
    () => data.map((d) => ({ ...d, color: getProviderColor(d.provider) })),
    [data],
  );
  
  // Filter Human from scatter charts (no cost/token data)
  const scatterDataWithoutHuman = useMemo(
    () =>
      coloredData.filter(
        (d) => d.provider !== "human" && String(d.model || "").toLowerCase() !== "human"
      ),
    [coloredData]
  );
  const barChartData: CashBarDatum[] = useMemo(() => {
    if (barData && barData.length > 0) return barData;
    return data.map((d) => ({
      id: d.id,
      // On the X axis we show the short name (if exists),
      // but keep the full name in `model` for the tooltip.
      label: d.modelShort || d.model || "Model",
      model: d.model,
      provider: d.provider,
      cashGenerated: d.cashGenerated,
    }));
  }, [barData, data]);

  // Calculate Human cash for reference lines
  const humanCashGenerated = useMemo(() => {
    const humanPoint = data.find(
      (d) => d.provider === "human" || String(d.model || "").toLowerCase() === "human"
    );
    if (!humanPoint || !Number.isFinite(humanPoint.cashGenerated)) return null;
    return humanPoint.cashGenerated;
  }, [data]);

  if (!hasData) return null;

  return (
    <div className="bg-white rounded-2xl border border-pizarra-200 p-4 sm:p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <div>
          <h3 className="text-lg font-semibold text-pizarra-800">
            Global model comparison
          </h3>
          <p className="text-sm text-pizarra-500">
            Explore cash generated versus inference cost or total token consumption
            for each run.
          </p>
        </div>
        <div
          className="inline-flex items-center gap-1 rounded-full bg-pizarra-50 p-1 border border-pizarra-200"
          role="tablist"
          aria-label="Comparison charts"
        >
          {TABS.map((tab) => {
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={[
                  "px-3 py-1.5 text-sm font-medium rounded-full transition-colors cursor-pointer",
                  isActive
                    ? "bg-white text-pizarra-900 shadow-sm"
                    : "text-pizarra-500 hover:text-pizarra-800 hover:bg-white/60",
                ].join(" ")}
                onClick={() => setActiveTab(tab.id)}
              >
                {isMobile ? tab.mobileLabel : tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === "cost" && (
        <ModelScatterChart
          data={scatterDataWithoutHuman}
          xKey="totalCostEur"
          xLabel="Inference cost (€)"
          xFormatter={formatEur}
          humanCashGenerated={humanCashGenerated}
          isMobile={isMobile}
        />
      )}
      {activeTab === "tokens" && (
        <ModelScatterChart
          data={scatterDataWithoutHuman}
          xKey="totalTokens"
          xLabel="Total tokens"
          xFormatter={formatNumber}
          humanCashGenerated={humanCashGenerated}
          isMobile={isMobile}
        />
      )}
      {activeTab === "cash-bar" && (
        <div className="w-full h-auto sm:h-[360px]">
          <ModelCashBarChart data={barChartData} />
        </div>
      )}
    </div>
  );
}

