import express, { Router } from "express";
import {
  authenticate,
  requireGuardianConsent,
} from "../../middleware/authenticate.js";
import {
  CreateHelpReply,
  CreateHelpRequest,
  GetHelpRequest,
  ListHelpReplies,
  ListHelpRequests,
  UploadReplyImage,
  UploadRequestImage,
  VerifyHelpReply,
} from "./help.controller.js";
import { maxImageSize } from "./help.upload.js";

const router = Router();
const access = [authenticate, requireGuardianConsent()];
const imageBody = express.raw({
  type: ["image/jpeg", "image/png", "image/webp"],
  limit: maxImageSize,
});

router.get("/requests", ...access, ListHelpRequests);
router.post("/requests", ...access, CreateHelpRequest);
router.get("/requests/:requestId/replies", ...access, ListHelpReplies);
router.get("/requests/:requestId", ...access, GetHelpRequest);
router.post("/requests/:requestId/replies", ...access, CreateHelpReply);
router.post("/requests/:requestId/solution", ...access, VerifyHelpReply);
router.post(
  "/requests/:requestId/image",
  ...access,
  imageBody,
  UploadRequestImage,
);
router.post("/replies/:replyId/image", ...access, imageBody, UploadReplyImage);

export default router;
