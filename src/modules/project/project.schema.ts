import { z } from "zod";

const blankToNull = (value: unknown) => (value === "" ? null : value);
const projectTitleSchema = z.string().trim().min(2).max(200);
const projectDescriptionSchema = z.string().trim().min(2).max(3000);
const projectTagSchema = z.string().trim().min(1).max(100);
const projectImageUrlSchema = z.url({ protocol: /^https?$/ }).max(2048);
const optionalProjectUrlSchema = z.preprocess(
  blankToNull,
  z.url({ protocol: /^https?$/ }).max(2048).nullable().optional(),
);

export const createProjectSchema = z
  .object({
    title: projectTitleSchema,
    description: projectDescriptionSchema,
    tag: projectTagSchema,
    imageUrl: projectImageUrlSchema,
    liveUrl: optionalProjectUrlSchema,
    githubUrl: optionalProjectUrlSchema,
  })
  .strict();

export const updateProjectSchema = z
  .object({
    title: projectTitleSchema.optional(),
    description: projectDescriptionSchema.optional(),
    tag: projectTagSchema.optional(),
    imageUrl: projectImageUrlSchema.optional(),
    liveUrl: optionalProjectUrlSchema,
    githubUrl: optionalProjectUrlSchema,
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export const projectIdSchema = z
  .object({
    projectId: z.uuid(),
  })
  .strict();

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
