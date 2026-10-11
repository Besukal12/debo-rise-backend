import { z } from "zod";

const trackTitleSchema = z.string().trim().min(2).max(100);
const trackSlugSchema = z
  .string()
  .trim()
  .min(2)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens");
const trackDescriptionSchema = z.string().trim().min(1).max(2000);

export const createTrackSchema = z
  .object({
    slug: trackSlugSchema,
    title: trackTitleSchema,
    description: trackDescriptionSchema,
  })
  .strict();

export const updateTrackSchema = z
  .object({
    slug: trackSlugSchema.optional(),
    title: trackTitleSchema.optional(),
    description: trackDescriptionSchema.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export const trackIdSchema = z
  .object({
    trackId: z.uuid(),
  })
  .strict();

export type CreateTrackInput = z.infer<typeof createTrackSchema>;
export type UpdateTrackInput = z.infer<typeof updateTrackSchema>;
