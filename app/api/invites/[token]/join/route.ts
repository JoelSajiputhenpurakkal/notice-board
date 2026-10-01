import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(_request: Request, { params }: { params: { token: string } }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in to join this community." }, { status: 401 });
  const invite = await prisma.invite.findUnique({ where: { token: params.token } });
  if (!invite || invite.expiresAt < new Date()) return NextResponse.json({ error: "This invite link is invalid or expired." }, { status: 404 });
  await prisma.membership.upsert({ where: { userId_communityId: { userId: user.id, communityId: invite.communityId } }, update: {}, create: { userId: user.id, communityId: invite.communityId } });
  return NextResponse.json({ communityId: invite.communityId });
}