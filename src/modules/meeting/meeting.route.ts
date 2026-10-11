import { Router } from "express";
import {
  authenticate,
  authorizeRoles,
  requireGuardianConsent,
} from "../../middleware/authenticate.js";
import {
  CreateMeeting,
  DeleteMeeting,
  GetMeeting,
  GetMeetingAttendance,
  ListMeetings,
  RecordMeetingAttendance,
  UpdateMeeting,
} from "./meeting.controller.js";

const router = Router();
const meetingManagers = authorizeRoles("ADMIN", "SUPPORTER");
const programAccess = [authenticate, requireGuardianConsent()];

router.get("/", ...programAccess, ListMeetings);
router.get("/:meetingId/attendance", ...programAccess, GetMeetingAttendance);
router.put(
  "/:meetingId/attendance/:studentId",
  authenticate,
  meetingManagers,
  RecordMeetingAttendance,
);
router.get("/:meetingId", ...programAccess, GetMeeting);
router.post("/", authenticate, authorizeRoles("ADMIN"), CreateMeeting);
router.patch("/:meetingId", authenticate, authorizeRoles("ADMIN"), UpdateMeeting);
router.delete("/:meetingId", authenticate, authorizeRoles("ADMIN"), DeleteMeeting);

export default router;
