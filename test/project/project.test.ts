import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { Prisma } from "../../src/generated/prisma/client.js";
import app from "../../src/app.js";
import { createAccessToken } from "../../src/lib/token.js";
import {
  createProjectSchema,
  projectIdSchema,
  updateProjectSchema,
  type CreateProjectInput,
} from "../../src/modules/project/project.schema.js";
import {
  createProject,
  deleteMyProject,
  getMyProject,
  listMyProjects,
  updateMyProject,
} from "../../src/modules/project/project.service.js";
import { getPrismaMock } from "../setup.js";

const prismaMock = getPrismaMock();
const userId = "b8092df4-ff86-4e0b-96a9-3c6dcc2dfac7";
const projectId = "3947b122-242a-4bb2-8b9e-75b331ad832c";
const projectBody = {
  title: "Accessible budgeting app",
  description: "A simple tool for planning monthly expenses.",
  tag: "Web development",
  imageUrl: "https://images.example.com/project.png",
  liveUrl: "",
  githubUrl: "https://github.com/example/budget-app",
};
const projectInput: CreateProjectInput = {
  ...projectBody,
  liveUrl: null,
};
const projectRecord = {
  id: projectId,
  userId,
  title: projectInput.title,
  description: projectInput.description,
  tag: projectInput.tag,
  imageUrl: projectInput.imageUrl,
  liveUrl: null,
  githubUrl: projectInput.githubUrl,
  isVerified: false,
  verifiedBy: null,
  deletedAt: null,
};

function bearerToken() {
  prismaMock.user.findFirst.mockResolvedValue({
    id: userId,
    role: "STUDENT",
    ageGroup: "ADULT",
    parentConsent: true,
  });
  return `Bearer ${createAccessToken(userId)}`;
}

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError("Prisma request failed", {
    code,
    clientVersion: "7.10.0",
  });
}

describe("project validation", () => {
  it("accepts valid project data and normalizes blank optional URLs", () => {
    expect(createProjectSchema.parse(projectBody)).toEqual(projectInput);
  });

  it("rejects client-owned or verification fields and invalid values", () => {
    expect(
      createProjectSchema.safeParse({
        ...projectBody,
        isVerified: true,
      }).success,
    ).toBe(false);
    expect(
      createProjectSchema.safeParse({
        ...projectBody,
        userId,
      }).success,
    ).toBe(false);
    expect(
      createProjectSchema.safeParse({
        ...projectBody,
        imageUrl: "javascript:alert(1)",
      }).success,
    ).toBe(false);
    expect(
      createProjectSchema.safeParse({ ...projectBody, title: " " }).success,
    ).toBe(false);
  });

  it("requires non-empty updates and validates project IDs", () => {
    expect(updateProjectSchema.safeParse({}).success).toBe(false);
    expect(updateProjectSchema.safeParse({ title: "Updated title" }).success).toBe(
      true,
    );
    expect(updateProjectSchema.safeParse({ liveUrl: "" })).toMatchObject({
      success: true,
      data: { liveUrl: null },
    });
    expect(projectIdSchema.safeParse({ projectId }).success).toBe(true);
    expect(projectIdSchema.safeParse({ projectId: "bad-id" }).success).toBe(
      false,
    );
  });
});

describe("project service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.project.create.mockResolvedValue(projectRecord);
    prismaMock.project.findMany.mockResolvedValue([projectRecord]);
    prismaMock.project.findFirst.mockResolvedValue(projectRecord);
    prismaMock.project.update.mockResolvedValue(projectRecord);
  });

  it("creates a project connected to its authenticated owner", async () => {
    await createProject(userId, projectInput);

    expect(prismaMock.project.create).toHaveBeenCalledWith({
      data: {
        ...projectInput,
        user: { connect: { id: userId } },
      },
    });
  });

  it("maps a missing owner and propagates other create errors", async () => {
    prismaMock.project.create.mockRejectedValueOnce(prismaError("P2003"));
    await expect(createProject(userId, projectInput)).rejects.toMatchObject({
      statusCode: 404,
      message: "User not found",
    });

    const databaseError = new Error("database unavailable");
    prismaMock.project.create.mockRejectedValueOnce(databaseError);
    await expect(createProject(userId, projectInput)).rejects.toBe(
      databaseError,
    );
  });

  it("lists only active projects owned by the user", async () => {
    await listMyProjects(userId);
    expect(prismaMock.project.findMany).toHaveBeenCalledWith({
      where: { userId, deletedAt: null },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    });
  });

  it("returns only an owned active project", async () => {
    await expect(getMyProject(userId, projectId)).resolves.toEqual(projectRecord);
    expect(prismaMock.project.findFirst).toHaveBeenCalledWith({
      where: { id: projectId, userId, deletedAt: null },
    });

    prismaMock.project.findFirst.mockResolvedValueOnce(null);
    await expect(getMyProject(userId, projectId)).rejects.toMatchObject({
      statusCode: 404,
      message: "Project not found",
    });
  });

  it("updates an owned project and clears its previous verification", async () => {
    await updateMyProject(userId, projectId, { title: "Updated title" });
    expect(prismaMock.project.update).toHaveBeenCalledWith({
      where: { id: projectId, userId, deletedAt: null },
      data: {
        title: "Updated title",
        isVerified: false,
        verifiedBy: null,
      },
    });
  });

  it("soft-deletes an owned project and maps missing-project errors", async () => {
    await deleteMyProject(userId, projectId);
    expect(prismaMock.project.update).toHaveBeenCalledWith({
      where: { id: projectId, userId, deletedAt: null },
      data: expect.objectContaining({
        deletedAt: expect.any(Date),
        isVerified: false,
        verifiedBy: null,
      }),
    });

    prismaMock.project.update.mockRejectedValueOnce(prismaError("P2025"));
    await expect(deleteMyProject(userId, projectId)).rejects.toMatchObject({
      statusCode: 404,
      message: "Project not found",
    });
  });
});

describe("project HTTP routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.project.create.mockResolvedValue(projectRecord);
    prismaMock.project.findMany.mockResolvedValue([projectRecord]);
    prismaMock.project.findFirst.mockResolvedValue(projectRecord);
    prismaMock.project.update.mockResolvedValue(projectRecord);
  });

  it("requires authentication for all project routes", async () => {
    const responses = await Promise.all([
      request(app).get("/api/projects"),
      request(app).get(`/api/projects/${projectId}`),
      request(app).post("/api/projects").send(projectBody),
      request(app).patch(`/api/projects/${projectId}`).send({ title: "Updated" }),
      request(app).delete(`/api/projects/${projectId}`),
    ]);

    expect(responses.map((response) => response.status)).toEqual([
      401, 401, 401, 401, 401,
    ]);
  });

  it("creates projects using the authenticated user, not client ownership", async () => {
    const invalid = await request(app)
      .post("/api/projects")
      .set("Authorization", bearerToken())
      .send({ ...projectBody, isVerified: true });
    expect(invalid.status).toBe(400);
    expect(prismaMock.project.create).not.toHaveBeenCalled();

    const response = await request(app)
      .post("/api/projects")
      .set("Authorization", bearerToken())
      .send(projectBody);

    expect(response.status).toBe(201);
    expect(response.body.project).toEqual(projectRecord);
    expect(prismaMock.project.create).toHaveBeenCalledWith({
      data: {
        ...projectInput,
        user: { connect: { id: userId } },
      },
    });
  });

  it("lists and fetches only the authenticated user's projects", async () => {
    const listResponse = await request(app)
      .get("/api/projects")
      .set("Authorization", bearerToken());
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.projects).toEqual([projectRecord]);

    const getResponse = await request(app)
      .get(`/api/projects/${projectId}`)
      .set("Authorization", bearerToken());
    expect(getResponse.status).toBe(200);
    expect(getResponse.body.project).toEqual(projectRecord);

    expect(prismaMock.project.findMany).toHaveBeenCalledWith({
      where: { userId, deletedAt: null },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    });
    expect(prismaMock.project.findFirst).toHaveBeenCalledWith({
      where: { id: projectId, userId, deletedAt: null },
    });
  });

  it("updates owned projects and rejects an empty update", async () => {
    const response = await request(app)
      .patch(`/api/projects/${projectId}`)
      .set("Authorization", bearerToken())
      .send({ title: "Updated title" });
    expect(response.status).toBe(200);
    expect(prismaMock.project.update).toHaveBeenCalledWith({
      where: { id: projectId, userId, deletedAt: null },
      data: {
        title: "Updated title",
        isVerified: false,
        verifiedBy: null,
      },
    });

    const invalid = await request(app)
      .patch(`/api/projects/${projectId}`)
      .set("Authorization", bearerToken())
      .send({});
    expect(invalid.status).toBe(400);
  });

  it("soft-deletes an owned project", async () => {
    const response = await request(app)
      .delete(`/api/projects/${projectId}`)
      .set("Authorization", bearerToken());

    expect(response.status).toBe(204);
    expect(prismaMock.project.update).toHaveBeenCalledWith({
      where: { id: projectId, userId, deletedAt: null },
      data: expect.objectContaining({
        deletedAt: expect.any(Date),
        isVerified: false,
        verifiedBy: null,
      }),
    });
  });
});
