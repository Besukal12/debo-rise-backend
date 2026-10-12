import type { Request, Response } from "express";
import {
  BadRequestError,
  ForbiddenError,
  UnauthorizedError,
} from "../../core/CustomError.js";
import {
  createHelpReplySchema,
  createHelpRequestSchema,
  helpReplyIdSchema,
  helpRequestIdSchema,
  listHelpRequestsSchema,
  verifyHelpReplySchema,
} from "./help.schema.js";
import {
  assertCanAttachReplyImage,
  assertCanAttachRequestImage,
  attachReplyImage,
  attachRequestImage,
  createHelpReply,
  createHelpRequest,
  getHelpRequest,
  listHelpRequests,
  verifyHelpReply,
} from "./help.service.js";
import {
  parseHelpImage,
  uploadHelpImage,
} from "./help.upload.js";

function validationError(issues: { path: PropertyKey[]; message: string }[]) {
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

export async function CreateHelpRequest(req: Request, res: Response) {
  const parsed = createHelpRequestSchema.safeParse(req.body);
  if (!parsed.success) throw validationError(parsed.error.issues);
  const helpRequest = await createHelpRequest(
    requireAuth(req).userId,
    parsed.data,
  );
  res.status(201).json({ request: helpRequest });
}

export async function ListHelpRequests(req: Request, res: Response) {
  const parsed = listHelpRequestsSchema.safeParse(req.query);
  if (!parsed.success) throw validationError(parsed.error.issues);
  const auth = requireAuth(req);
  const result = await listHelpRequests(auth.userId, auth.role, parsed.data);
  res.status(200).json(result);
}

export async function GetHelpRequest(req: Request, res: Response) {
  const parsed = helpRequestIdSchema.safeParse(req.params);
  if (!parsed.success) throw validationError(parsed.error.issues);
  const auth = requireAuth(req);
  const helpRequest = await getHelpRequest(
    parsed.data.requestId,
    auth.userId,
    auth.role,
  );
  res.status(200).json({ request: helpRequest });
}

export async function CreateHelpReply(req: Request, res: Response) {
  const parsedId = helpRequestIdSchema.safeParse(req.params);
  if (!parsedId.success) throw validationError(parsedId.error.issues);
  const parsedData = createHelpReplySchema.safeParse(req.body);
  if (!parsedData.success) throw validationError(parsedData.error.issues);
  const auth = requireAuth(req);
  const reply = await createHelpReply(
    parsedId.data.requestId,
    auth.userId,
    auth.role,
    parsedData.data,
  );
  res.status(201).json({ reply });
}

export async function VerifyHelpReply(req: Request, res: Response) {
  const parsedParams = helpRequestIdSchema.safeParse(req.params);
  if (!parsedParams.success) throw validationError(parsedParams.error.issues);
  const parsedData = verifyHelpReplySchema.safeParse(req.body);
  if (!parsedData.success) throw validationError(parsedData.error.issues);
  const { userId, role } = requireAuth(req);
  if (role !== "MENTOR")
    throw new ForbiddenError("Only mentors can verify a reply");
  const reply = await verifyHelpReply(
    parsedParams.data.requestId,
    parsedData.data.replyId,
    userId,
  );
  res.status(200).json({ reply });
}

export async function UploadRequestImage(req: Request, res: Response) {
  const parsed = helpRequestIdSchema.safeParse(req.params);
  if (!parsed.success) throw validationError(parsed.error.issues);
  const auth = requireAuth(req);
  const image = parseHelpImage(req);
  await assertCanAttachRequestImage(
    parsed.data.requestId,
    auth.userId,
    auth.role,
  );
  const imageUrl = await uploadHelpImage(
    image.buffer,
    image.contentType,
    `debo-rise/help-requests/${parsed.data.requestId}`,
  );
  const helpRequest = await attachRequestImage(
    parsed.data.requestId,
    auth.userId,
    auth.role,
    imageUrl,
  );
  res.status(200).json({ request: helpRequest });
}

export async function UploadReplyImage(req: Request, res: Response) {
  const parsed = helpReplyIdSchema.safeParse(req.params);
  if (!parsed.success) throw validationError(parsed.error.issues);
  const auth = requireAuth(req);
  const image = parseHelpImage(req);
  await assertCanAttachReplyImage(
    parsed.data.replyId,
    auth.userId,
    auth.role,
  );
  const imageUrl = await uploadHelpImage(
    image.buffer,
    image.contentType,
    `debo-rise/help-replies/${parsed.data.replyId}`,
  );
  const reply = await attachReplyImage(
    parsed.data.replyId,
    auth.userId,
    auth.role,
    imageUrl,
  );
  res.status(200).json({ reply });
}
