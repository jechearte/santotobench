import { notFound } from "next/navigation";
import Link from "next/link";
import { TurnNavigator } from "@/components/TurnNavigator";
import { StatsCard } from "@/components/StatsCard";
import { ChartTabs } from "@/components/ChartTabs";
import { RunDetail } from "@/lib/types";
import { formatEur, formatNumber } from "@/lib/parseRun";

export const dynamic = "force-static";
export const revalidate = false;
export const dynamicParams = false;

export async function generateStaticParams(): Promise<Array<{ file: string }>> {
  const { listRunFiles } = await import("@/lib/fs");
  const files = await listRunFiles();
  // Next will URL-encode params as needed; our page still decodes defensively.
  return files.map((file) => ({ file }));
}

async function getRunDetail(fileName: string): Promise<RunDetail | null> {
  const { readRunFile } = await import("@/lib/fs");
  const { parseRunDetail } = await import("@/lib/parseRun");
  
  // Validate file name
  if (!fileName.endsWith(".jsonl") || fileName.includes("/") || fileName.includes("..")) {
    return null;
  }
  
  const content = await readRunFile(fileName);
  if (!content) {
    return null;
  }
  
  return parseRunDetail(fileName, content);
}

interface PageProps {
  params: { file: string };
}

export default async function RunDetailPage({ params }: PageProps) {
  const { listRunFiles } = await import("@/lib/fs");

  const { file } = params;
  const fileName = decodeURIComponent(file);
  const detail = await getRunDetail(fileName);
  
  if (!detail) {
    notFound();
  }
  
  const { summary, turns } = detail;
  const totalToolCalls = turns.reduce((sum, turn) => {
    const count = typeof turn.tool_calls_count === "number" ? turn.tool_calls_count : 0;
    const fallbackCount = Array.isArray(turn.tool_calls) ? turn.tool_calls.length : 0;
    return sum + (count || fallbackCount);
  }, 0);

  // Calculate previous / next run
  const allFiles = await listRunFiles();
  const currentIndex = allFiles.indexOf(fileName);
  const prevFile = currentIndex < allFiles.length - 1 ? allFiles[currentIndex + 1] : null;
  const nextFile = currentIndex > 0 ? allFiles[currentIndex - 1] : null;
  
  // Calculate some additional metrics
  const turnsWithUnmet = turns.filter(t => 
    t.demand_realized.unmet.pintxo > 0 || 
    t.demand_realized.unmet.bocadillo > 0 || 
    t.demand_realized.unmet.sidra > 0
  ).length;
  
  const totalOrders = turns.filter(t => 
    t.agent_actions.some(a => a.type === "place_order")
  ).length;
  
  return (
    <div className="space-y-8">
      {/* Navigation bar between runs */}
      <div className="flex flex-col gap-3 bg-white rounded-2xl border border-pizarra-200 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-pizarra-500 hover:text-pizarra-700 cursor-pointer text-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span>Back</span>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-3 py-1.5 rounded-xl bg-gradient-to-r from-sidra-500 to-sidra-600 text-white text-sm font-semibold shadow-sm">
              {summary.model || summary.modelShort || "Model"}
            </span>
          </div>
        </div>
      </div>

      {/* Key metrics: cash generated, total cost, total tokens */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatsCard
          title="Cash generated"
          value={formatEur(summary.cashGenerated)}
          icon="📈"
          color="green"
        />
        <StatsCard
          title="Total LLM cost"
          value={formatEur(summary.totalCostEur)}
          icon="🤖"
          color="amber"
        />
        <StatsCard
          title="Total tokens"
          value={formatNumber(summary.totalTokensIn + summary.totalTokensOut)}
          subtitle={`↓${formatNumber(summary.totalTokensIn)} / ↑${formatNumber(summary.totalTokensOut)}`}
          icon="⚡"
          color="default"
        />
        <StatsCard
          title="Total tool calls"
          value={formatNumber(totalToolCalls)}
          icon="🛠️"
          color="blue"
        />
      </div>

      {/* Charts: cash, prices, etc. */}
      <ChartTabs turns={turns} />
      
      {/* Turn timeline: navigation with arrows between turns */}
      <TurnNavigator turns={turns} />
    </div>
  );
}
