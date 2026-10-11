import { z } from "zod";

const trackIdSchema = z.uuid();
const moduleTitleSchema = z.string().trim().min(2).max(100);
const weekNumberSchema = z.number().int().min(1);

export const createModuleSchema = z
  .object({
    trackId: trackIdSchema,
    weekNumber: weekNumberSchema,
    title: moduleTitleSchema,
  })
  .strict();

export const updateModuleSchema = z
  .object({
    trackId: trackIdSchema.optional(),
    weekNumber: weekNumberSchema.optional(),
    title: moduleTitleSchema.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export const moduleIdSchema = z
  .object({
    moduleId: z.uuid(),
  })
  .strict();

export const moduleListQuerySchema = z
  .object({
    trackId: trackIdSchema,
  })
  .strict();

export type CreateModuleInput = z.infer<typeof createModuleSchema>;
export type UpdateModuleInput = z.infer<typeof updateModuleSchema>;
export type ModuleIdInput = z.infer<typeof moduleIdSchema>;
export type ModuleListQueryInput = z.infer<typeof moduleListQuerySchema>;
