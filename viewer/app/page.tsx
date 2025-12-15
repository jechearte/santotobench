import { RunSummary } from "@/lib/types";
import { formatEur } from "@/lib/parseRun";
import { RunsTable } from "@/components/RunsTable";
import { ScoreScatterTabs } from "@/components/ScoreScatterTabs";

export const dynamic = "force-static";
export const revalidate = false;

async function getRuns(): Promise<RunSummary[]> {
  const { listRunFiles, readRunFile } = await import("@/lib/fs");
  const { parseRunContent, calculateSummary, extractMetaFromContent } = await import("@/lib/parseRun");

  const files = await listRunFiles();
  const summaries: RunSummary[] = [];

  for (const fileName of files) {
    const content = await readRunFile(fileName);
    if (content) {
      const turns = parseRunContent(content);
      const meta = extractMetaFromContent(content);
      const summary = calculateSummary(fileName, turns, meta);
      summaries.push(summary);
    }
  }

  // Sort by cash generated descending
  return summaries.sort((a, b) => b.cashGenerated - a.cashGenerated);
}

async function getStats() {
  const { listRunFiles, readRunFile } = await import("@/lib/fs");
  const { parseRunContent, calculateSummary, extractMetaFromContent } = await import("@/lib/parseRun");
  
  const files = await listRunFiles();
  let totalRuns = 0;
  let totalTurns = 0;
  let totalCost = 0;
  
  for (const fileName of files) {
    const content = await readRunFile(fileName);
    if (content) {
      const turns = parseRunContent(content);
      const meta = extractMetaFromContent(content);
      const summary = calculateSummary(fileName, turns, meta);
      totalRuns++;
      totalTurns += summary.turns;
      totalCost += summary.totalCostEur;
    }
  }
  
  return { totalRuns, totalTurns, totalCost };
}

export default async function HomePage() {
  const runs = await getRuns();
  const stats = await getStats();

  const scatterData = runs.map((run) => ({
    id: run.fileName,
    model: run.model ?? "Model",
    modelShort: run.modelShort,
    provider: run.provider,
    cashGenerated: run.cashGenerated,
    totalCostEur: run.totalCostEur,
    totalTokens: run.totalTokensIn + run.totalTokensOut,
    createdAt: run.createdAt,
  }));
  
  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-pizarra-900 via-pizarra-800 to-pizarra-900 text-white p-8 md:p-12">
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-sidra-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-txakoli-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
        
        <div className="relative z-10 flex flex-col gap-4 md:gap-6">
          <h1 className="text-4xl md:text-5xl font-bold leading-tight">
            SantotoBench
          </h1>
          <p className="text-lg text-pizarra-200 leading-relaxed w-full">
            A benchmark that evaluates an AI agent&apos;s ability to manage a sandwich stand. 
            The agent must manage stock, determine pricing strategy and assign tasks to 
            the stand&apos;s workers.
          </p>
        </div>
      </section>

      {/* Gráficos comparativos */}
      {runs.length > 0 && <ScoreScatterTabs data={scatterData} />}

      {/* Runs table */}
      {runs.length > 0 ? (
        <section>
          <div className="flex items-center gap-3 mb-6">
            <span className="text-3xl">🏆</span>
            <h2 className="text-2xl font-bold text-pizarra-800">Leaderboard</h2>
          </div>

          <RunsTable runs={runs} />
        </section>
      ) : (
        <section className="text-center py-12 bg-white rounded-2xl border border-dashed border-pizarra-300">
          <div className="text-6xl mb-4">📭</div>
          <h3 className="text-xl font-semibold text-pizarra-700 mb-2">
            No runs yet
          </h3>
          <p className="text-pizarra-500 max-w-md mx-auto mb-6">
            Copy <code className="bg-pizarra-100 px-2 py-0.5 rounded font-mono text-sm">.jsonl</code> files to the{" "}
            <code className="bg-pizarra-100 px-2 py-0.5 rounded font-mono text-sm">data/</code> folder to start visualizing.
          </p>
          <div className="bg-pizarra-50 rounded-xl p-4 max-w-lg mx-auto font-mono text-sm text-left text-pizarra-700">
            <span className="text-pizarra-400">$</span> cp ../runs/*.jsonl ./data/
          </div>
        </section>
      )}
    </div>
  );
}
