import { Prisma } from "../../generated/prisma/client.js";
import type { Role } from "../../generated/prisma/enums.js";
import { prisma } from "../../config/prisma.js";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "../../core/CustomError.js";
import { publishHelpEvent } from "./help.events.js";
import type {
  CreateHelpReplyInput,
  CreateHelpRequestInput,
  ListHelpRequestsInput,
} from "./help.schema.js";

const staffRoles: Role[] = ["MENTOR", "SUPPORTER", "CIRCLE_LEAD", "ADMIN"];

function canAccessRequest(userId: string, role: Role, ownerId: string): boolean {
  return userId === ownerId || staffRoles.includes(role);
}

async function findAccessibleRequest(
  requestId: string,
  userId: string,
  role: Role,
) {
  const helpRequest = await prisma.helpRequest.findUnique({
    where: { id: requestId, deletedAt: null },
    select: { id: true, userId: true, status: true },
  });

  if (!helpRequest) throw new NotFoundError("Help request not found");
  if (!canAccessRequest(userId, role, helpRequest.userId))
    throw new ForbiddenError("You cannot access this help request");

  return helpRequest;
}

export async function createHelpRequest(
  userId: string,
  data: CreateHelpRequestInput,
) {
  try {
    const helpRequest = await prisma.helpRequest.create({
      data: { ...data, userId },
      include: {
        user: { select: { id: true, fullName: true, avatarUrl: true } },
      },
    });
    publishHelpEvent(helpRequest.id, {
      type: "request.created",
      request: helpRequest,
    });
    return helpRequest;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      throw new NotFoundError("Lesson not found");
    }
    throw error;
  }
}

export async function listHelpRequests(
  userId: string,
  role: Role,
  query: ListHelpRequestsInput,
) {
  const where = {
    deletedAt: null,
    ...(staffRoles.includes(role) ? {} : { userId }),
    ...(query.status ? { status: query.status } : {}),
  };

  const requests = await prisma.helpRequest.findMany({
    where,
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    include: {
      user: { select: { id: true, fullName: true, avatarUrl: true } },
      _count: { select: { replies: true } },
    },
  });
  const hasMore = requests.length > query.limit;
  const items = hasMore ? requests.slice(0, query.limit) : requests;

  return {
    requests: items,
    nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
  };
}

export async function getHelpRequest(
  requestId: string,
  userId: string,
  role: Role,
) {
  await findAccessibleRequest(requestId, userId, role);
  const helpRequest = await prisma.helpRequest.findUnique({
    where: { id: requestId, deletedAt: null },
    include: {
      user: { select: { id: true, fullName: true, avatarUrl: true } },
      replies: {
        where: { deletedAt: null },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        include: {
          user: {
            select: { id: true, fullName: true, avatarUrl: true, role: true },
          },
          verifiedBy: { select: { id: true, fullName: true } },
        },
      },
    },
  });
  if (!helpRequest) throw new NotFoundError("Help request not found");
  return helpRequest;
}

export async function createHelpReply(
  requestId: string,
  userId: string,
  role: Role,
  data: CreateHelpReplyInput,
) {
  const helpRequest = await findAccessibleRequest(requestId, userId, role);
  if (helpRequest.status === "SOLVED" || helpRequest.status === "CLOSED")
    throw new BadRequestError(
      "This help request is no longer accepting replies",
    );

  const reply = await prisma.helpReply.create({
    data: { ...data, requestId, userId },
    include: {
      user: {
        select: { id: true, fullName: true, avatarUrl: true, role: true },
      },
      verifiedBy: { select: { id: true, fullName: true } },
    },
  });
  publishHelpEvent(requestId, { type: "reply.created", reply });
  return reply;
}

export async function verifyHelpReply(
  requestId: string,
  replyId: string,
  mentorId: string,
) {
  const helpRequest = await findAccessibleRequest(
    requestId,
    mentorId,
    "MENTOR",
  );
  if (helpRequest.status === "CLOSED")
    throw new BadRequestError(
      "A closed help request cannot have a verified answer",
    );

  const reply = await prisma.helpReply.findFirst({
    where: { id: replyId, requestId, deletedAt: null },
    select: { id: true },
  });
  if (!reply) throw new NotFoundError("Reply not found");

  const verifiedAt = new Date();
  const verifiedReply = await prisma.$transaction(async (transaction) => {
    await transaction.helpReply.updateMany({
      where: { requestId, isSolution: true },
      data: { isSolution: false, verifiedById: null, verifiedAt: null },
    });
    const updatedReply = await transaction.helpReply.update({
      where: { id: replyId },
      data: { isSolution: true, verifiedById: mentorId, verifiedAt },
      include: {
        user: {
          select: { id: true, fullName: true, avatarUrl: true, role: true },
        },
        verifiedBy: { select: { id: true, fullName: true } },
      },
    });
    await transaction.helpRequest.update({
      where: { id: requestId },
      data: { status: "SOLVED" },
    });
    return updatedReply;
  });

  publishHelpEvent(requestId, {
    type: "reply.solution",
    reply: verifiedReply,
  });
  return verifiedReply;
}

export async function assertCanAttachRequestImage(
  requestId: string,
  userId: string,
  role: Role,
) {
  await findAccessibleRequest(requestId, userId, role);
}

export async function assertCanAttachReplyImage(
  replyId: string,
  userId: string,
  role: Role,
) {
  const reply = await prisma.helpReply.findFirst({
    where: { id: replyId, deletedAt: null },
    select: { id: true, requestId: true, userId: true },
  });
  if (!reply) throw new NotFoundError("Reply not found");
  await findAccessibleRequest(reply.requestId, userId, role);
  if (reply.userId !== userId)
    throw new ForbiddenError("You cannot edit this reply");
  return reply.requestId;
}

export async function attachRequestImage(
  requestId: string,
  userId: string,
  role: Role,
  imageUrl: string,
) {
  await findAccessibleRequest(requestId, userId, role);
  const helpRequest = await prisma.helpRequest.update({
    where: { id: requestId },
    data: { previewImageUrl: imageUrl },
  });
  publishHelpEvent(requestId, { type: "request.image", requestId, imageUrl });
  return helpRequest;
}

export async function attachReplyImage(
  replyId: string,
  userId: string,
  role: Role,
  imageUrl: string,
) {
  const requestId = await assertCanAttachReplyImage(replyId, userId, role);
  const updatedReply = await prisma.helpReply.update({
    where: { id: replyId },
    data: { imageUrl },
  });
  publishHelpEvent(requestId, {
    type: "reply.image",
    replyId,
    requestId,
    imageUrl,
  });
  return updatedReply;
}
