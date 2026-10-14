import express, { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { authenticate } from "../../middleware/authenticate.js";
import { maxImageSize } from "../help/help.upload.js";
import {
  ChangePassword,
  GetCurrentUser,
  LoginUser,
  LogoutUser,
  RefreshSession,
  RegisterUser,
  UpdateCurrentUser,
  UploadCurrentUserAvatar,
} from "./auth.controller.js";

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many authentication attempts. Try again later." },
});
const avatarBody = express.raw({
  type: ["image/jpeg", "image/jpg", "image/png", "image/webp"],
  limit: maxImageSize,
});

router.post("/register", authLimiter, RegisterUser);
router.post("/login", authLimiter, LoginUser);
router.post("/refresh", authLimiter, RefreshSession);
router.post("/logout", LogoutUser);
router.get("/me", authenticate, GetCurrentUser);
router.patch("/me", authenticate, UpdateCurrentUser);
router.put("/me/avatar", authenticate, avatarBody, UploadCurrentUserAvatar);
router.post("/change-password", authenticate, ChangePassword);


export default router;
