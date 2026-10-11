import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { ForbiddenError, NotFoundError } from "../../core/CustomError.js";
import type {
  CreateMeetingInput,
  UpdateMeetingInput,
} from "./meeting.schema.js";

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

async function getUserTrackId(userId: string): Promise<string | null> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { trackId: true },
  });
  if (!user) throw new NotFoundError("User not found");
  return user.trackId;
}

async function ensureUserCanAccessTrack(
  userId: string,
  trackId: string,
): Promise<void> {
  const assignedTrackId = await getUserTrackId(userId);
  if (assignedTrackId !== trackId)
    throw new NotFoundError("Meeting not found");
}

export async function createMeeting(data: CreateMeetingInput) {
  await ensureTrackExists(data.trackId);
  try {
    return await prisma.trackMeeting.create({ data });
  } catch (error) {
    if (isPrismaError(error, "P2003"))
      throw new NotFoundError("Track not found");
    throw error;
  }
}

export async function listMeetings(
  userId: string,
  canManage: boolean,
  requestedTrackId?: string,
) {
  let trackId = requestedTrackId;
  if (!canManage) {
    const assignedTrackId = await getUserTrackId(userId);
    if (requestedTrackId && requestedTrackId !== assignedTrackId)
      throw new NotFoundError("Track not found");
    trackId = assignedTrackId ?? undefined;
  } else if (trackId) {
    await ensureTrackExists(trackId);
  }

  return prisma.trackMeeting.findMany({
    where: trackId ? { trackId } : {},
    orderBy: [{ date: "asc" }, { id: "asc" }],
    select: {
      id: true,
      trackId: true,
      type: true,
      date: true,
      createdAt: true,
      _count: { select: { records: true } },
    },
  });
}

export async function getMeeting(
  meetingId: string,
  userId: string,
  canManage: boolean,
) {
  const meeting = await prisma.trackMeeting.findUnique({
    where: { id: meetingId },
    select: {
      id: true,
      trackId: true,
      type: true,
      date: true,
      createdAt: true,
      _count: { select: { records: true } },
    },
  });
  if (!meeting) throw new NotFoundError("Meeting not found");
  if (!canManage)
    await ensureUserCanAccessTrack(userId, meeting.trackId);
  return meeting;
}

export async function updateMeeting(
  meetingId: string,
  data: UpdateMeetingInput,
) {
  if (data.trackId) await ensureTrackExists(data.trackId);
  try {
    return await prisma.trackMeeting.update({
      where: { id: meetingId },
      data,
    });
  } catch (error) {
    if (isPrismaError(error, "P2025"))
      throw new NotFoundError("Meeting not found");
    if (isPrismaError(error, "P2003"))
      throw new NotFoundError("Track not found");
    throw error;
  }
}

export async function deleteMeeting(meetingId: string): Promise<void> {
  try {
    await prisma.trackMeeting.delete({ where: { id: meetingId } });
  } catch (error) {
    if (isPrismaError(error, "P2025"))
      throw new NotFoundError("Meeting not found");
    throw error;
  }
}

export async function getMeetingAttendance(
  meetingId: string,
  userId: string,
  canManage: boolean,
) {
  const meeting = await prisma.trackMeeting.findUnique({
    where: { id: meetingId },
    select: { id: true, trackId: true },
  });
  if (!meeting) throw new NotFoundError("Meeting not found");

  if (!canManage) {
    await ensureUserCanAccessTrack(userId, meeting.trackId);
    return prisma.attendanceRecord.findUnique({
      where: { meetingId_studentId: { meetingId, studentId: userId } },
      select: {
        id: true,
        meetingId: true,
        studentId: true,
        isPresent: true,
        createdAt: true,
      },
    });
  }

  return prisma.attendanceRecord.findMany({
    where: { meetingId },
    orderBy: [{ studentId: "asc" }, { id: "asc" }],
    select: {
      id: true,
      meetingId: true,
      studentId: true,
      isPresent: true,
      createdAt: true,
      student: {
        select: { id: true, fullName: true, email: true },
      },
    },
  });
}

export async function recordAttendance(
  meetingId: string,
  studentId: string,
  recordedById: string,
  isPresent: boolean,
) {
  const meeting = await prisma.trackMeeting.findUnique({
    where: { id: meetingId },
    select: { id: true, trackId: true },
  });
  if (!meeting) throw new NotFoundError("Meeting not found");

  const student = await prisma.user.findFirst({
    where: {
      id: studentId,
      role: "STUDENT",
      deletedAt: null,
    },
    select: { id: true, trackId: true },
  });
  if (!student || student.trackId !== meeting.trackId)
    throw new NotFoundError("Student not found in this track");

  try {
    return await prisma.attendanceRecord.upsert({
      where: { meetingId_studentId: { meetingId, studentId } },
      create: { meetingId, studentId, recordedById, isPresent },
      update: { recordedById, isPresent },
    });
  } catch (error) {
    if (isPrismaError(error, "P2003"))
      throw new NotFoundError("Meeting or student not found");
    throw error;
  }
}
