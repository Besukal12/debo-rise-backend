import { beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import request from "supertest";
import { uploadHelpImage } from "../../src/modules/help/help.upload.js";
import { Server as SocketIOServer } from "socket.io";
import {
  io as createSocketClient,
  type Socket as ClientSocket,
} from "socket.io-client";
import app from "../../src/app.js";
import { createAccessToken } from "../../src/lib/token.js";
import {
  createHelpReplySchema,
  createHelpRequestSchema,
  listHelpRequestsSchema,
} from "../../src/modules/help/help.schema.js";
import { configureHelpSocket } from "../../src/modules/help/help.socket.js";
import { parseHelpImage } from "../../src/modules/help/help.upload.js";
import {
  attachReplyImage,
  attachRequestImage,
} from "../../src/modules/help/help.service.js";
import { getPrismaMock } from "../setup.js";

vi.mock("../../src/modules/help/help.upload.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/modules/help/help.upload.js")>();
  return {
    ...actual,
    uploadHelpImage: vi.fn().mockResolvedValue(
      "https://example.test/uploaded-help.jpg",
    ),
  };
});

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

async function connectSocket(
  role: "STUDENT" | "MENTOR" | "ADMIN",
  userId = role === "STUDENT" ? studentId : mentorId,
): Promise<{
  client: ClientSocket;
  close: () => Promise<void>;
}> {
  const server = createServer(app);
  const socketServer = new SocketIOServer(server, {
    cors: { origin: true },
    transports: ["websocket"],
  });
  const detachPublisher = configureHelpSocket(socketServer);
  await new Promise<void>((resolve) => server.listen(0, resolve));

  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Test socket server did not bind to a TCP port");

  const client = createSocketClient(`http://127.0.0.1:${address.port}`, {
    auth: { token: bearerToken(role, userId).slice("Bearer ".length) },
    transports: ["websocket"],
    forceNew: true,
  });
  try {
    await new Promise<void>((resolve, reject) => {
      client.once("connect", resolve);
      client.once("connect_error", reject);
    });
  } catch (error) {
    client.disconnect();
    detachPublisher();
    await new Promise<void>((resolve) => socketServer.close(() => resolve()));
    throw error;
  }

  return {
    client,
    close: async () => {
      client.disconnect();
      detachPublisher();
      await new Promise<void>((resolve) => socketServer.close(() => resolve()));
    },
  };
}

function joinHelpRequest(client: ClientSocket) {
  return new Promise<{ ok: boolean; error?: string }>((resolve) => {
    client.emit("help:request:join", { requestId }, resolve);
  });
}

function joinHelpQueue(client: ClientSocket) {
  return new Promise<{ ok: boolean; error?: string }>((resolve) => {
    client.emit("help:queue:join", resolve);
  });
}

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

  it("accepts the image/jpg alias and normalizes it to image/jpeg", () => {
    const buffer = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
    const req = {
      get: () => "image/jpg",
      body: buffer,
    } as unknown as import("express").Request;

    expect(parseHelpImage(req)).toEqual({
      buffer,
      contentType: "image/jpeg",
    });
  });
});

describe("help request HTTP routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(uploadHelpImage).mockResolvedValue(
      "https://example.test/uploaded-help.jpg",
    );
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
      request(app).get(`/api/help/requests/${requestId}/replies`),
      request(app)
        .post(`/api/help/requests/${requestId}/replies`)
        .send(replyInput),
    ]);

    expect(responses.map((response) => response.status)).toEqual([
      401, 401, 401, 401, 401,
    ]);
  });

  it("notifies authenticated help-queue subscribers when a request is created", async () => {
    const { client, close } = await connectSocket("MENTOR");
    try {
      expect(await joinHelpQueue(client)).toEqual({ ok: true });
      const requestCreated = new Promise<unknown>((resolve) =>
        client.once("request.created", resolve),
      );

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
      expect(await requestCreated).toMatchObject({
        type: "request.created",
        request: { id: requestId },
      });
    } finally {
      await close();
    }
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

  it("returns a request's saved replies from the authenticated detail endpoint", async () => {
    const savedReply = {
      id: replyId,
      requestId,
      userId: mentorId,
      content: "Check the component export.",
      imageUrl: null,
      isSolution: true,
      verifiedById: mentorId,
    };
    prismaMock.helpRequest.findUnique
      .mockResolvedValueOnce({
        id: requestId,
        userId: studentId,
        status: "SOLVED",
      })
      .mockResolvedValueOnce({
        id: requestId,
        userId: studentId,
        status: "SOLVED",
        replies: [savedReply],
      });

    const response = await request(app)
      .get(`/api/help/requests/${requestId}`)
      .set("Authorization", bearerToken());

    expect(response.status).toBe(200);
    expect(response.body.request.replies).toEqual([savedReply]);
    expect(prismaMock.helpRequest.findUnique).toHaveBeenNthCalledWith(2, {
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
  });

  it("returns request replies from the dedicated replies endpoint", async () => {
    const savedReply = {
      id: replyId,
      requestId,
      userId: mentorId,
      content: "Check the component export.",
      imageUrl: null,
      isSolution: true,
      verifiedById: mentorId,
    };
    prismaMock.helpReply.findMany.mockResolvedValue([savedReply]);

    const response = await request(app)
      .get(`/api/help/requests/${requestId}/replies`)
      .set("Authorization", bearerToken());

    expect(response.status).toBe(200);
    expect(response.body.replies).toEqual([savedReply]);
    expect(prismaMock.helpReply.findMany).toHaveBeenCalledWith({
      where: { requestId, deletedAt: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: {
        user: {
          select: { id: true, fullName: true, avatarUrl: true, role: true },
        },
        verifiedBy: { select: { id: true, fullName: true } },
      },
    });
  });

  it("authorizes request rooms and broadcasts new replies over Socket.IO", async () => {
    const { client, close } = await connectSocket("STUDENT");
    try {
      expect(await joinHelpRequest(client)).toEqual({ ok: true });
      const replyCreated = new Promise<unknown>((resolve) =>
        client.once("reply.created", resolve),
      );

      const response = await request(app)
        .post(`/api/help/requests/${requestId}/replies`)
        .set("Authorization", bearerToken())
        .send(replyInput);

      expect(response.status).toBe(201);
      expect(response.body.reply.id).toBe(replyId);
      expect(await replyCreated).toMatchObject({
        type: "reply.created",
        reply: { id: replyId },
      });
    } finally {
      await close();
    }
  });

  it("denies joining another student's request room and restricts the help queue", async () => {
    const otherStudentId = "aab5a777-5b17-4c7a-83a1-6578061ae6f4";
    const { client, close } = await connectSocket("STUDENT", otherStudentId);
    try {
      expect(await joinHelpRequest(client)).toMatchObject({
        ok: false,
        error: "You cannot access this help request",
      });
      expect(await joinHelpQueue(client)).toMatchObject({
        ok: false,
        error: "You cannot access the help queue",
      });
    } finally {
      await close();
    }
  });

  it("notifies request-room subscribers when a mentor verifies an answer", async () => {
    const { client, close } = await connectSocket("STUDENT");
    try {
      expect(await joinHelpRequest(client)).toEqual({ ok: true });
      const solutionVerified = new Promise<unknown>((resolve) =>
        client.once("reply.solution", resolve),
      );

      const response = await request(app)
        .post(`/api/help/requests/${requestId}/solution`)
        .set("Authorization", bearerToken("MENTOR"))
        .send({ replyId });

      expect(response.status).toBe(200);
      expect(response.body.reply.isSolution).toBe(true);
      expect(prismaMock.$transaction).toHaveBeenCalledOnce();
      expect(await solutionVerified).toMatchObject({
        type: "reply.solution",
        reply: { id: replyId, isSolution: true },
      });
    } finally {
      await close();
    }
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

  it("accepts JPG request images and stores their uploaded URL", async () => {
    const image = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
    const response = await request(app)
      .post(`/api/help/requests/${requestId}/image`)
      .set("Authorization", bearerToken())
      .set("Content-Type", "image/jpg")
      .send(image);

    expect(response.status).toBe(200);
    expect(response.body.request.previewImageUrl).toBe(
      "https://example.test/request.png",
    );
    expect(uploadHelpImage).toHaveBeenCalledWith(
      image,
      "image/jpeg",
      `debo-rise/help-requests/${requestId}`,
    );
  });

  it("rejects image uploads larger than 5 MB", async () => {
    const response = await request(app)
      .post(`/api/help/requests/${requestId}/image`)
      .set("Authorization", bearerToken())
      .set("Content-Type", "image/png")
      .send(Buffer.alloc(5 * 1024 * 1024 + 1));

    expect(response.status).toBe(413);
  });

  it("persists and broadcasts request and reply images over Socket.IO", async () => {
    const { client, close } = await connectSocket("STUDENT");
    try {
      expect(await joinHelpRequest(client)).toEqual({ ok: true });
      const requestImageEvent = new Promise<unknown>((resolve) =>
        client.once("request.image", resolve),
      );
      const replyImageEvent = new Promise<unknown>((resolve) =>
        client.once("reply.image", resolve),
      );
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
      expect(await requestImageEvent).toMatchObject({
        type: "request.image",
        imageUrl: requestImageUrl,
      });
      expect(await replyImageEvent).toMatchObject({
        type: "reply.image",
        replyId,
        imageUrl: replyImageUrl,
      });
    } finally {
      await close();
    }
  });
});
