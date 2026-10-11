import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../../src/app.js";
import { Prisma } from "../../src/generated/prisma/client.js";
import { createAccessToken } from "../../src/lib/token.js";
import {
  createTrackSchema,
  trackIdSchema,
  updateTrackSchema,
} from "../../src/modules/track/track.schema.js";
import { getPrismaMock } from "../setup.js";

const prismaMock = getPrismaMock();
const trackId = "b8092df4-ff86-4e0b-96a9-3c6dcc2dfac7";
const otherTrackId = "aab5a777-5b17-4c7a-83a1-6578061ae6f4";

function bearerToken(role: "ADMIN" | "STUDENT" = "ADMIN"): string {
  prismaMock.user.findFirst.mockResolvedValue({
    id: "f7b4b6a8-4432-43ce-9d65-8f1c5d318c78",
    role,
    ageGroup: "ADULT",
    parentConsent: true,
  });
  return `Bearer ${createAccessToken("f7b4b6a8-4432-43ce-9d65-8f1c5d318c78")}`;
}

describe("track validation", () => {
  it("accepts valid track data and trims the text fields", () => {
    expect(
      createTrackSchema.parse({
        slug: "  web-development ",
        title: " Web Development ",
        description: " Learn web development. ",
      }),
    ).toEqual({
      slug: "web-development",
      title: "Web Development",
      description: "Learn web development.",
    });
  });

  it("rejects invalid slugs, empty fields, and unexpected create fields", () => {
    expect(
      createTrackSchema.safeParse({
        slug: "Web Development",
        title: "Web Development",
        description: "Description",
      }).success,
    ).toBe(false);
    expect(
      createTrackSchema.safeParse({
        slug: "web-development",
        title: " ",
        description: "Description",
      }).success,
    ).toBe(false);
    expect(
      createTrackSchema.safeParse({
        slug: "web-development",
        title: "Web Development",
        description: "Description",
        id: trackId,
      }).success,
    ).toBe(false);
  });

  it("requires a non-empty partial update and validates track IDs", () => {
    expect(updateTrackSchema.safeParse({ title: "Updated" }).success).toBe(
      true,
    );
    expect(updateTrackSchema.safeParse({}).success).toBe(false);
    expect(updateTrackSchema.safeParse({ slug: "Bad Slug" }).success).toBe(
      false,
    );
    expect(trackIdSchema.safeParse({ trackId }).success).toBe(true);
    expect(trackIdSchema.safeParse({ trackId: "bad-id" }).success).toBe(false);
  });
});

describe("track HTTP routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.track.create.mockResolvedValue({
      id: trackId,
      slug: "web-development",
      title: "Web Development",
      description: "Learn web development.",
    });
    prismaMock.track.findMany.mockResolvedValue([]);
    prismaMock.track.findUnique.mockResolvedValue({
      id: trackId,
      slug: "web-development",
      title: "Web Development",
      description: "Learn web development.",
      modules: [],
    });
    prismaMock.track.update.mockResolvedValue({
      id: trackId,
      slug: "web-development",
      title: "Updated Track",
      description: "Learn web development.",
    });
    prismaMock.track.delete.mockResolvedValue({ id: trackId });
  });

  it("requires authentication for all track routes", async () => {
    const responses = await Promise.all([
      request(app).get("/api/tracks"),
      request(app).get(`/api/tracks/${trackId}`),
      request(app).post("/api/tracks").send({}),
      request(app).patch(`/api/tracks/${trackId}`).send({ title: "Updated" }),
      request(app).delete(`/api/tracks/${trackId}`),
    ]);

    expect(responses.map((response) => response.status)).toEqual([
      401, 401, 401, 401, 401,
    ]);
  });

  it("validates create input before making a database call", async () => {
    const response = await request(app)
      .post("/api/tracks")
      .set("Authorization", bearerToken())
      .send({
        slug: "Invalid Slug",
        title: "",
        description: "Description",
      });

    expect(response.status).toBe(400);
    expect(response.body.type).toBe("BadRequest");
    expect(response.body.details).toBeInstanceOf(Array);
    expect(prismaMock.track.create).not.toHaveBeenCalled();
  });

  it("allows admins to create tracks and denies non-admins", async () => {
    const denied = await request(app)
      .post("/api/tracks")
      .set("Authorization", bearerToken("STUDENT"))
      .send({
        slug: "web-development",
        title: "Web Development",
        description: "Learn web development.",
      });

    expect(denied.status).toBe(403);
    expect(prismaMock.track.create).not.toHaveBeenCalled();

    const response = await request(app)
      .post("/api/tracks")
      .set("Authorization", bearerToken())
      .send({
        slug: "web-development",
        title: "Web Development",
        description: "Learn web development.",
      });

    expect(response.status).toBe(201);
    expect(response.body.track.id).toBe(trackId);
    expect(prismaMock.track.create).toHaveBeenCalledWith({
      data: {
        slug: "web-development",
        title: "Web Development",
        description: "Learn web development.",
      },
    });
  });

  it("reports duplicate slugs as a conflict", async () => {
    prismaMock.track.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "7.10.0",
      }),
    );

    const response = await request(app)
      .post("/api/tracks")
      .set("Authorization", bearerToken())
      .send({
        slug: "web-development",
        title: "Web Development",
        description: "Learn web development.",
      });

    expect(response.status).toBe(409);
    expect(response.body.message).toBe("A track with this slug already exists");
  });

  it("lists tracks with module counts ordered by title and ID", async () => {
    const response = await request(app)
      .get("/api/tracks")
      .set("Authorization", bearerToken("STUDENT"));

    expect(response.status).toBe(200);
    expect(response.body.tracks).toEqual([]);
    expect(prismaMock.track.findMany).toHaveBeenCalledWith({
      orderBy: [{ title: "asc" }, { id: "asc" }],
      include: { _count: { select: { modules: true } } },
    });
  });

  it("requires guardian consent to read tracks", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: "f7b4b6a8-4432-43ce-9d65-8f1c5d318c78",
      role: "STUDENT",
      ageGroup: "MINOR",
      parentConsent: false,
    });

    const response = await request(app)
      .get("/api/tracks")
      .set(
        "Authorization",
        `Bearer ${createAccessToken("f7b4b6a8-4432-43ce-9d65-8f1c5d318c78")}`,
      );

    expect(response.status).toBe(403);
    expect(prismaMock.track.findMany).not.toHaveBeenCalled();
  });

  it("returns a track with ordered modules and their lesson counts", async () => {
    const response = await request(app)
      .get(`/api/tracks/${trackId}`)
      .set("Authorization", bearerToken("STUDENT"));

    expect(response.status).toBe(200);
    expect(response.body.track.id).toBe(trackId);
    expect(prismaMock.track.findUnique).toHaveBeenCalledWith({
      where: { id: trackId },
      include: {
        modules: {
          orderBy: [{ weekNumber: "asc" }, { id: "asc" }],
          include: { _count: { select: { lessons: true } } },
        },
      },
    });
  });

  it("returns not found for unknown tracks and rejects malformed IDs", async () => {
    prismaMock.track.findUnique.mockResolvedValue(null);

    const missing = await request(app)
      .get(`/api/tracks/${otherTrackId}`)
      .set("Authorization", bearerToken("STUDENT"));
    const malformed = await request(app)
      .get("/api/tracks/not-a-uuid")
      .set("Authorization", bearerToken("STUDENT"));

    expect(missing.status).toBe(404);
    expect(missing.body.message).toBe("Track not found");
    expect(malformed.status).toBe(400);
  });

  it("allows admins to update tracks and denies non-admins", async () => {
    const denied = await request(app)
      .patch(`/api/tracks/${trackId}`)
      .set("Authorization", bearerToken("STUDENT"))
      .send({ title: "Updated Track" });

    expect(denied.status).toBe(403);
    expect(prismaMock.track.update).not.toHaveBeenCalled();

    const response = await request(app)
      .patch(`/api/tracks/${trackId}`)
      .set("Authorization", bearerToken())
      .send({ title: "Updated Track" });

    expect(response.status).toBe(200);
    expect(response.body.track.title).toBe("Updated Track");
    expect(prismaMock.track.update).toHaveBeenCalledWith({
      where: { id: trackId },
      data: { title: "Updated Track" },
    });
  });

  it("rejects empty updates and reports track update conflicts", async () => {
    const empty = await request(app)
      .patch(`/api/tracks/${trackId}`)
      .set("Authorization", bearerToken())
      .send({});

    prismaMock.track.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "7.10.0",
      }),
    );
    const duplicateSlug = await request(app)
      .patch(`/api/tracks/${trackId}`)
      .set("Authorization", bearerToken())
      .send({ slug: "existing-slug" });

    expect(empty.status).toBe(400);
    expect(duplicateSlug.status).toBe(409);
  });

  it("allows only admins to delete tracks", async () => {
    const denied = await request(app)
      .delete(`/api/tracks/${trackId}`)
      .set("Authorization", bearerToken("STUDENT"));

    expect(denied.status).toBe(403);
    expect(prismaMock.track.delete).not.toHaveBeenCalled();

    const response = await request(app)
      .delete(`/api/tracks/${trackId}`)
      .set("Authorization", bearerToken());

    expect(response.status).toBe(204);
    expect(prismaMock.track.delete).toHaveBeenCalledWith({
      where: { id: trackId },
    });
  });

  it("returns not found when deleting an unknown track", async () => {
    prismaMock.track.delete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        "Record to delete does not exist",
        { code: "P2025", clientVersion: "7.10.0" },
      ),
    );

    const response = await request(app)
      .delete(`/api/tracks/${otherTrackId}`)
      .set("Authorization", bearerToken());

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Track not found");
  });
});
