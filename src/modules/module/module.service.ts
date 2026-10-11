import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { NotFoundError } from "../../core/CustomError.js";
import type {
  CreateModuleInput,
  UpdateModuleInput,
} from "./module.schema.js";

function isPrismaError(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === code
  );
}

async function ensureTrackExists(trackId: string): Promise<void> {
  const track = await prisma.track.findUnique({
    where: { id: trackId },
    select: { id: true },
  });

  if (!track) throw new NotFoundError("Track not found");
}

export async function createModule(data: CreateModuleInput) {
  await ensureTrackExists(data.trackId);

  try {
    return await prisma.module.create({
      data: {
        trackId: data.trackId,
        weekNumber: data.weekNumber,
        title: data.title,
      },
    });
  } catch (error) {
    if (isPrismaError(error, "P2003"))
      throw new NotFoundError("Track not found");
    throw error;
  }
}

export async function listModules(trackId: string) {
  await ensureTrackExists(trackId);

  return prisma.module.findMany({
    where: { trackId },
    orderBy: [{ weekNumber: "asc" }, { id: "asc" }],
    include: { _count: { select: { lessons: true } } },
  });
}

export async function getModule(moduleId: string) {
  const module = await prisma.module.findUnique({
    where: { id: moduleId },
    include: {
      lessons: {
        orderBy: [{ lessonNumber: "asc" }, { id: "asc" }],
      },
    },
  });

  if (!module) throw new NotFoundError("Module not found");
  return module;
}

export async function updateModule(
  moduleId: string,
  data: UpdateModuleInput,
) {
  if (data.trackId) await ensureTrackExists(data.trackId);

  try {
    return await prisma.module.update({
      where: { id: moduleId },
      data,
    });
  } catch (error) {
    if (isPrismaError(error, "P2025"))
      throw new NotFoundError("Module not found");
    if (isPrismaError(error, "P2003"))
      throw new NotFoundError("Track not found");
    throw error;
  }
}

export async function deleteModule(moduleId: string): Promise<void> {
  try {
    await prisma.module.delete({ where: { id: moduleId } });
  } catch (error) {
    if (isPrismaError(error, "P2025"))
      throw new NotFoundError("Module not found");
    throw error;
  }
}