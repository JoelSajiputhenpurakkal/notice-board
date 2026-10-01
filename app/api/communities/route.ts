import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const rows = await prisma.membership.findMany({ where: { userId: user.id }, include: { community: true }, orderBy: { createdAt: "asc" } });
  return NextResponse.json({ communities: rows.map((row) => ({ ...row.community, role: row.role, members: 0 })) });
}
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const { name, description = "" } = await request.json();
  if (typeof name !== "string" || name.trim().length < 2 || name.length > 80 || typeof description !== "string" || description.length > 300) return NextResponse.json({ error: "Check the community name and description." }, { status: 400 });
  const community = await prisma.community.create({ data: { name: name.trim(), description: description.trim(), memberships: { create: { userId: user.id, role: "ADMIN" } } } });
  return NextResponse.json({ community: { ...community, role: "ADMIN", members: 1 } }, { status: 201 });
}