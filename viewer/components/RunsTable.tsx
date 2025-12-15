"use client";

import { useRouter } from "next/navigation";
import { RunSummary } from "@/lib/types";
import { formatEur, formatNumber } from "@/lib/parseRun";

const MEDAL_ICONS = ["🥇", "🥈", "🥉"];

interface RunsTableProps {
  runs: RunSummary[];
}

export function RunsTable({ runs }: RunsTableProps) {
  const router = useRouter();

  return (
    <div className="bg-white rounded-2xl border border-pizarra-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-pizarra-50 border-b border-pizarra-200">
              <th className="px-4 py-3 text-left text-sm font-semibold text-pizarra-500 uppercase tracking-wider w-12">#</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-pizarra-500 uppercase tracking-wider">Model</th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-pizarra-500 uppercase tracking-wider">Cash generated</th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-pizarra-500 uppercase tracking-wider">Inference cost</th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-pizarra-500 uppercase tracking-wider">Tokens consumed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-pizarra-100">
            {runs.map((run, index) => {
              const isHuman =
                run.provider === "human" || String(run.model || "").toLowerCase() === "human";
              const totalTokens = Number(run.totalTokensIn || 0) + Number(run.totalTokensOut || 0);
              const costValue = Number(run.totalCostEur || 0);

              const costDisplay = isHuman && costValue === 0 ? "-" : formatEur(costValue);
              const tokensDisplay =
                isHuman && totalTokens === 0 ? "-" : formatNumber(totalTokens);
              const modelLabel = run.modelShort || run.model;

              return (
              <tr 
                key={run.fileName} 
                className={`group transition-colors cursor-pointer ${
                  isHuman 
                    ? "bg-pizarra-100 hover:bg-pizarra-200" 
                    : "hover:bg-pizarra-50"
                }`}
                onClick={() => router.push(`/runs/${encodeURIComponent(run.fileName)}`)}
              >
                <td className="px-4 py-4">
                  <span className="text-lg">
                    {index < 3 ? MEDAL_ICONS[index] : <span className="text-pizarra-400 text-sm font-medium">{index + 1}</span>}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center px-3 py-1 rounded-lg bg-gradient-to-r from-sidra-500 to-sidra-600 text-white text-base font-semibold shadow-sm">
                      {modelLabel}
                    </span>
                    <svg 
                      className="w-4 h-4 text-pizarra-300 opacity-0 group-hover:opacity-100 transition-opacity" 
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className="font-bold text-green-600 text-base">{formatEur(run.cashGenerated)}</span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className="font-medium text-amber-600 text-base">{costDisplay}</span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className="font-medium text-pizarra-600 text-base">{tokensDisplay}</span>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

