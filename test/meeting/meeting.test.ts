import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../../src/app.js";
import { Prisma } from "../../src/generated/prisma/client.js";
import { createAccessToken } from "../../src/lib/token.js";
import {
  createMeetingSchema,
  meetingIdSchema,
  meetingListQuerySchema,
  updateAttendanceSchema,
  updateMeetingSchema,
} from "../../src/modules/meeting/meeting.schema.js";
import { getPrismaMock } from "../setup.js";

const prismaMock = getPrismaMock();
const trackId = "b8092df4-ff86-4e0b-96a9-3c6dcc2dfac7";
const otherTrackId = "aab5a777-5b17-4c7a-83a1-6578061ae6f4";
const meetingId = "3947b122-242a-4bb2-8b9e-75b331ad832c";
const missingMeetingId = "31c8785a-4baf-45a7-9d5e-47ebf4cb2ac9";
const studentId = "f7b4b6a8-4432-43ce-9d65-8f1c5d318c78";
const supporterId = "55ac5ad2-df82-43b5-9a45-cbd2f0876d21";
const meetingDate = "2026-11-12T15:00:00.000Z";

const meetingInput = { trackId, type: "TYPE_A", date: meetingDate };

function bearerToken(role: "ADMIN" | "SUPPORTER" | "STUDENT" = "ADMIN") {
  const userId = role === "STUDENT" ? studentId : supporterId;
  prismaMock.user.findFirst.mockImplementation(async (args: { select?: Record<string, boolean> }) => {
    if (args.select?.role) {
      return {
        id: userId,
        role,
        ageGroup: "ADULT",
        parentConsent: true,
      };
    }
    return { trackId };
  });
  return `Bearer ${createAccessToken(userId)}`;
}

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError("Prisma request failed", {
    code,
    clientVersion: "7.10.0",
  });
}

describe("meeting validation", () => {
  it("accepts valid meeting input and parses its date", () => {
    expect(createMeetingSchema.parse(meetingInput)).toEqual({
      trackId,
      type: "TYPE_A",
      date: new Date(meetingDate),
    });
  });

  it("rejects invalid track IDs, types, dates, and unknown properties", () => {
    expect(
      createMeetingSchema.safeParse({ ...meetingInput, trackId: "invalid" })
        .success,
    ).toBe(false);
    expect(
      createMeetingSchema.safeParse({ ...meetingInput, type: "TYPE_C" }).success,
    ).toBe(false);
    expect(
      createMeetingSchema.safeParse({ ...meetingInput, date: "tomorrow" })
        .success,
    ).toBe(false);
    expect(
      createMeetingSchema.safeParse({ ...meetingInput, records: [] }).success,
    ).toBe(false);
  });

  it("validates partial updates, IDs, list filters, and attendance input", () => {
    expect(updateMeetingSchema.safeParse({ type: "TYPE_B" }).success).toBe(
      true,
    );
    expect(updateMeetingSchema.safeParse({}).success).toBe(false);
    expect(meetingIdSchema.safeParse({ meetingId }).success).toBe(true);
    expect(meetingListQuerySchema.safeParse({ trackId }).success).toBe(true);
    expect(meetingListQuerySchema.safeParse({ trackId: "bad" }).success).toBe(
      false,
    );
    expect(updateAttendanceSchema.safeParse({ isPresent: true }).success).toBe(
      true,
    );
    expect(updateAttendanceSchema.safeParse({ isPresent: "yes" }).success).toBe(
      false,
    );
  });
});

describe("meeting HTTP routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.track.findUnique.mockResolvedValue({ id: trackId });
    prismaMock.trackMeeting.create.mockResolvedValue({
      id: meetingId,
      ...meetingInput,
    });
    prismaMock.trackMeeting.findMany.mockResolvedValue([]);
    prismaMock.trackMeeting.findUnique.mockResolvedValue({
      id: meetingId,
      trackId,
      type: "TYPE_A",
      date: new Date(meetingDate),
      _count: { records: 0 },
    });
    prismaMock.trackMeeting.update.mockResolvedValue({
      id: meetingId,
      trackId,
      type: "TYPE_B",
      date: new Date(meetingDate),
    });
    prismaMock.trackMeeting.delete.mockResolvedValue({ id: meetingId });
    prismaMock.attendanceRecord.findMany.mockResolvedValue([]);
    prismaMock.attendanceRecord.findUnique.mockResolvedValue(null);
    prismaMock.attendanceRecord.upsert.mockResolvedValue({
      id: "acdb9ee4-ef0e-44fd-b6c9-31d2b8e89a47",
      meetingId,
      studentId,
      recordedById: supporterId,
      isPresent: true,
    });
  });

  it("requires authentication for meeting and attendance routes", async () => {
    const responses = await Promise.all([
      request(app).get("/api/meetings"),
      request(app).get(`/api/meetings/${meetingId}`),
      request(app).post("/api/meetings").send({}),
      request(app).patch(`/api/meetings/${meetingId}`).send({ type: "TYPE_B" }),
      request(app).delete(`/api/meetings/${meetingId}`),
      request(app).get(`/api/meetings/${meetingId}/attendance`),
      request(app)
        .put(`/api/meetings/${meetingId}/attendance/${studentId}`)
        .send({ isPresent: true }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([
      401, 401, 401, 401, 401, 401, 401,
    ]);
  });

  it("allows only admins to create meetings", async () => {
    const denied = await request(app)
      .post("/api/meetings")
      .set("Authorization", bearerToken("SUPPORTER"))
      .send(meetingInput);

    expect(denied.status).toBe(403);
    expect(prismaMock.trackMeeting.create).not.toHaveBeenCalled();

    const response = await request(app)
      .post("/api/meetings")
      .set("Authorization", bearerToken())
      .send(meetingInput);

    expect(response.status).toBe(201);
    expect(response.body.meeting.id).toBe(meetingId);
    expect(prismaMock.trackMeeting.create).toHaveBeenCalledWith({
      data: { trackId, type: "TYPE_A", date: new Date(meetingDate) },
    });
  });

  it("reports missing tracks when creating a meeting", async () => {
    prismaMock.track.findUnique.mockResolvedValue(null);

    const response = await request(app)
      .post("/api/meetings")
      .set("Authorization", bearerToken())
      .send(meetingInput);

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Track not found");
  });

  it("lists meetings in date order for a user's assigned track", async () => {
    const response = await request(app)
      .get("/api/meetings")
      .set("Authorization", bearerToken("STUDENT"));

    expect(response.status).toBe(200);
    expect(response.body.meetings).toEqual([]);
    expect(prismaMock.trackMeeting.findMany).toHaveBeenCalledWith({
      where: { trackId },
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
  });

  it("prevents users from listing meetings for another track", async () => {
    const response = await request(app)
      .get(`/api/meetings?trackId=${otherTrackId}`)
      .set("Authorization", bearerToken("STUDENT"));

    expect(response.status).toBe(404);
    expect(prismaMock.trackMeeting.findMany).not.toHaveBeenCalled();
  });

  it("returns no meetings to users who are not assigned to a track", async () => {
    prismaMock.user.findFirst.mockImplementation(async (args: { select?: Record<string, boolean> }) => {
      if (args.select?.role) {
        return {
          id: studentId,
          role: "STUDENT",
          ageGroup: "ADULT",
          parentConsent: true,
        };
      }
      return { trackId: null };
    });

    const response = await request(app)
      .get("/api/meetings")
      .set("Authorization", `Bearer ${createAccessToken(studentId)}`);

    expect(response.status).toBe(200);
    expect(response.body.meetings).toEqual([]);
    expect(prismaMock.trackMeeting.findMany).not.toHaveBeenCalled();
  });

  it("allows admin and supporter to list meetings by track", async () => {
    const response = await request(app)
      .get(`/api/meetings?trackId=${trackId}`)
      .set("Authorization", bearerToken("SUPPORTER"));

    expect(response.status).toBe(200);
    expect(prismaMock.trackMeeting.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { trackId } }),
    );
  });

  it("returns meeting details only to users assigned to its track", async () => {
    const studentResponse = await request(app)
      .get(`/api/meetings/${meetingId}`)
      .set("Authorization", bearerToken("STUDENT"));

    expect(studentResponse.status).toBe(200);
    expect(studentResponse.body.meeting.id).toBe(meetingId);

    prismaMock.user.findFirst.mockImplementation(async (args: { select?: Record<string, boolean> }) => {
      if (args.select?.role) {
        return {
          id: studentId,
          role: "STUDENT",
          ageGroup: "ADULT",
          parentConsent: true,
        };
      }
      return { trackId: otherTrackId };
    });

    const otherTrackResponse = await request(app)
      .get(`/api/meetings/${meetingId}`)
      .set("Authorization", `Bearer ${createAccessToken(studentId)}`);

    expect(otherTrackResponse.status).toBe(404);
  });

  it("allows only admins to update and delete meetings", async () => {
    const deniedUpdate = await request(app)
      .patch(`/api/meetings/${meetingId}`)
      .set("Authorization", bearerToken("SUPPORTER"))
      .send({ type: "TYPE_B" });
    const deniedDelete = await request(app)
      .delete(`/api/meetings/${meetingId}`)
      .set("Authorization", bearerToken("SUPPORTER"));

    expect(deniedUpdate.status).toBe(403);
    expect(deniedDelete.status).toBe(403);
    expect(prismaMock.trackMeeting.update).not.toHaveBeenCalled();
    expect(prismaMock.trackMeeting.delete).not.toHaveBeenCalled();

    const updated = await request(app)
      .patch(`/api/meetings/${meetingId}`)
      .set("Authorization", bearerToken())
      .send({ type: "TYPE_B" });
    const deleted = await request(app)
      .delete(`/api/meetings/${meetingId}`)
      .set("Authorization", bearerToken());

    expect(updated.status).toBe(200);
    expect(deleted.status).toBe(204);
  });

  it("returns not found for update or delete of missing meetings", async () => {
    prismaMock.trackMeeting.update.mockRejectedValue(prismaError("P2025"));
    prismaMock.trackMeeting.delete.mockRejectedValue(prismaError("P2025"));

    const updateResponse = await request(app)
      .patch(`/api/meetings/${missingMeetingId}`)
      .set("Authorization", bearerToken())
      .send({ type: "TYPE_B" });
    const deleteResponse = await request(app)
      .delete(`/api/meetings/${missingMeetingId}`)
      .set("Authorization", bearerToken());

    expect(updateResponse.status).toBe(404);
    expect(deleteResponse.status).toBe(404);
  });

  it("lets students read only their own attendance record", async () => {
    const response = await request(app)
      .get(`/api/meetings/${meetingId}/attendance`)
      .set("Authorization", bearerToken("STUDENT"));

    expect(response.status).toBe(200);
    expect(prismaMock.attendanceRecord.findUnique).toHaveBeenCalledWith({
      where: { meetingId_studentId: { meetingId, studentId } },
      select: {
        id: true,
        meetingId: true,
        studentId: true,
        isPresent: true,
        createdAt: true,
      },
    });
    expect(prismaMock.attendanceRecord.findMany).not.toHaveBeenCalled();
  });

  it("lets supporters read attendance records for a meeting", async () => {
    const response = await request(app)
      .get(`/api/meetings/${meetingId}/attendance`)
      .set("Authorization", bearerToken("SUPPORTER"));

    expect(response.status).toBe(200);
    expect(prismaMock.attendanceRecord.findMany).toHaveBeenCalledWith({
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
  });

  it("allows supporters to record attendance for a student in the meeting track", async () => {
    const response = await request(app)
      .put(`/api/meetings/${meetingId}/attendance/${studentId}`)
      .set("Authorization", bearerToken("SUPPORTER"))
      .send({ isPresent: true });

    expect(response.status).toBe(200);
    expect(prismaMock.attendanceRecord.upsert).toHaveBeenCalledWith({
      where: { meetingId_studentId: { meetingId, studentId } },
      create: {
        meetingId,
        studentId,
        recordedById: supporterId,
        isPresent: true,
      },
      update: { recordedById: supporterId, isPresent: true },
    });
  });

  it("rejects attendance for a student outside the meeting track", async () => {
    prismaMock.user.findFirst.mockImplementation(async (args: { select?: Record<string, boolean> }) => {
      if (args.select?.role) {
        return {
          id: supporterId,
          role: "SUPPORTER",
          ageGroup: "ADULT",
          parentConsent: true,
        };
      }
      return { id: studentId, trackId: otherTrackId };
    });

    const response = await request(app)
      .put(`/api/meetings/${meetingId}/attendance/${studentId}`)
      .set("Authorization", `Bearer ${createAccessToken(supporterId)}`)
      .send({ isPresent: true });

    expect(response.status).toBe(404);
    expect(prismaMock.attendanceRecord.upsert).not.toHaveBeenCalled();
  });
});
