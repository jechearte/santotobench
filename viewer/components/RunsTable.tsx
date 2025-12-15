"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { RunSummary } from "@/lib/types";
import { formatEur, formatNumber } from "@/lib/parseRun";

const MEDAL_ICONS = ["🥇", "🥈", "🥉"];

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

/**
 * Obtiene la ruta del logo del proveedor
 */
function getProviderLogo(provider?: string): string | null {
  if (!provider) return null;
  
  const providerLower = provider.toLowerCase();
  const logoMap: Record<string, string> = {
    anthropic: "/anthropic_logo.png",
    gemini: "/gemini_logo.png",
    openai: "/openai_logo.png",
    xai: "/xai_logo.png",
  };
  
  return logoMap[providerLower] || null;
}

interface RunsTableProps {
  runs: RunSummary[];
}

export function RunsTable({ runs }: RunsTableProps) {
  const router = useRouter();
  const isMobile = useIsMobile(640);

  // Mobile: Diseño de tarjetas
  if (isMobile) {
    return (
      <div className="space-y-3">
        {runs.map((run, index) => {
          const isHuman =
            run.provider === "human" || String(run.model || "").toLowerCase() === "human";
          const totalTokens = Number(run.totalTokensIn || 0) + Number(run.totalTokensOut || 0);
          const costValue = Number(run.totalCostEur || 0);
          const costDisplay = isHuman && costValue === 0 ? "-" : formatEur(costValue);
          const tokensDisplay = isHuman && totalTokens === 0 ? "-" : formatNumber(totalTokens);
          const modelLabel = run.modelShort || run.model;
          const providerLogo = getProviderLogo(run.provider);

          return (
            <div
              key={run.fileName}
              className={`rounded-xl border p-4 cursor-pointer transition-all active:scale-[0.98] ${
                isHuman
                  ? "bg-pizarra-100 border-pizarra-300"
                  : "bg-white border-pizarra-200 hover:border-pizarra-300"
              }`}
              onClick={() => router.push(`/runs/${encodeURIComponent(run.fileName)}`)}
            >
              {/* Header: Rank + Model */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl w-6 flex-shrink-0">
                  {index < 3 ? MEDAL_ICONS[index] : (
                    <span className="text-pizarra-400 text-sm font-medium">{index + 1}</span>
                  )}
                </span>
                <span className="inline-flex items-center px-3 py-1 rounded-lg bg-gradient-to-r from-sidra-500 to-sidra-600 text-white text-sm font-semibold">
                  {modelLabel}
                </span>
                {isHuman ? (
                  <span className="text-lg">👤</span>
                ) : providerLogo ? (
                  <Image
                    src={providerLogo}
                    alt={`${run.provider} logo`}
                    width={20}
                    height={20}
                    className="object-contain"
                  />
                ) : null}
                <svg
                  className="w-4 h-4 text-pizarra-300 ml-auto flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>

              {/* Stats: 3 columnas */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-pizarra-50 rounded-lg py-2 px-1">
                  <div className="text-xs text-pizarra-500 mb-0.5">Cash</div>
                  <div className="font-bold text-green-600 text-sm">{formatEur(run.cashGenerated)}</div>
                </div>
                <div className="bg-pizarra-50 rounded-lg py-2 px-1">
                  <div className="text-xs text-pizarra-500 mb-0.5">Cost</div>
                  <div className="font-medium text-amber-600 text-sm">{costDisplay}</div>
                </div>
                <div className="bg-pizarra-50 rounded-lg py-2 px-1">
                  <div className="text-xs text-pizarra-500 mb-0.5">Tokens</div>
                  <div className="font-medium text-pizarra-600 text-sm">{tokensDisplay}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Desktop: Tabla
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
              const providerLogo = getProviderLogo(run.provider);

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
                    {isHuman ? (
                      <span className="text-xl" role="img" aria-label="Persona">👤</span>
                    ) : providerLogo ? (
                      <Image
                        src={providerLogo}
                        alt={`${run.provider} logo`}
                        width={24}
                        height={24}
                        className="object-contain"
                      />
                    ) : null}
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
