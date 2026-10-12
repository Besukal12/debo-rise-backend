import { z } from "zod";

export const createHelpRequestSchema = z
  .object({
    lessonId: z.uuid().optional(),
    title: z.string().trim().min(3).max(200),
    whatDidYouTry: z.string().trim().min(1).max(10_000),
    stuckMinutes: z.number().int().min(1).max(1440).optional(),
  })
  .strict();

export const listHelpRequestsSchema = z
  .object({
    status: z.enum(["OPEN", "HELPING", "SOLVED", "CLOSED"]).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.uuid().optional(),
  })
  .strict();

export const helpRequestIdSchema = z
  .object({ requestId: z.uuid() })
  .strict();

export const helpReplyIdSchema = z
  .object({ replyId: z.uuid() })
  .strict();

export const createHelpReplySchema = z
  .object({
    content: z.string().trim().min(1).max(10_000),
    codeSnippet: z.string().max(50_000).nullable().optional(),
  })
  .strict();

export const verifyHelpReplySchema = z
  .object({ replyId: z.uuid() })
  .strict();

export type CreateHelpRequestInput = z.infer<typeof createHelpRequestSchema>;
export type ListHelpRequestsInput = z.infer<typeof listHelpRequestsSchema>;
export type CreateHelpReplyInput = z.infer<typeof createHelpReplySchema>;
