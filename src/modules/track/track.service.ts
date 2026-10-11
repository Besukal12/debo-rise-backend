import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { ConflictError, NotFoundError } from "../../core/CustomError.js";
import type {
  CreateTrackInput,
  UpdateTrackInput,
} from "./track.schema.js";

function isPrismaError(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === code
  );
}

export async function createTrack(data: CreateTrackInput) {
  try {
    return await prisma.track.create({ data });
  } catch (error) {
    if (isPrismaError(error, "P2002"))
      throw new ConflictError("A track with this slug already exists");
    throw error;
  }
}

export async function listTracks() {
  return prisma.track.findMany({
    orderBy: [{ title: "asc" }, { id: "asc" }],
    include: { _count: { select: { modules: true } } },
  });
}

export async function getTrack(trackId: string) {
  const track = await prisma.track.findUnique({
    where: { id: trackId },
    include: {
      modules: {
        orderBy: [{ weekNumber: "asc" }, { id: "asc" }],
        include: { _count: { select: { lessons: true } } },
      },
    },
  });

  if (!track) throw new NotFoundError("Track not found");
  return track;
}

export async function updateTrack(trackId: string, data: UpdateTrackInput) {
  try {
    return await prisma.track.update({
      where: { id: trackId },
      data,
    });
  } catch (error) {
    if (isPrismaError(error, "P2025"))
      throw new NotFoundError("Track not found");
    if (isPrismaError(error, "P2002"))
      throw new ConflictError("A track with this slug already exists");
    throw error;
  }
}

export async function deleteTrack(trackId: string): Promise<void> {
  try {
    await prisma.track.delete({ where: { id: trackId } });
  } catch (error) {
    if (isPrismaError(error, "P2025"))
      throw new NotFoundError("Track not found");
    throw error;
  }
}
