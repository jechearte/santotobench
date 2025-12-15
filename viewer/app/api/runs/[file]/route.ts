import { NextRequest, NextResponse } from "next/server";
import { readRunFile } from "@/lib/fs";
import { parseRunDetail } from "@/lib/parseRun";

export const dynamic = "force-dynamic";

/**
 * GET /api/runs/[file]
 * Returns the complete detail of a run
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ file: string }> }
) {
  try {
    const { file } = await params;
    const fileName = decodeURIComponent(file);
    
    // Validate that the file name is safe
    if (!fileName.endsWith(".jsonl") || fileName.includes("/") || fileName.includes("..")) {
      return NextResponse.json(
        { ok: false, error: "Invalid file name" },
        { status: 400 }
      );
    }
    
    const content = await readRunFile(fileName);
    
    if (!content) {
      return NextResponse.json(
        { ok: false, error: "File not found" },
        { status: 404 }
      );
    }
    
    const detail = parseRunDetail(fileName, content);
    
    return NextResponse.json({
      ok: true,
      ...detail,
    });
  } catch (error) {
    console.error("Error en GET /api/runs/[file]:", error);
    return NextResponse.json(
      { ok: false, error: "Error getting run detail" },
      { status: 500 }
    );
  }
}





