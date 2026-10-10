import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { authenticate } from "../../middleware/authenticate.js";
import {
  ChangePassword,
  GetCurrentUser,
  LoginUser,
  LogoutUser,
  RefreshSession,
  RegisterUser,
} from "./auth.controller.js";

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many authentication attempts. Try again later." },
});

router.post("/register", authLimiter, RegisterUser);
router.post("/login", authLimiter, LoginUser);
router.post("/refresh", authLimiter, RefreshSession);
router.post("/logout", LogoutUser);
router.get("/me", authenticate, GetCurrentUser);
router.post("/change-password", authenticate, ChangePassword);


export default router;
