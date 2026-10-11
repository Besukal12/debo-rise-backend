import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: { findFirst: vi.fn() },
    track: { findUnique: vi.fn() },
    module: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("../../src/config/prisma.js", () => ({ prisma: prismaMock }));

import app from "../../src/app.js";
import { Prisma } from "../../src/generated/prisma/client.js";
import { createAccessToken } from "../../src/lib/token.js";
import {
  createModuleSchema,
  moduleIdSchema,
  moduleListQuerySchema,
  updateModuleSchema,
} from "../../src/modules/module/module.schema.js";

const trackId = "b8092df4-ff86-4e0b-96a9-3c6dcc2dfac7";
const moduleId = "3947b122-242a-4bb2-8b9e-75b331ad832c";
const anotherModuleId = "aab5a777-5b17-4c7a-83a1-6578061ae6f4";

function bearerToken(role: "ADMIN" | "STUDENT" = "ADMIN"): string {
  prismaMock.user.findFirst.mockResolvedValue({
    id: "f7b4b6a8-4432-43ce-9d65-8f1c5d318c78",
    role,
    ageGroup: "ADULT",
    parentConsent: true,
  });
  return `Bearer ${createAccessToken("f7b4b6a8-4432-43ce-9d65-8f1c5d318c78")}`;
}

describe("module validation", () => {
  it("accepts valid create input and trims the title", () => {
    expect(
      createModuleSchema.parse({
        trackId,
        weekNumber: 1,
        title: "  Introduction  ",
      }),
    ).toEqual({ trackId, weekNumber: 1, title: "Introduction" });
  });

  it("rejects invalid create values and unexpected fields", () => {
    expect(
      createModuleSchema.safeParse({
        trackId: "not-a-uuid",
        weekNumber: 0,
        title: "x",
      }).success,
    ).toBe(false);
    expect(
      createModuleSchema.safeParse({
        trackId,
        weekNumber: 1,
        title: "Module",
        id: moduleId,
      }).success,
    ).toBe(false);
  });

  it("requires at least one valid field when updating", () => {
    expect(updateModuleSchema.safeParse({ title: " Updated " })).toMatchObject({
      success: true,
      data: { title: "Updated" },
    });
    expect(updateModuleSchema.safeParse({}).success).toBe(false);
    expect(updateModuleSchema.safeParse({ weekNumber: -1 }).success).toBe(false);
  });

  it("validates module IDs and requires a track for listing", () => {
    expect(moduleIdSchema.safeParse({ moduleId }).success).toBe(true);
    expect(moduleIdSchema.safeParse({ moduleId: "bad-id" }).success).toBe(
      false,
    );
    expect(moduleListQuerySchema.safeParse({ trackId }).success).toBe(true);
    expect(moduleListQuerySchema.safeParse({}).success).toBe(false);
  });
});

describe("module HTTP routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.track.findUnique.mockResolvedValue({ id: trackId });
    prismaMock.module.create.mockResolvedValue({
      id: moduleId,
      trackId,
      weekNumber: 1,
      title: "Introduction",
    });
    prismaMock.module.findMany.mockResolvedValue([]);
    prismaMock.module.findUnique.mockResolvedValue({
      id: moduleId,
      trackId,
      weekNumber: 1,
      title: "Introduction",
      lessons: [],
    });
    prismaMock.module.update.mockResolvedValue({
      id: moduleId,
      trackId,
      weekNumber: 2,
      title: "Updated module",
    });
    prismaMock.module.delete.mockResolvedValue({ id: moduleId });
  });

  it("requires authentication on every module route", async () => {
    const responses = await Promise.all([
      request(app).get(`/api/modules?trackId=${trackId}`),
      request(app).get(`/api/modules/${moduleId}`),
      request(app).post("/api/modules").send({}),
      request(app).patch(`/api/modules/${moduleId}`).send({ title: "Updated" }),
      request(app).delete(`/api/modules/${moduleId}`),
    ]);

    expect(responses.map((response) => response.status)).toEqual([
      401, 401, 401, 401, 401,
    ]);
  });

  it("rejects invalid create input before accessing the database", async () => {
    const response = await request(app)
      .post("/api/modules")
      .set("Authorization", bearerToken())
      .send({ trackId: "invalid", weekNumber: 0, title: "" });

    expect(response.status).toBe(400);
    expect(response.body.type).toBe("BadRequest");
    expect(response.body.details).toBeInstanceOf(Array);
    expect(prismaMock.track.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.module.create).not.toHaveBeenCalled();
  });

  it("allows only admins to create modules", async () => {
    const forbiddenResponse = await request(app)
      .post("/api/modules")
      .set("Authorization", bearerToken("STUDENT"))
      .send({ trackId, weekNumber: 1, title: "Introduction" });

    expect(forbiddenResponse.status).toBe(403);
    expect(prismaMock.module.create).not.toHaveBeenCalled();

    const response = await request(app)
      .post("/api/modules")
      .set("Authorization", bearerToken())
      .send({ trackId, weekNumber: 1, title: "Introduction" });

    expect(response.status).toBe(201);
    expect(response.body.module.id).toBe(moduleId);
    expect(prismaMock.module.create).toHaveBeenCalledWith({
      data: { trackId, weekNumber: 1, title: "Introduction" },
    });
  });

  it("reports a missing track when creating a module", async () => {
    prismaMock.track.findUnique.mockResolvedValue(null);

    const response = await request(app)
      .post("/api/modules")
      .set("Authorization", bearerToken())
      .send({ trackId, weekNumber: 1, title: "Introduction" });

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Track not found");
    expect(prismaMock.module.create).not.toHaveBeenCalled();
  });

  it("lists modules for a track in the service-defined order", async () => {
    const response = await request(app)
      .get(`/api/modules?trackId=${trackId}`)
      .set("Authorization", bearerToken("STUDENT"));

    expect(response.status).toBe(200);
    expect(response.body.modules).toEqual([]);
    expect(prismaMock.module.findMany).toHaveBeenCalledWith({
      where: { trackId },
      orderBy: [{ weekNumber: "asc" }, { id: "asc" }],
      include: { _count: { select: { lessons: true } } },
    });
  });

  it("requires guardian consent before reading program modules", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: "f7b4b6a8-4432-43ce-9d65-8f1c5d318c78",
      role: "STUDENT",
      ageGroup: "MINOR",
      parentConsent: false,
    });

    const response = await request(app)
      .get(`/api/modules/${moduleId}`)
      .set(
        "Authorization",
        `Bearer ${createAccessToken("f7b4b6a8-4432-43ce-9d65-8f1c5d318c78")}`,
      );

    expect(response.status).toBe(403);
    expect(prismaMock.module.findUnique).not.toHaveBeenCalled();
  });

  it("returns a module with lessons ordered by lesson number", async () => {
    const response = await request(app)
      .get(`/api/modules/${moduleId}`)
      .set("Authorization", bearerToken("STUDENT"));

    expect(response.status).toBe(200);
    expect(response.body.module.id).toBe(moduleId);
    expect(prismaMock.module.findUnique).toHaveBeenCalledWith({
      where: { id: moduleId },
      include: {
        lessons: {
          orderBy: [{ lessonNumber: "asc" }, { id: "asc" }],
        },
      },
    });
  });

  it("returns not found when the requested module does not exist", async () => {
    prismaMock.module.findUnique.mockResolvedValue(null);

    const response = await request(app)
      .get(`/api/modules/${moduleId}`)
      .set("Authorization", bearerToken("STUDENT"));

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Module not found");
  });

  it("allows only admins to update modules", async () => {
    const forbiddenResponse = await request(app)
      .patch(`/api/modules/${moduleId}`)
      .set("Authorization", bearerToken("STUDENT"))
      .send({ title: "Updated module" });

    expect(forbiddenResponse.status).toBe(403);
    expect(prismaMock.module.update).not.toHaveBeenCalled();

    const response = await request(app)
      .patch(`/api/modules/${moduleId}`)
      .set("Authorization", bearerToken())
      .send({ title: "Updated module" });

    expect(response.status).toBe(200);
    expect(response.body.module.title).toBe("Updated module");
    expect(prismaMock.module.update).toHaveBeenCalledWith({
      where: { id: moduleId },
      data: { title: "Updated module" },
    });
  });

  it("rejects empty update bodies and malformed module IDs", async () => {
    const emptyUpdate = await request(app)
      .patch(`/api/modules/${moduleId}`)
      .set("Authorization", bearerToken())
      .send({});
    const malformedId = await request(app)
      .get("/api/modules/not-a-uuid")
      .set("Authorization", bearerToken("STUDENT"));

    expect(emptyUpdate.status).toBe(400);
    expect(malformedId.status).toBe(400);
    expect(prismaMock.module.update).not.toHaveBeenCalled();
    expect(prismaMock.module.findUnique).not.toHaveBeenCalled();
  });

  it("allows only admins to delete modules", async () => {
    const forbiddenResponse = await request(app)
      .delete(`/api/modules/${moduleId}`)
      .set("Authorization", bearerToken("STUDENT"));

    expect(forbiddenResponse.status).toBe(403);
    expect(prismaMock.module.delete).not.toHaveBeenCalled();

    const response = await request(app)
      .delete(`/api/modules/${moduleId}`)
      .set("Authorization", bearerToken());

    expect(response.status).toBe(204);
    expect(prismaMock.module.delete).toHaveBeenCalledWith({
      where: { id: moduleId },
    });
  });

  it("returns not found when deleting a missing module", async () => {
    prismaMock.module.delete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        "Record to delete does not exist",
        { code: "P2025", clientVersion: "7.10.0" },
      ),
    );

    const response = await request(app)
      .delete(`/api/modules/${anotherModuleId}`)
      .set("Authorization", bearerToken());

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Module not found");
  });

  it("does not disguise unexpected database errors as not found", async () => {
    prismaMock.module.delete.mockRejectedValue(new Error("Database unavailable"));

    const response = await request(app)
      .delete(`/api/modules/${moduleId}`)
      .set("Authorization", bearerToken());

    expect(response.status).toBe(500);
  });
});
