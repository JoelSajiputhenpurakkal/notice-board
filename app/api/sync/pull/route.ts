import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in to sync changes." }, { status: 401 });
  const cursor = Number(new URL(request.url).searchParams.get("cursor") || 0);
  return NextResponse.json({ latestCursor: Number.isFinite(cursor) ? cursor : 0, changes: [] });
}
