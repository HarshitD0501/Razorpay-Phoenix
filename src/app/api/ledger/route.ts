/** The audit trail, newest first. Read-only — there is no PUT or DELETE here. */
import { NextResponse } from "next/server";
import { read } from "@/core/audit";

export async function GET() {
  const rows = read();
  return NextResponse.json({
    count: rows.length,
    // Append-only means the file order IS the causal order; reversing for
    // display does not rewrite anything.
    rows: rows.slice(-60).reverse(),
  });
}
