import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession, hashPassword } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const { name, email, password } = await request.json();
    if (typeof name !== "string" || name.trim().length < 2 || name.length > 80) return NextResponse.json({ error: "Enter a name between 2 and 80 characters." }, { status: 400 });
    if (typeof email !== "string" || !/^\S+@\S+\.\S+$/.test(email) || email.length > 254) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
    if (typeof password !== "string" || password.length < 10 || password.length > 200) return NextResponse.json({ error: "Password must be at least 10 characters." }, { status: 400 });
    const user = await prisma.user.create({ data: { name: name.trim(), email: email.trim().toLowerCase(), passwordHash: hashPassword(password) }, select: { id: true, name: true, email: true } });
    createSession(user.id);
    return NextResponse.json({ user }, { status: 201 });
  } catch (error: any) {
    if (error?.code === "P2002") return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    return NextResponse.json({ error: "Could not create account." }, { status: 500 });
  }
}