import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Operation = {
  operationId: string;
  operationType: "CREATE_GROUP" | "CREATE_NOTICE" | "ACKNOWLEDGE_NOTICE";
  entityId: string;
  groupId?: string;
  payload: string;
};

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in to sync changes." }, { status: 401 });

  let operations: Operation[];
  try {
    const body = await request.json();
    if (!Array.isArray(body.operations)) throw new Error("Expected an operations array.");
    operations = body.operations;
  } catch {
    return NextResponse.json({ error: "Invalid sync request." }, { status: 400 });
  }

  const results = [];
  for (const operation of operations) {
    try {
      if (!operation?.operationId || !operation.entityId || typeof operation.payload !== "string") {
        throw new Error("The queued operation is incomplete.");
      }
      const payload = JSON.parse(operation.payload);
      const status = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        if (operation.operationType === "CREATE_GROUP") {
          const groupId = String(payload.id || operation.entityId);
          const existing = await tx.community.findUnique({ where: { id: groupId } });
          if (existing) {
            const membership = await tx.membership.findUnique({ where: { userId_communityId: { userId: user.id, communityId: groupId } } });
            if (!membership) throw new Error("A group with this ID already exists.");
            return "DUPLICATE";
          }
          const name = typeof payload.name === "string" ? payload.name.trim() : "";
          if (name.length < 2 || name.length > 80) throw new Error("Group name must be between 2 and 80 characters.");
          await tx.community.create({
            data: {
              id: groupId,
              name,
              description: typeof payload.description === "string" ? payload.description.slice(0, 300) : "",
              memberships: { create: { userId: user.id, role: "ADMIN" } }
            }
          });
          return "COMMITTED";
        }

        if (operation.operationType === "CREATE_NOTICE") {
          const noticeId = String(payload.id || operation.entityId);
          const existing = await tx.notice.findUnique({ where: { id: noticeId } });
          if (existing) {
            if (existing.authorId !== user.id) throw new Error("A notice with this ID already exists.");
            return "DUPLICATE";
          }
          const communityId = String(payload.groupId || operation.groupId || "");
          const membership = await tx.membership.findUnique({ where: { userId_communityId: { userId: user.id, communityId } } });
          if (!membership || membership.role !== "ADMIN") throw new Error("You must be a group admin to publish a notice.");
          const title = typeof payload.title === "string" ? payload.title.trim() : "";
          const body = typeof payload.body === "string" ? payload.body.trim() : "";
          if (title.length < 3 || title.length > 120 || !body || body.length > 10000) throw new Error("The notice title or details are invalid.");
          await tx.notice.create({
            data: {
              id: noticeId,
              communityId,
              authorId: user.id,
              title,
              subtitle: typeof payload.subtitle === "string" ? payload.subtitle.slice(0, 200).trim() : "",
              body,
              action: typeof payload.action === "string" ? payload.action.slice(0, 40) : "Mark as read"
            }
          });
          return "COMMITTED";
        }

        if (operation.operationType === "ACKNOWLEDGE_NOTICE") {
          const noticeId = String(payload.noticeId || operation.entityId);
          const notice = await tx.notice.findUnique({ where: { id: noticeId } });
          if (!notice) throw new Error("The notice no longer exists.");
          const membership = await tx.membership.findUnique({ where: { userId_communityId: { userId: user.id, communityId: notice.communityId } } });
          if (!membership) throw new Error("You are not a member of this group.");
          const prior = await tx.acknowledgement.findUnique({ where: { noticeId_userId: { noticeId, userId: user.id } } });
          if (prior) return "DUPLICATE";
          await tx.acknowledgement.create({ data: { noticeId, userId: user.id } });
          return "COMMITTED";
        }

        throw new Error("This operation type is not supported.");
      });
      results.push({ operationId: operation.operationId, entityId: operation.entityId, status });
    } catch (error: any) {
      results.push({
        operationId: operation?.operationId || "",
        entityId: operation?.entityId || "",
        status: "FAILED",
        error: error?.message || "Could not save this queued change."
      });
    }
  }

  return NextResponse.json({ results });
}
