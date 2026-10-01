import { NextResponse } from "next/server";
import { currentUser, membership } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const notice = await prisma.notice.findUnique({ where: { id: params.id }, select: { id: true, communityId: true } });
  if (!notice || !await membership(user.id, notice.communityId)) return NextResponse.json({ error: "Notice not found." }, { status: 404 });
  await prisma.acknowledgement.upsert({ where: { noticeId_userId: { noticeId: notice.id, userId: user.id } }, update: {}, create: { noticeId: notice.id, userId: user.id } });
  return NextResponse.json({ ok: true });
}