import { z } from "zod";

const trackIdSchema = z.uuid();
const meetingTypeSchema = z.enum(["TYPE_A", "TYPE_B"]);
const meetingDateSchema = z.iso.datetime().transform((value) => new Date(value));

export const createMeetingSchema = z
  .object({
    trackId: trackIdSchema,
    type: meetingTypeSchema,
    date: meetingDateSchema,
  })
  .strict();

export const updateMeetingSchema = z
  .object({
    trackId: trackIdSchema.optional(),
    type: meetingTypeSchema.optional(),
    date: meetingDateSchema.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export const meetingIdSchema = z
  .object({
    meetingId: z.uuid(),
  })
  .strict();

export const meetingListQuerySchema = z
  .object({
    trackId: trackIdSchema.optional(),
  })
  .strict();

export const attendanceParamsSchema = z
  .object({
    meetingId: z.uuid(),
    studentId: z.uuid(),
  })
  .strict();

export const updateAttendanceSchema = z
  .object({
    isPresent: z.boolean(),
  })
  .strict();

export type CreateMeetingInput = z.infer<typeof createMeetingSchema>;
export type UpdateMeetingInput = z.infer<typeof updateMeetingSchema>;
