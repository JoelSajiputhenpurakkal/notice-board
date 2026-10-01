import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession, verifyPassword } from "@/lib/auth";

export async function POST(request: Request) {
  const { email, password } = await request.json();
  if (typeof email !== "string" || typeof password !== "string") return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user || !verifyPassword(password, user.passwordHash)) return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
  createSession(user.id);
  return NextResponse.json({ user: { id: user.id, name: user.name, email: user.email } });
}