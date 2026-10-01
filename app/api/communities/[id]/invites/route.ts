import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { currentUser, membership } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const member = await membership(user.id, params.id);
  if (!member || member.role !== "ADMIN") return NextResponse.json({ error: "Only community admins can create invites." }, { status: 403 });
  const token = randomBytes(24).toString("base64url");
  const invite = await prisma.invite.create({ data: { token, communityId: params.id, creatorId: user.id, expiresAt: new Date(Date.now() + 7 * 86400000) } });
  return NextResponse.json({ url: new URL("/join/" + invite.token, request.url).toString(), expiresAt: invite.expiresAt }, { status: 201 });
}