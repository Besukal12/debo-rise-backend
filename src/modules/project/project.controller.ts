import type { Request, Response } from "express";
import {
  BadRequestError,
  ForbiddenError,
  UnauthorizedError,
} from "../../core/CustomError.js";
import { parseHelpImage, uploadHelpImage } from "../help/help.upload.js";
import {
  createProjectSchema,
  projectIdSchema,
  updateProjectSchema,
} from "./project.schema.js";
import {
  createProject,
  deleteMyProject,
  getMyProject,
  listProjectsForVerification,
  listMyProjects,
  updateMyProject,
  verifyProject,
} from "./project.service.js";

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

export async function CreateProject(
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.auth) throw new UnauthorizedError("Authentication required");

  const parsed = createProjectSchema.safeParse(req.body);
  if (!parsed.success) throw validationError(parsed.error.issues);

  const project = await createProject(req.auth.userId, parsed.data);
  res.status(201).json({ project });
}

export async function UploadProjectImage(
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.auth) throw new UnauthorizedError("Authentication required");
  const image = parseHelpImage(req);
  const imageUrl = await uploadHelpImage(
    image.buffer,
    image.contentType,
    `debo-rise/projects/${req.auth.userId}`,
  );
  res.status(201).json({ imageUrl });
}

export async function ListMyProjects(
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.auth) throw new UnauthorizedError("Authentication required");
  const projects = await listMyProjects(req.auth.userId);
  res.status(200).json({ projects });
}

export async function ListProjectsForVerification(
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.auth) throw new UnauthorizedError("Authentication required");
  if (req.auth.role !== "MENTOR")
    throw new ForbiddenError("Only mentors can review projects");
  const projects = await listProjectsForVerification();
  res.status(200).json({ projects });
}

export async function VerifyProject(
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.auth) throw new UnauthorizedError("Authentication required");
  if (req.auth.role !== "MENTOR")
    throw new ForbiddenError("Only mentors can verify projects");
  const parsed = projectIdSchema.safeParse(req.params);
  if (!parsed.success) throw validationError(parsed.error.issues);

  const project = await verifyProject(parsed.data.projectId, req.auth.userId);
  res.status(200).json({ project });
}

export async function GetMyProject(
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.auth) throw new UnauthorizedError("Authentication required");
  const parsed = projectIdSchema.safeParse(req.params);
  if (!parsed.success) throw validationError(parsed.error.issues);

  const project = await getMyProject(req.auth.userId, parsed.data.projectId);
  res.status(200).json({ project });
}

export async function UpdateMyProject(
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.auth) throw new UnauthorizedError("Authentication required");
  const parsedId = projectIdSchema.safeParse(req.params);
  if (!parsedId.success) throw validationError(parsedId.error.issues);
  const parsedData = updateProjectSchema.safeParse(req.body);
  if (!parsedData.success) throw validationError(parsedData.error.issues);

  const project = await updateMyProject(
    req.auth.userId,
    parsedId.data.projectId,
    parsedData.data,
  );
  res.status(200).json({ project });
}

export async function DeleteMyProject(
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.auth) throw new UnauthorizedError("Authentication required");
  const parsed = projectIdSchema.safeParse(req.params);
  if (!parsed.success) throw validationError(parsed.error.issues);

  await deleteMyProject(req.auth.userId, parsed.data.projectId);
  res.status(204).end();
}