import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../../src/app.js";
import { createAccessToken } from "../../src/lib/token.js";
import {
  createHelpReplySchema,
  createHelpRequestSchema,
  listHelpRequestsSchema,
} from "../../src/modules/help/help.schema.js";
import {
  publishHelpEvent,
  subscribeToHelpRequest,
} from "../../src/modules/help/help.events.js";
import {
  attachReplyImage,
  attachRequestImage,
} from "../../src/modules/help/help.service.js";
import { getPrismaMock } from "../setup.js";

const prismaMock = getPrismaMock();
const requestId = "b8092df4-ff86-4e0b-96a9-3c6dcc2dfac7";
const replyId = "3947b122-242a-4bb2-8b9e-75b331ad832c";
const studentId = "f7b4b6a8-4432-43ce-9d65-8f1c5d318c78";
const mentorId = "55ac5ad2-df82-43b5-9a45-cbd2f0876d21";
const helpRequestInput = {
  title: "Cannot render my page",
  whatDidYouTry: "I checked the browser console.",
};
const replyInput = { content: "Check that your component is exported." };

function bearerToken(
  role: "STUDENT" | "MENTOR" | "ADMIN" = "STUDENT",
  userId = role === "STUDENT" ? studentId : mentorId,
) {
  prismaMock.user.findFirst.mockResolvedValue({
    id: userId,
    role,
    ageGroup: "ADULT",
    parentConsent: true,
  });
  return `Bearer ${createAccessToken(userId)}`;
}

describe("help request validation", () => {
  it("validates request/reply content and rejects unknown fields", () => {
    expect(createHelpRequestSchema.safeParse(helpRequestInput).success).toBe(
      true,
    );
    expect(
      createHelpRequestSchema.safeParse({
        ...helpRequestInput,
        stuckMinutes: 0,
      }).success,
    ).toBe(false);
    expect(
      createHelpRequestSchema.safeParse({
        ...helpRequestInput,
        previewImageUrl: "https://example.com/image.png",
      }).success,
    ).toBe(false);
    expect(createHelpReplySchema.safeParse(replyInput).success).toBe(true);
    expect(createHelpReplySchema.safeParse({ content: " " }).success).toBe(
      false,
    );
    expect(listHelpRequestsSchema.parse({ limit: "10" })).toMatchObject({
      limit: 10,
    });
    expect(listHelpRequestsSchema.safeParse({ limit: "100" }).success).toBe(
      false,
    );
  });
});

describe("help request HTTP routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.helpRequest.findUnique.mockResolvedValue({
      id: requestId,
      userId: studentId,
      status: "OPEN",
    });
    prismaMock.helpRequest.create.mockResolvedValue({
      id: requestId,
      ...helpRequestInput,
      userId: studentId,
      status: "OPEN",
      previewImageUrl: null,
    });
    prismaMock.helpRequest.findMany.mockResolvedValue([]);
    prismaMock.helpRequest.update.mockResolvedValue({
      id: requestId,
      previewImageUrl: "https://example.test/request.png",
    });
    prismaMock.helpReply.create.mockResolvedValue({
      id: replyId,
      ...replyInput,
      requestId,
      userId: studentId,
      imageUrl: null,
      isSolution: false,
    });
    prismaMock.helpReply.findFirst.mockResolvedValue({
      id: replyId,
      requestId,
      userId: studentId,
    });
    prismaMock.helpReply.update.mockResolvedValue({
      id: replyId,
      requestId,
      userId: studentId,
      imageUrl: "https://example.test/reply.png",
    });
    prismaMock.$transaction.mockImplementation(async (callback) => {
      const transaction = {
        helpReply: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          update: vi.fn().mockResolvedValue({
            id: replyId,
            requestId,
            isSolution: true,
            verifiedById: mentorId,
          }),
        },
        helpRequest: {
          update: vi.fn().mockResolvedValue({ id: requestId, status: "SOLVED" }),
        },
      };
      return callback(transaction);
    });
  });

  it("requires authentication for help-request APIs", async () => {
    const responses = await Promise.all([
      request(app).get("/api/help/requests"),
      request(app).post("/api/help/requests").send(helpRequestInput),
      request(app).get(`/api/help/requests/${requestId}`),
      request(app)
        .post(`/api/help/requests/${requestId}/replies`)
        .send(replyInput),
    ]);

    expect(responses.map((response) => response.status)).toEqual([
      401, 401, 401, 401,
    ]);
  });

  it("creates a request and publishes its real-time event", async () => {
    const onEvent = vi.fn();
    const unsubscribe = subscribeToHelpRequest(requestId, onEvent);

    const response = await request(app)
      .post("/api/help/requests")
      .set("Authorization", bearerToken())
      .send(helpRequestInput);

    expect(response.status).toBe(201);
    expect(response.body.request.id).toBe(requestId);
    expect(prismaMock.helpRequest.create).toHaveBeenCalledWith({
      data: { ...helpRequestInput, userId: studentId },
      include: {
        user: { select: { id: true, fullName: true, avatarUrl: true } },
      },
    });
    expect(onEvent).toHaveBeenCalledWith({
      type: "request.created",
      request: expect.objectContaining({ id: requestId }),
    });
    unsubscribe();
  });

  it("restricts student lists to their own requests", async () => {
    const response = await request(app)
      .get("/api/help/requests?limit=10")
      .set("Authorization", bearerToken());

    expect(response.status).toBe(200);
    expect(prismaMock.helpRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null, userId: studentId },
        take: 11,
      }),
    );
  });

  it("does not expose another student's request", async () => {
    const otherStudentId = "aab5a777-5b17-4c7a-83a1-6578061ae6f4";
    const response = await request(app)
      .get(`/api/help/requests/${requestId}`)
      .set("Authorization", bearerToken("STUDENT", otherStudentId));

    expect(response.status).toBe(403);
  });

  it("creates replies and publishes them to the request stream", async () => {
    const onEvent = vi.fn();
    const unsubscribe = subscribeToHelpRequest(requestId, onEvent);

    const response = await request(app)
      .post(`/api/help/requests/${requestId}/replies`)
      .set("Authorization", bearerToken())
      .send(replyInput);

    expect(response.status).toBe(201);
    expect(response.body.reply.id).toBe(replyId);
    expect(onEvent).toHaveBeenCalledWith({
      type: "reply.created",
      reply: expect.objectContaining({ id: replyId }),
    });
    unsubscribe();
  });

  it("allows mentors to verify a reply and broadcasts the verified answer", async () => {
    const onEvent = vi.fn();
    const unsubscribe = subscribeToHelpRequest(requestId, onEvent);

    const response = await request(app)
      .post(`/api/help/requests/${requestId}/solution`)
      .set("Authorization", bearerToken("MENTOR"))
      .send({ replyId });

    expect(response.status).toBe(200);
    expect(response.body.reply.isSolution).toBe(true);
    expect(prismaMock.$transaction).toHaveBeenCalledOnce();
    expect(onEvent).toHaveBeenCalledWith({
      type: "reply.solution",
      reply: expect.objectContaining({ id: replyId, isSolution: true }),
    });
    unsubscribe();
  });

  it("prevents students from verifying answers", async () => {
    const response = await request(app)
      .post(`/api/help/requests/${requestId}/solution`)
      .set("Authorization", bearerToken())
      .send({ replyId });

    expect(response.status).toBe(403);
    expect(prismaMock.helpReply.findFirst).not.toHaveBeenCalled();
  });

  it("rejects image uploads whose bytes do not match the declared image type", async () => {
    const response = await request(app)
      .post(`/api/help/requests/${requestId}/image`)
      .set("Authorization", bearerToken())
      .set("Content-Type", "image/png")
      .send(Buffer.from("not an image"));

    expect(response.status).toBe(400);
    expect(prismaMock.helpRequest.findUnique).not.toHaveBeenCalled();
  });

  it("rejects image uploads larger than 5 MB", async () => {
    const response = await request(app)
      .post(`/api/help/requests/${requestId}/image`)
      .set("Authorization", bearerToken())
      .set("Content-Type", "image/png")
      .send(Buffer.alloc(5 * 1024 * 1024 + 1));

    expect(response.status).toBe(413);
  });

  it("streams live help events over the authenticated SSE endpoint", async () => {
    const server = app.listen(0);
    const controller = new AbortController();
    try {
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("Test server did not bind to a TCP port");
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/help/requests/${requestId}/events`,
        {
          headers: { Authorization: bearerToken() },
          signal: controller.signal,
        },
      );
      expect(response.headers.get("content-type")).toContain("text/event-stream");

      const reader = response.body?.getReader();
      expect(reader).toBeDefined();
      const decoder = new TextDecoder();
      const connected = await reader!.read();
      expect(decoder.decode(connected.value)).toContain(": connected");

      publishHelpEvent(requestId, {
        type: "reply.created",
        reply: { id: replyId },
      });
      const update = await reader!.read();
      expect(decoder.decode(update.value)).toContain(
        'event: reply.created\ndata: {"type":"reply.created","reply":{"id":"3947b122-242a-4bb2-8b9e-75b331ad832c"}}',
      );
      await reader!.cancel();
    } finally {
      controller.abort();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("persists request and reply images before broadcasting them", async () => {
    const onEvent = vi.fn();
    const unsubscribe = subscribeToHelpRequest(requestId, onEvent);
    const requestImageUrl = "https://example.test/request.png";
    const replyImageUrl = "https://example.test/reply.png";

    await attachRequestImage(
      requestId,
      studentId,
      "STUDENT",
      requestImageUrl,
    );
    await attachReplyImage(replyId, studentId, "STUDENT", replyImageUrl);

    expect(prismaMock.helpRequest.update).toHaveBeenCalledWith({
      where: { id: requestId },
      data: { previewImageUrl: requestImageUrl },
    });
    expect(prismaMock.helpReply.update).toHaveBeenCalledWith({
      where: { id: replyId },
      data: { imageUrl: replyImageUrl },
    });
    expect(onEvent).toHaveBeenNthCalledWith(1, {
      type: "request.image",
      requestId,
      imageUrl: requestImageUrl,
    });
    expect(onEvent).toHaveBeenNthCalledWith(2, {
      type: "reply.image",
      replyId,
      requestId,
      imageUrl: replyImageUrl,
    });
    unsubscribe();
  });

  it("only sends a published event to subscribers of that request", () => {
    const received: unknown[] = [];
    const unsubscribe = subscribeToHelpRequest(requestId, (event) =>
      received.push(event),
    );

    publishHelpEvent("different-request", {
      type: "request.image",
      requestId: "different-request",
      imageUrl: "https://example.test/image.png",
    });
    publishHelpEvent(requestId, {
      type: "request.image",
      requestId,
      imageUrl: "https://example.test/image.png",
    });

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ type: "request.image", requestId });
    unsubscribe();
  });
});
