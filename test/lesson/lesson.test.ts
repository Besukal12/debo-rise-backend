import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../../src/app.js";
import { Prisma } from "../../src/generated/prisma/client.js";
import { createAccessToken } from "../../src/lib/token.js";
import {
  createLessonSchema,
  lessonIdSchema,
  lessonListQuerySchema,
  updateLessonProgressSchema,
  updateLessonSchema,
} from "../../src/modules/lesson/lesson.schema.js";
import { getPrismaMock } from "../setup.js";

const prismaMock = getPrismaMock();
const moduleId = "b8092df4-ff86-4e0b-96a9-3c6dcc2dfac7";
const lessonId = "3947b122-242a-4bb2-8b9e-75b331ad832c";
const missingLessonId = "aab5a777-5b17-4c7a-83a1-6578061ae6f4";
const userId = "f7b4b6a8-4432-43ce-9d65-8f1c5d318c78";

const lessonInput = {
  moduleId,
  lessonNumber: 1,
  title: "HTML Basics",
  durationMin: 30,
  readMarkdown: "## HTML\nLearn the document structure.",
  checklist: ["Read the notes", "Complete the exercise"],
};

function bearerToken(role: "ADMIN" | "STUDENT" = "ADMIN"): string {
  prismaMock.user.findFirst.mockResolvedValue({
    id: userId,
    role,
    ageGroup: "ADULT",
    parentConsent: true,
  });
  return `Bearer ${createAccessToken(userId)}`;
}

function prismaError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Prisma request failed", {
    code,
    clientVersion: "7.10.0",
  });
}

describe("lesson validation", () => {
  it("accepts valid lesson data and normalizes optional blank fields", () => {
    expect(
      createLessonSchema.parse({
        ...lessonInput,
        title: " HTML Basics ",
        videoUrl: "",
        starterCode: "",
      }),
    ).toMatchObject({
      ...lessonInput,
      title: "HTML Basics",
      videoUrl: null,
      starterCode: null,
    });
  });

  it("rejects invalid fields and unknown create properties", () => {
    expect(
      createLessonSchema.safeParse({
        ...lessonInput,
        moduleId: "bad-id",
      }).success,
    ).toBe(false);
    expect(
      createLessonSchema.safeParse({
        ...lessonInput,
        durationMin: 0,
      }).success,
    ).toBe(false);
    expect(
      createLessonSchema.safeParse({
        ...lessonInput,
        videoUrl: "not-a-url",
      }).success,
    ).toBe(false);
    expect(
      createLessonSchema.safeParse({ ...lessonInput, adminOnly: true }).success,
    ).toBe(false);
  });

  it("requires non-empty partial lesson updates", () => {
    expect(updateLessonSchema.safeParse({ title: "Updated title" }).success).toBe(
      true,
    );
    expect(updateLessonSchema.safeParse({}).success).toBe(false);
  });

  it("validates lesson IDs, module query, and progress input", () => {
    expect(lessonIdSchema.safeParse({ lessonId }).success).toBe(true);
    expect(lessonIdSchema.safeParse({ lessonId: "bad-id" }).success).toBe(
      false,
    );
    expect(lessonListQuerySchema.safeParse({ moduleId }).success).toBe(true);
    expect(lessonListQuerySchema.safeParse({}).success).toBe(false);
    expect(
      updateLessonProgressSchema.safeParse({
        status: "IN_PROGRESS",
        checkedList: ["Read the notes"],
      }).success,
    ).toBe(true);
    expect(
      updateLessonProgressSchema.safeParse({ status: "LOCKED" }).success,
    ).toBe(false);
    expect(updateLessonProgressSchema.safeParse({}).success).toBe(false);
  });
});

describe("lesson HTTP routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.module.findUnique.mockResolvedValue({ id: moduleId });
    prismaMock.lesson.create.mockResolvedValue({ id: lessonId, ...lessonInput });
    prismaMock.lesson.findMany.mockResolvedValue([]);
    prismaMock.lesson.findUnique.mockResolvedValue({
      id: lessonId,
      ...lessonInput,
    });
    prismaMock.lesson.update.mockResolvedValue({
      id: lessonId,
      ...lessonInput,
      title: "Updated title",
    });
    prismaMock.lesson.delete.mockResolvedValue({ id: lessonId });
    prismaMock.userLessonProgress.findMany.mockResolvedValue([]);
    prismaMock.userLessonProgress.upsert.mockResolvedValue({
      id: "a0c6a59d-5209-4844-b5a0-332668751fd1",
      userId,
      lessonId,
      status: "IN_PROGRESS",
      checkedList: ["Read the notes"],
    });
  });

  it("requires authentication for all lesson and progress routes", async () => {
    const responses = await Promise.all([
      request(app).get(`/api/lessons?moduleId=${moduleId}`),
      request(app).get(`/api/lessons/${lessonId}`),
      request(app).post("/api/lessons").send({}),
      request(app).patch(`/api/lessons/${lessonId}`).send({ title: "Updated" }),
      request(app).delete(`/api/lessons/${lessonId}`),
      request(app).get("/api/lessons/progress"),
      request(app)
        .put(`/api/lessons/${lessonId}/progress`)
        .send({ status: "DONE" }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([
      401, 401, 401, 401, 401, 401, 401,
    ]);
  });

  it("allows only admins to create lessons", async () => {
    const denied = await request(app)
      .post("/api/lessons")
      .set("Authorization", bearerToken("STUDENT"))
      .send(lessonInput);

    expect(denied.status).toBe(403);
    expect(prismaMock.lesson.create).not.toHaveBeenCalled();

    const response = await request(app)
      .post("/api/lessons")
      .set("Authorization", bearerToken())
      .send(lessonInput);

    expect(response.status).toBe(201);
    expect(response.body.lesson.id).toBe(lessonId);
    expect(prismaMock.lesson.create).toHaveBeenCalledWith({
      data: lessonInput,
    });
  });

  it("returns not found when creating a lesson for a missing module", async () => {
    prismaMock.module.findUnique.mockResolvedValue(null);

    const response = await request(app)
      .post("/api/lessons")
      .set("Authorization", bearerToken())
      .send(lessonInput);

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Module not found");
    expect(prismaMock.lesson.create).not.toHaveBeenCalled();
  });

  it("lists ordered lesson summaries for a module", async () => {
    const response = await request(app)
      .get(`/api/lessons?moduleId=${moduleId}`)
      .set("Authorization", bearerToken("STUDENT"));

    expect(response.status).toBe(200);
    expect(response.body.lessons).toEqual([]);
    expect(prismaMock.lesson.findMany).toHaveBeenCalledWith({
      where: { moduleId },
      orderBy: [{ lessonNumber: "asc" }, { id: "asc" }],
      select: {
        id: true,
        moduleId: true,
        lessonNumber: true,
        title: true,
        durationMin: true,
        isMilestone: true,
        videoUrl: true,
        videoDuration: true,
        _count: {
          select: {
            progresses: true,
            submissions: true,
            helpRequests: true,
          },
        },
      },
    });
  });

  it("requires guardian consent before serving lesson content", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: userId,
      role: "STUDENT",
      ageGroup: "MINOR",
      parentConsent: false,
    });

    const response = await request(app)
      .get(`/api/lessons/${lessonId}`)
      .set("Authorization", `Bearer ${createAccessToken(userId)}`);

    expect(response.status).toBe(403);
    expect(prismaMock.lesson.findUnique).not.toHaveBeenCalled();
  });

  it("gets a lesson and returns not found for an unknown lesson", async () => {
    const response = await request(app)
      .get(`/api/lessons/${lessonId}`)
      .set("Authorization", bearerToken("STUDENT"));

    expect(response.status).toBe(200);
    expect(response.body.lesson.id).toBe(lessonId);

    prismaMock.lesson.findUnique.mockResolvedValue(null);
    const missing = await request(app)
      .get(`/api/lessons/${missingLessonId}`)
      .set("Authorization", bearerToken("STUDENT"));

    expect(missing.status).toBe(404);
    expect(missing.body.message).toBe("Lesson not found");
  });

  it("allows only admins to update lessons", async () => {
    const denied = await request(app)
      .patch(`/api/lessons/${lessonId}`)
      .set("Authorization", bearerToken("STUDENT"))
      .send({ title: "Updated title" });

    expect(denied.status).toBe(403);
    expect(prismaMock.lesson.update).not.toHaveBeenCalled();

    const response = await request(app)
      .patch(`/api/lessons/${lessonId}`)
      .set("Authorization", bearerToken())
      .send({ title: "Updated title" });

    expect(response.status).toBe(200);
    expect(response.body.lesson.title).toBe("Updated title");
    expect(prismaMock.lesson.update).toHaveBeenCalledWith({
      where: { id: lessonId },
      data: { title: "Updated title" },
    });
  });

  it("rejects invalid updates and maps missing lessons to not found", async () => {
    const invalid = await request(app)
      .patch(`/api/lessons/${lessonId}`)
      .set("Authorization", bearerToken())
      .send({});

    prismaMock.lesson.update.mockRejectedValue(prismaError("P2025"));
    const missing = await request(app)
      .patch(`/api/lessons/${missingLessonId}`)
      .set("Authorization", bearerToken())
      .send({ title: "Updated title" });

    expect(invalid.status).toBe(400);
    expect(missing.status).toBe(404);
    expect(missing.body.message).toBe("Lesson not found");
  });

  it("allows only admins to delete lessons", async () => {
    const denied = await request(app)
      .delete(`/api/lessons/${lessonId}`)
      .set("Authorization", bearerToken("STUDENT"));

    expect(denied.status).toBe(403);
    expect(prismaMock.lesson.delete).not.toHaveBeenCalled();

    const response = await request(app)
      .delete(`/api/lessons/${lessonId}`)
      .set("Authorization", bearerToken());

    expect(response.status).toBe(204);
    expect(prismaMock.lesson.delete).toHaveBeenCalledWith({
      where: { id: lessonId },
    });
  });

  it("returns only the authenticated user's progress records", async () => {
    const response = await request(app)
      .get("/api/lessons/progress")
      .set("Authorization", bearerToken("STUDENT"));

    expect(response.status).toBe(200);
    expect(response.body.progress).toEqual([]);
    expect(prismaMock.userLessonProgress.findMany).toHaveBeenCalledWith({
      where: { userId },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      include: {
        lesson: {
          select: {
            id: true,
            moduleId: true,
            lessonNumber: true,
            title: true,
            durationMin: true,
          },
        },
      },
    });
  });

  it("saves progress for the authenticated user and rejects unknown checklist items", async () => {
    const response = await request(app)
      .put(`/api/lessons/${lessonId}/progress`)
      .set("Authorization", bearerToken("STUDENT"))
      .send({ status: "IN_PROGRESS", checkedList: ["Read the notes"] });

    expect(response.status).toBe(200);
    expect(response.body.progress.userId).toBe(userId);
    expect(prismaMock.userLessonProgress.upsert).toHaveBeenCalledWith({
      where: { userId_lessonId: { userId, lessonId } },
      create: {
        userId,
        lessonId,
        status: "IN_PROGRESS",
        checkedList: ["Read the notes"],
      },
      update: {
        status: "IN_PROGRESS",
        checkedList: ["Read the notes"],
      },
    });

    const invalid = await request(app)
      .put(`/api/lessons/${lessonId}/progress`)
      .set("Authorization", bearerToken("STUDENT"))
      .send({ checkedList: ["This isn't on the checklist"] });

    expect(invalid.status).toBe(400);
    expect(prismaMock.userLessonProgress.upsert).toHaveBeenCalledTimes(1);
  });

  it("creates default progress fields when only status is supplied", async () => {
    await request(app)
      .put(`/api/lessons/${lessonId}/progress`)
      .set("Authorization", bearerToken("STUDENT"))
      .send({ status: "DONE" });

    expect(prismaMock.userLessonProgress.upsert).toHaveBeenCalledWith({
      where: { userId_lessonId: { userId, lessonId } },
      create: {
        userId,
        lessonId,
        status: "DONE",
        checkedList: [],
      },
      update: { status: "DONE" },
    });
  });

  it("returns not found when updating progress for an unknown lesson", async () => {
    prismaMock.lesson.findUnique.mockResolvedValue(null);

    const response = await request(app)
      .put(`/api/lessons/${missingLessonId}/progress`)
      .set("Authorization", bearerToken("STUDENT"))
      .send({ status: "IN_PROGRESS" });

    expect(response.status).toBe(404);
    expect(prismaMock.userLessonProgress.upsert).not.toHaveBeenCalled();
  });
});
