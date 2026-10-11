import { Router } from "express";
import {
  authenticate,
  isAdmin,
  requireGuardianConsent,
} from "../../middleware/authenticate.js";
import {
  CreateModule,
  DeleteModule,
  GetModule,
  ListModules,
  UpdateModule,
} from "./module.controller.js";

const router = Router();

router.get("/", authenticate, requireGuardianConsent(), ListModules);
router.get("/:moduleId", authenticate, requireGuardianConsent(), GetModule);
router.post("/", authenticate, isAdmin, CreateModule);
router.patch("/:moduleId", authenticate, isAdmin, UpdateModule);
router.delete("/:moduleId", authenticate, isAdmin, DeleteModule);

export default router;