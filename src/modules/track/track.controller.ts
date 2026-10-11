import type { Request, Response } from "express";
import { BadRequestError } from "../../core/CustomError.js";
import {
  createTrackSchema,
  trackIdSchema,
  updateTrackSchema,
} from "./track.schema.js";
import {
  createTrack,
  deleteTrack,
  getTrack,
  listTracks,
  updateTrack,
} from "./track.service.js";

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

export async function CreateTrack(req: Request, res: Response): Promise<void> {
  const parsed = createTrackSchema.safeParse(req.body);
  if (!parsed.success) throw validationError(parsed.error.issues);

  const track = await createTrack(parsed.data);
  res.status(201).json({ track });
}

export async function ListTracks(_req: Request, res: Response): Promise<void> {
  const tracks = await listTracks();
  res.status(200).json({ tracks });
}

export async function GetTrack(req: Request, res: Response): Promise<void> {
  const parsed = trackIdSchema.safeParse(req.params);
  if (!parsed.success) throw validationError(parsed.error.issues);

  const track = await getTrack(parsed.data.trackId);
  res.status(200).json({ track });
}

export async function UpdateTrack(req: Request, res: Response): Promise<void> {
  const parsedId = trackIdSchema.safeParse(req.params);
  if (!parsedId.success) throw validationError(parsedId.error.issues);

  const parsedData = updateTrackSchema.safeParse(req.body);
  if (!parsedData.success) throw validationError(parsedData.error.issues);

  const track = await updateTrack(parsedId.data.trackId, parsedData.data);
  res.status(200).json({ track });
}

export async function DeleteTrack(req: Request, res: Response): Promise<void> {
  const parsed = trackIdSchema.safeParse(req.params);
  if (!parsed.success) throw validationError(parsed.error.issues);

  await deleteTrack(parsed.data.trackId);
  res.status(204).end();
}
