import { Prisma } from "../../generated/prisma/client.js";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import {
  BadRequestError,
  InternalError,
  NotFoundError,
} from "../../core/CustomError.js";
import type {
  CreateLessonInput,
  UpdateLessonInput,
  UpdateLessonProgressInput,
} from "./lesson.schema.js";

const zodChecklist = z.array(z.string());

function isPrismaError(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === code
  );
}

async function ensureModuleExists(moduleId: string): Promise<void> {
  const module = await prisma.module.findUnique({
    where: { id: moduleId },
    select: { id: true },
  });

  if (!module) throw new NotFoundError("Module not found");
}

export async function createLesson(data: CreateLessonInput) {
  await ensureModuleExists(data.moduleId);

  try {
    return await prisma.lesson.create({
      data: {
        ...data,
        checklist: data.checklist,
      },
    });
  } catch (error) {
    if (isPrismaError(error, "P2003"))
      throw new NotFoundError("Module not found");
    throw error;
  }
}

export async function listLessons(moduleId: string) {
  await ensureModuleExists(moduleId);

  return prisma.lesson.findMany({
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
}

export async function getLesson(lessonId: string) {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
  });

  if (!lesson) throw new NotFoundError("Lesson not found");
  return lesson;
}

export async function updateLesson(
  lessonId: string,
  data: UpdateLessonInput,
) {
  if (data.moduleId) await ensureModuleExists(data.moduleId);

  try {
    return await prisma.lesson.update({
      where: { id: lessonId },
      data,
    });
  } catch (error) {
    if (isPrismaError(error, "P2025"))
      throw new NotFoundError("Lesson not found");
    if (isPrismaError(error, "P2003"))
      throw new NotFoundError("Module not found");
    throw error;
  }
}

export async function deleteLesson(lessonId: string): Promise<void> {
  try {
    await prisma.lesson.delete({ where: { id: lessonId } });
  } catch (error) {
    if (isPrismaError(error, "P2025"))
      throw new NotFoundError("Lesson not found");
    throw error;
  }
}

export async function getUserLessonProgress(userId: string) {
  return prisma.userLessonProgress.findMany({
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
}

export async function updateUserLessonProgress(
  userId: string,
  lessonId: string,
  data: UpdateLessonProgressInput,
) {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { id: true, checklist: true },
  });
  if (!lesson) throw new NotFoundError("Lesson not found");

  if (data.checkedList) {
    const checklist = zodChecklist.safeParse(lesson.checklist);
    if (!checklist.success)
      throw new InternalError("Lesson checklist data is invalid");

    const allowedItems = new Set(checklist.data);
    const invalidItems = data.checkedList.filter(
      (item) => !allowedItems.has(item),
    );
    if (invalidItems.length > 0) {
      throw new BadRequestError(
        "Progress contains checklist items that are not part of this lesson",
        invalidItems,
      );
    }
  }

  const update = {
    ...(data.status === undefined ? {} : { status: data.status }),
    ...(data.checkedList === undefined
      ? {}
      : { checkedList: data.checkedList }),
  };

  return prisma.userLessonProgress.upsert({
    where: { userId_lessonId: { userId, lessonId } },
    create: {
      userId,
      lessonId,
      status: data.status ?? "UPCOMING",
      checkedList: data.checkedList ?? [],
    },
    update,
  });
}