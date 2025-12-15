"use client";

import { RunSummary } from "@/lib/types";
import { formatEur, formatNumber } from "@/lib/parseRun";
import Link from "next/link";

interface RunListProps {
  runs: RunSummary[];
}

export function RunList({ runs }: RunListProps) {
  if (runs.length === 0) {
    return (
      <div className="text-center py-16 bg-white rounded-2xl shadow-sm border border-dashed border-pizarra-300">
        <div className="text-7xl mb-6">📭</div>
        <h3 className="text-xl font-semibold text-pizarra-700 mb-3">
          No runs available
        </h3>
        <p className="text-pizarra-500 max-w-md mx-auto mb-6">
          Copy <code className="bg-pizarra-100 px-2 py-0.5 rounded font-mono text-sm">.jsonl</code> files to the{" "}
          <code className="bg-pizarra-100 px-2 py-0.5 rounded font-mono text-sm">data/</code> folder to visualize them here.
        </p>
        <div className="bg-pizarra-50 rounded-xl p-4 max-w-lg mx-auto font-mono text-sm text-left text-pizarra-600">
          <span className="text-pizarra-400">$</span> cp ../runs/*.jsonl ./data/
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {runs.map((run, index) => (
        <Link
          key={run.fileName}
          href={`/runs/${encodeURIComponent(run.fileName)}`}
          className="group block bg-white rounded-2xl border border-pizarra-200 hover:border-sidra-300 hover:shadow-lg hover:shadow-sidra-500/5 transition-all cursor-pointer animate-fade-in"
          style={{ animationDelay: `${index * 50}ms` }}
        >
          <div className="p-5 flex flex-col md:flex-row md:items-center gap-4">
            {/* Model badge + date */}
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div className="flex-shrink-0">
                <span className="inline-flex items-center px-3 py-1.5 rounded-xl bg-gradient-to-r from-sidra-500 to-sidra-600 text-white text-sm font-semibold shadow-sm">
                  {run.modelShort || run.model}
                </span>
              </div>
              <div className="min-w-0">
                <div className="font-medium text-pizarra-800 truncate group-hover:text-sidra-600 transition-colors">
                  {run.createdAt}
                </div>
                <div className="text-xs text-pizarra-400 font-mono truncate">
                  {run.fileName}
                </div>
              </div>
            </div>
            
            {/* Stats */}
            <div className="flex items-center gap-6 md:gap-8">
              <div className="text-center">
                <div className="text-xs text-pizarra-400 mb-0.5">Turns</div>
                <div className="font-semibold text-pizarra-700">{run.turns}</div>
              </div>
              
              <div className="text-center">
                <div className="text-xs text-pizarra-400 mb-0.5">Revenue</div>
                <div className="font-semibold text-green-600">{formatEur(run.totalRevenue)}</div>
              </div>
              
              <div className="text-center">
                <div className="text-xs text-pizarra-400 mb-0.5">Final Cash</div>
                <div className="font-bold text-pizarra-800">{formatEur(run.finalCash)}</div>
              </div>
              
              <div className="text-center hidden sm:block">
                <div className="text-xs text-pizarra-400 mb-0.5">LLM Cost</div>
                <div className="font-semibold text-amber-600">{formatEur(run.totalCostEur)}</div>
              </div>
              
              <div className="text-center hidden lg:block">
                <div className="text-xs text-pizarra-400 mb-0.5">Tokens</div>
                <div className="font-medium text-pizarra-500 text-sm">
                  <span className="text-blue-500">↓</span>{formatNumber(run.totalTokensIn)}
                  <span className="mx-1 text-pizarra-300">/</span>
                  <span className="text-green-500">↑</span>{formatNumber(run.totalTokensOut)}
                </div>
              </div>
              
              {/* Arrow */}
              <div className="flex-shrink-0">
                <svg 
                  className="w-5 h-5 text-pizarra-300 group-hover:text-sidra-500 group-hover:translate-x-1 transition-all" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
