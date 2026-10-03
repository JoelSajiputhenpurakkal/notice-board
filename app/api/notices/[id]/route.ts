import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });

  const notice = await prisma.notice.findUnique({
    where: { id: params.id },
    select: { id: true, authorId: true }
  });
  if (!notice) return NextResponse.json({ error: "Notice not found." }, { status: 404 });
  if (notice.authorId !== user.id) {
    return NextResponse.json({ error: "You can only delete notices you created." }, { status: 403 });
  }

  await prisma.notice.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
