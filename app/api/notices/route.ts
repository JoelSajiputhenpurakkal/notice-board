import { NextResponse } from "next/server";
import { currentUser, membership } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const communityId = new URL(request.url).searchParams.get("communityId");
  if (!communityId || !await membership(user.id, communityId)) return NextResponse.json({ error: "Community not found." }, { status: 404 });
  const notices = await prisma.notice.findMany({ where: { communityId }, include: { author: { select: { name: true } }, acknowledgements: { select: { userId: true } } }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ notices: notices.map((notice) => ({ ...notice, author: notice.author.name, acknowledgements: notice.acknowledgements.length, completed: notice.acknowledgements.some((a) => a.userId === user.id) })) });
}
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const { communityId, title, subtitle = "", body, action = "Mark as read" } = await request.json();
  const member = await membership(user.id, communityId);
  if (!member || member.role !== "ADMIN") return NextResponse.json({ error: "Only community admins can publish notices." }, { status: 403 });
  if (typeof title !== "string" || title.trim().length < 3 || title.length > 120 || typeof body !== "string" || body.trim().length < 1 || body.length > 10000) return NextResponse.json({ error: "Enter a title and notice details." }, { status: 400 });
  const notice = await prisma.notice.create({ data: { communityId, authorId: user.id, title: title.trim(), subtitle: typeof subtitle === "string" ? subtitle.slice(0, 200).trim() : "", body: body.trim(), action: typeof action === "string" ? action.slice(0, 40) : "Mark as read" }, include: { author: { select: { name: true } } } });
  return NextResponse.json({ notice: { ...notice, author: notice.author.name, acknowledgements: 0, completed: false } }, { status: 201 });
}