import { NextResponse } from "next/server";
import { currentUser, membership } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });

  const member = await membership(user.id, params.id);
  if (!member || member.role !== "ADMIN") {
    return NextResponse.json({ error: "Only community admins can delete a group." }, { status: 403 });
  }

  await prisma.community.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
