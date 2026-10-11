import type { Request, Response } from "express";
import { BadRequestError } from "../../core/CustomError.js";
import {
  createModuleSchema,
  moduleIdSchema,
  moduleListQuerySchema,
  updateModuleSchema,
} from "./module.schema.js";
import {
  createModule,
  deleteModule,
  getModule,
  listModules,
  updateModule,
} from "./module.service.js";

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

export async function CreateModule(req: Request, res: Response): Promise<void> {
  const parsed = createModuleSchema.safeParse(req.body);
  if (!parsed.success) throw validationError(parsed.error.issues);

  const module = await createModule(parsed.data);
  res.status(201).json({ module });
}

export async function ListModules(req: Request, res: Response): Promise<void> {
  const parsed = moduleListQuerySchema.safeParse(req.query);
  if (!parsed.success) throw validationError(parsed.error.issues);

  const modules = await listModules(parsed.data.trackId);
  res.status(200).json({ modules });
}

export async function GetModule(req: Request, res: Response): Promise<void> {
  const parsed = moduleIdSchema.safeParse(req.params);
  if (!parsed.success) throw validationError(parsed.error.issues);

  const module = await getModule(parsed.data.moduleId);
  res.status(200).json({ module });
}

export async function UpdateModule(req: Request, res: Response): Promise<void> {
  const parsedId = moduleIdSchema.safeParse(req.params);
  if (!parsedId.success) throw validationError(parsedId.error.issues);

  const parsedData = updateModuleSchema.safeParse(req.body);
  if (!parsedData.success) throw validationError(parsedData.error.issues);

  const module = await updateModule(parsedId.data.moduleId, parsedData.data);
  res.status(200).json({ module });
}

export async function DeleteModule(req: Request, res: Response): Promise<void> {
  const parsed = moduleIdSchema.safeParse(req.params);
  if (!parsed.success) throw validationError(parsed.error.issues);

  await deleteModule(parsed.data.moduleId);
  res.status(204).end();
}