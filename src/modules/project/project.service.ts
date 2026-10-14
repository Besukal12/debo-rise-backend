import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../core/CustomError.js";
import type {
  CreateProjectInput,
  UpdateProjectInput,
} from "./project.schema.js";

function isPrismaError(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === code
  );
}

export async function createProject(
  userId: string,
  data: CreateProjectInput,
) {
  try {
    return await prisma.project.create({
      data: {
        ...data,
        user: { connect: { id: userId } },
      },
    });
  } catch (error) {
    if (isPrismaError(error, "P2003"))
      throw new NotFoundError("User not found");
    throw error;
  }
}

export async function listMyProjects(userId: string) {
  return prisma.project.findMany({
    where: { userId, deletedAt: null },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  });
}

export async function listProjectsForVerification() {
  return prisma.project.findMany({
    where: { isVerified: false, deletedAt: null },
    include: {
      user: { select: { id: true, fullName: true, avatarUrl: true } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

export async function verifyProject(projectId: string, mentorId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true, userId: true, isVerified: true },
  });
  if (!project) throw new NotFoundError("Project not found");
  if (project.userId === mentorId)
    throw new ForbiddenError("You cannot verify your own project");
  if (project.isVerified)
    throw new ConflictError("Project has already been verified");

  const result = await prisma.project.updateMany({
    where: {
      id: projectId,
      deletedAt: null,
      isVerified: false,
      userId: { not: mentorId },
    },
    data: { isVerified: true, verifiedBy: mentorId },
  });
  if (result.count !== 1) {
    const currentProject = await prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: { id: true, isVerified: true },
    });
    if (!currentProject) throw new NotFoundError("Project not found");
    if (currentProject.isVerified)
      throw new ConflictError("Project has already been verified");
    throw new ConflictError("Project could not be verified; try again");
  }

  const verifiedProject = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    include: {
      user: { select: { id: true, fullName: true, avatarUrl: true } },
    },
  });
  if (!verifiedProject) throw new NotFoundError("Project not found");
  return verifiedProject;
}

export async function getMyProject(userId: string, projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId, deletedAt: null },
  });
  if (!project) throw new NotFoundError("Project not found");
  return project;
}

export async function updateMyProject(
  userId: string,
  projectId: string,
  data: UpdateProjectInput,
) {
  try {
    return await prisma.project.update({
      where: { id: projectId, userId, deletedAt: null },
      data: {
        ...data,
        isVerified: false,
        verifiedBy: null,
      },
    });
  } catch (error) {
    if (isPrismaError(error, "P2025"))
      throw new NotFoundError("Project not found");
    throw error;
  }
}

export async function deleteMyProject(
  userId: string,
  projectId: string,
): Promise<void> {
  try {
    await prisma.project.update({
      where: { id: projectId, userId, deletedAt: null },
      data: { deletedAt: new Date(), isVerified: false, verifiedBy: null },
    });
  } catch (error) {
    if (isPrismaError(error, "P2025"))
      throw new NotFoundError("Project not found");
    throw error;
  }
}
