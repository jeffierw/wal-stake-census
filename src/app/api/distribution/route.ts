import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const raw = await readFile(path.join(process.cwd(), "data/snapshot.json"), "utf8");
  return NextResponse.json(JSON.parse(raw));
}
