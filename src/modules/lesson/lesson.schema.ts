import { z } from "zod";

const blankToNull = (value: unknown) => (value === "" ? null : value);
const moduleIdSchema = z.uuid();
const lessonTitleSchema = z.string().trim().min(2).max(200);
const lessonNumberSchema = z.number().int().min(1);
const durationSchema = z.number().int().min(1).max(1440);
const markdownSchema = z.string().trim().min(1).max(100_000);
const checklistSchema = z.array(z.string().trim().min(1).max(300)).max(100);
const videoUrlSchema = z.preprocess(blankToNull, z.url().nullable().optional());
const optionalTextSchema = (max: number) =>
  z.preprocess(blankToNull, z.string().trim().max(max).nullable().optional());

export const createLessonSchema = z
  .object({
    moduleId: moduleIdSchema,
    lessonNumber: lessonNumberSchema,
    title: lessonTitleSchema,
    durationMin: durationSchema,
    isMilestone: z.boolean().optional(),
    readMarkdown: markdownSchema,
    videoUrl: videoUrlSchema,
    videoDuration: optionalTextSchema(30),
    starterCode: optionalTextSchema(100_000),
    checklist: checklistSchema,
  })
  .strict();

export const updateLessonSchema = z
  .object({
    moduleId: moduleIdSchema.optional(),
    lessonNumber: lessonNumberSchema.optional(),
    title: lessonTitleSchema.optional(),
    durationMin: durationSchema.optional(),
    isMilestone: z.boolean().optional(),
    readMarkdown: markdownSchema.optional(),
    videoUrl: videoUrlSchema,
    videoDuration: optionalTextSchema(30),
    starterCode: optionalTextSchema(100_000),
    checklist: checklistSchema.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export const lessonIdSchema = z
  .object({
    lessonId: z.uuid(),
  })
  .strict();

export const lessonListQuerySchema = z
  .object({
    moduleId: moduleIdSchema,
  })
  .strict();

export const updateLessonProgressSchema = z
  .object({
    status: z.enum(["UPCOMING", "IN_PROGRESS", "DONE"]).optional(),
    checkedList: checklistSchema.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export type CreateLessonInput = z.infer<typeof createLessonSchema>;
export type UpdateLessonInput = z.infer<typeof updateLessonSchema>;
export type UpdateLessonProgressInput = z.infer<
  typeof updateLessonProgressSchema
>;
