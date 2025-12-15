"use client";

import { useEffect, useState } from "react";
import { CashChart } from "./CashChart";
import { PriceChart } from "./PriceChart";
import { StockChart } from "./StockChart";
import { RevenueExpensesChart } from "./RevenueExpensesChart";
import { ToolCallsChart } from "./ToolCallsChart";
import { QueueChart } from "./QueueChart";
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

interface ChartTabsProps {
  turns: RunTurn[];
}

const TABS = [
  { id: "cash", label: "Cash" },
  { id: "prices", label: "Prices" },
  { id: "stock", label: "Stock" },
  { id: "revenue-expenses", label: "Revenue" },
  { id: "tool-calls", label: "Tools" },
  { id: "queue", label: "Queue" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function ChartTabs({ turns }: ChartTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>("cash");
  const isMobile = useIsMobile(640);

  if (turns.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-2xl border border-pizarra-200 p-4 sm:p-6">
      <div className={`flex ${isMobile ? "flex-col items-center" : "items-center justify-between"} gap-3 mb-4`}>
        <h3 className={`text-lg font-semibold text-pizarra-800 ${isMobile ? "self-start" : ""}`}>
          Simulation evolution
        </h3>
        <div
          className="inline-flex items-center gap-1 rounded-full bg-pizarra-50 p-1 border border-pizarra-200"
          role="tablist"
          aria-label="Simulation charts"
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
                  isMobile
                    ? "px-2 py-1 text-xs font-medium rounded-full transition-colors cursor-pointer"
                    : "px-3 py-1.5 text-sm font-medium rounded-full transition-colors cursor-pointer",
                  isActive
                    ? "bg-white text-pizarra-900 shadow-sm"
                    : "text-pizarra-500 hover:text-pizarra-800 hover:bg-white/60",
                ].join(" ")}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="h-[320px] w-full">
        {activeTab === "cash" && <CashChart turns={turns} />}
        {activeTab === "prices" && <PriceChart turns={turns} />}
        {activeTab === "stock" && <StockChart turns={turns} />}
        {activeTab === "revenue-expenses" && <RevenueExpensesChart turns={turns} />}
        {activeTab === "tool-calls" && <ToolCallsChart turns={turns} />}
        {activeTab === "queue" && <QueueChart turns={turns} />}
      </div>
    </div>
  );
}


