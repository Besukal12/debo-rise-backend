import { Router } from "express";
import {
  authenticate,
  isAdmin,
  requireGuardianConsent,
} from "../../middleware/authenticate.js";
import {
  CreateTrack,
  DeleteTrack,
  GetTrack,
  ListTracks,
  UpdateTrack,
} from "./track.controller.js";

const router = Router();

router.get("/", authenticate, requireGuardianConsent(), ListTracks);
router.get("/:trackId", authenticate, requireGuardianConsent(), GetTrack);
router.post("/", authenticate, isAdmin, CreateTrack);
router.patch("/:trackId", authenticate, isAdmin, UpdateTrack);
router.delete("/:trackId", authenticate, isAdmin, DeleteTrack);

export default router;
