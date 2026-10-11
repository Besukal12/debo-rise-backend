import type { Request, Response } from "express";
import { BadRequestError, UnauthorizedError } from "../../core/CustomError.js";
import {
  createLessonSchema,
  lessonIdSchema,
  lessonListQuerySchema,
  updateLessonProgressSchema,
  updateLessonSchema,
} from "./lesson.schema.js";
import {
  createLesson,
  deleteLesson,
  getLesson,
  getUserLessonProgress,
  listLessons,
  updateLesson,
  updateUserLessonProgress,
} from "./lesson.service.js";

function validationError(
  issues: { path: PropertyKey[]; message: string }[],
): BadRequestError {
  return new BadRequestError(
    "Invalid request data",
    issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    })),
  );
}

function requireUserId(req: Request): string {
  if (!req.auth) throw new UnauthorizedError("Authentication required");
  return req.auth.userId;
}

export async function CreateLesson(req: Request, res: Response): Promise<void> {
  const parsed = createLessonSchema.safeParse(req.body);
  if (!parsed.success) throw validationError(parsed.error.issues);

  const lesson = await createLesson(parsed.data);
  res.status(201).json({ lesson });
}

export async function ListLessons(req: Request, res: Response): Promise<void> {
  const parsed = lessonListQuerySchema.safeParse(req.query);
  if (!parsed.success) throw validationError(parsed.error.issues);

  const lessons = await listLessons(parsed.data.moduleId);
  res.status(200).json({ lessons });
}

export async function GetLesson(req: Request, res: Response): Promise<void> {
  const parsed = lessonIdSchema.safeParse(req.params);
  if (!parsed.success) throw validationError(parsed.error.issues);

  const lesson = await getLesson(parsed.data.lessonId);
  res.status(200).json({ lesson });
}

export async function UpdateLesson(req: Request, res: Response): Promise<void> {
  const parsedId = lessonIdSchema.safeParse(req.params);
  if (!parsedId.success) throw validationError(parsedId.error.issues);

  const parsedData = updateLessonSchema.safeParse(req.body);
  if (!parsedData.success) throw validationError(parsedData.error.issues);

  const lesson = await updateLesson(parsedId.data.lessonId, parsedData.data);
  res.status(200).json({ lesson });
}

export async function DeleteLesson(req: Request, res: Response): Promise<void> {
  const parsed = lessonIdSchema.safeParse(req.params);
  if (!parsed.success) throw validationError(parsed.error.issues);

  await deleteLesson(parsed.data.lessonId);
  res.status(204).end();
}

export async function GetMyLessonProgress(
  req: Request,
  res: Response,
): Promise<void> {
  const progress = await getUserLessonProgress(requireUserId(req));
  res.status(200).json({ progress });
}

export async function UpdateMyLessonProgress(
  req: Request,
  res: Response,
): Promise<void> {
  const parsedId = lessonIdSchema.safeParse(req.params);
  if (!parsedId.success) throw validationError(parsedId.error.issues);

  const parsedData = updateLessonProgressSchema.safeParse(req.body);
  if (!parsedData.success) throw validationError(parsedData.error.issues);

  const progress = await updateUserLessonProgress(
    requireUserId(req),
    parsedId.data.lessonId,
    parsedData.data,
  );
  res.status(200).json({ progress });
}
