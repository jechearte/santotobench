import { NextResponse } from "next/server";
import { listRunFiles, readRunFile } from "@/lib/fs";
import { parseRunContent, calculateSummary, extractMetaFromContent } from "@/lib/parseRun";
import { RunSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/runs
 * Returns the list of available runs with their basic metrics
 */
export async function GET() {
  try {
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
    
    return NextResponse.json({
      ok: true,
      runs: summaries,
      total: summaries.length,
    });
  } catch (error) {
    console.error("Error en GET /api/runs:", error);
    return NextResponse.json(
      { ok: false, error: "Error getting the list of runs" },
      { status: 500 }
    );
  }
}

