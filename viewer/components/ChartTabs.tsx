"use client";

import { useState } from "react";
import { CashChart } from "./CashChart";
import { PriceChart } from "./PriceChart";
import { StockChart } from "./StockChart";
import { RevenueExpensesChart } from "./RevenueExpensesChart";
import { ToolCallsChart } from "./ToolCallsChart";
import { RunTurn } from "@/lib/types";

interface ChartTabsProps {
  turns: RunTurn[];
}

const TABS = [
  { id: "cash", label: "Cash" },
  { id: "prices", label: "Prices" },
  { id: "stock", label: "Stock" },
  { id: "revenue-expenses", label: "Revenue" },
  { id: "tool-calls", label: "Tools" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function ChartTabs({ turns }: ChartTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>("cash");

  if (turns.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-2xl border border-pizarra-200 p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-lg font-semibold text-pizarra-800">
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
                  "px-3 py-1.5 text-sm font-medium rounded-full transition-colors cursor-pointer",
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
      </div>
    </div>
  );
}


