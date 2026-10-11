import type { Request, Response } from "express";
import {
  BadRequestError,
  UnauthorizedError,
} from "../../core/CustomError.js";
import {
  attendanceParamsSchema,
  createMeetingSchema,
  meetingIdSchema,
  meetingListQuerySchema,
  updateAttendanceSchema,
  updateMeetingSchema,
} from "./meeting.schema.js";
import {
  createMeeting,
  deleteMeeting,
  getMeeting,
  getMeetingAttendance,
  listMeetings,
  recordAttendance,
  updateMeeting,
} from "./meeting.service.js";

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

function requireAuth(req: Request) {
  if (!req.auth) throw new UnauthorizedError("Authentication required");
  return req.auth;
}

function canManageMeetings(req: Request): boolean {
  const { role } = requireAuth(req);
  return role === "ADMIN" || role === "SUPPORTER";
}

export async function CreateMeeting(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = createMeetingSchema.safeParse(req.body);
  if (!parsed.success) throw validationError(parsed.error.issues);

  const meeting = await createMeeting(parsed.data);
  res.status(201).json({ meeting });
}

export async function ListMeetings(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = meetingListQuerySchema.safeParse(req.query);
  if (!parsed.success) throw validationError(parsed.error.issues);

  const auth = requireAuth(req);
  const meetings = await listMeetings(
    auth.userId,
    canManageMeetings(req),
    parsed.data.trackId,
  );
  res.status(200).json({ meetings });
}

export async function GetMeeting(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = meetingIdSchema.safeParse(req.params);
  if (!parsed.success) throw validationError(parsed.error.issues);

  const auth = requireAuth(req);
  const meeting = await getMeeting(
    parsed.data.meetingId,
    auth.userId,
    canManageMeetings(req),
  );
  res.status(200).json({ meeting });
}

export async function UpdateMeeting(
  req: Request,
  res: Response,
): Promise<void> {
  const parsedId = meetingIdSchema.safeParse(req.params);
  if (!parsedId.success) throw validationError(parsedId.error.issues);

  const parsedData = updateMeetingSchema.safeParse(req.body);
  if (!parsedData.success) throw validationError(parsedData.error.issues);

  const meeting = await updateMeeting(
    parsedId.data.meetingId,
    parsedData.data,
  );
  res.status(200).json({ meeting });
}

export async function DeleteMeeting(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = meetingIdSchema.safeParse(req.params);
  if (!parsed.success) throw validationError(parsed.error.issues);

  await deleteMeeting(parsed.data.meetingId);
  res.status(204).end();
}

export async function GetMeetingAttendance(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = meetingIdSchema.safeParse(req.params);
  if (!parsed.success) throw validationError(parsed.error.issues);

  const auth = requireAuth(req);
  const attendance = await getMeetingAttendance(
    parsed.data.meetingId,
    auth.userId,
    canManageMeetings(req),
  );
  res.status(200).json({ attendance });
}

export async function RecordMeetingAttendance(
  req: Request,
  res: Response,
): Promise<void> {
  const parsedParams = attendanceParamsSchema.safeParse(req.params);
  if (!parsedParams.success)
    throw validationError(parsedParams.error.issues);

  const parsedData = updateAttendanceSchema.safeParse(req.body);
  if (!parsedData.success) throw validationError(parsedData.error.issues);

  const { userId } = requireAuth(req);
  const attendance = await recordAttendance(
    parsedParams.data.meetingId,
    parsedParams.data.studentId,
    userId,
    parsedData.data.isPresent,
  );
  res.status(200).json({ attendance });
}
