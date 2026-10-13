import { Router } from "express";
import {
  authenticate,
  requireGuardianConsent,
} from "../../middleware/authenticate.js";
import {
  CreateProject,
  DeleteMyProject,
  GetMyProject,
  ListMyProjects,
  UpdateMyProject,
} from "./project.controller.js";

const router = Router();

router.post("/", authenticate, requireGuardianConsent(), CreateProject);
router.get("/", authenticate, requireGuardianConsent(), ListMyProjects);
router.get(
  "/:projectId",
  authenticate,
  requireGuardianConsent(),
  GetMyProject,
);
router.patch(
  "/:projectId",
  authenticate,
  requireGuardianConsent(),
  UpdateMyProject,
);
router.delete(
  "/:projectId",
  authenticate,
  requireGuardianConsent(),
  DeleteMyProject,
);

export default router;