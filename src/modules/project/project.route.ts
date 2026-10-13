import express, { Router } from "express";
import {
  authenticate,
  requireGuardianConsent,
} from "../../middleware/authenticate.js";
import { UploadProjectImage } from "./project.controller.js";
import {
  CreateProject,
  DeleteMyProject,
  GetMyProject,
  ListMyProjects,
  UpdateMyProject,
} from "./project.controller.js";
import { maxImageSize } from "../help/help.upload.js";

const router = Router();
const access = [authenticate, requireGuardianConsent()];
const imageBody = express.raw({
  type: ["image/jpeg", "image/jpg", "image/png", "image/webp"],
  limit: maxImageSize,
});

router.post("/image", ...access, imageBody, UploadProjectImage);
router.post("/", ...access, CreateProject);
router.get("/", ...access, ListMyProjects);
router.get("/:projectId", ...access, GetMyProject);
router.patch("/:projectId", ...access, UpdateMyProject);
router.delete("/:projectId", ...access, DeleteMyProject);

export default router;