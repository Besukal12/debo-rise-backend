import { Router } from "express";
import {
  authenticate,
  isAdmin,
  requireGuardianConsent,
} from "../../middleware/authenticate.js";
import {
  CreateLesson,
  DeleteLesson,
  GetLesson,
  GetMyLessonProgress,
  ListLessons,
  UpdateLesson,
  UpdateMyLessonProgress,
} from "./lesson.controller.js";

const router = Router();
const programAccess = [authenticate, requireGuardianConsent()];

router.get("/progress", ...programAccess, GetMyLessonProgress);
router.put("/:lessonId/progress", ...programAccess, UpdateMyLessonProgress);
router.get("/", ...programAccess, ListLessons);
router.get("/:lessonId", ...programAccess, GetLesson);
router.post("/", authenticate, isAdmin, CreateLesson);
router.patch("/:lessonId", authenticate, isAdmin, UpdateLesson);
router.delete("/:lessonId", authenticate, isAdmin, DeleteLesson);

export default router;
