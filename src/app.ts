import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { AppError } from "./core/AppError.js";
import Logger from "./core/Logger.js";
import { env } from "./config/env.js";
import { InternalError, PayloadTooLargeError } from "./core/CustomError.js";
import authRoute from "./modules/auth/auth.route.js";
import moduleRoute from "./modules/module/module.route.js";
import trackRoute from "./modules/track/track.route.js";
import lessonRoute from "./modules/lesson/lesson.route.js";
import meetingRoute from "./modules/meeting/meeting.route.js";
import helpRoute from "./modules/help/help.route.js";
import projectRoute from "./modules/project/project.route.js";

const app = express();

app.use(cors({ origin: env.WEB_ORIGIN ?? false, credentials: true }));

app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));

app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use("/api/auth", authRoute);
app.use("/api/tracks", trackRoute);
app.use("/api/modules", moduleRoute);
app.use("/api/lessons", lessonRoute);
app.use("/api/meetings", meetingRoute);
app.use("/api/help", helpRoute);
app.use("/api/projects", projectRoute);

app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      Logger.error(
        String(err.statusCode) +
          " " +
          req.method +
          " " +
          req.originalUrl +
          ": " +
          err.message,
      );
      if (err.stack) Logger.error(err.stack);
    }
    AppError.handle(err, res);
    return;
  }
  if (
    typeof err === "object" &&
    err !== null &&
    "type" in err &&
    err.type === "entity.too.large"
  ) {
    AppError.handle(new PayloadTooLargeError(), res);
    return;
  }
  Logger.error("Unhandled error " + req.method + " " + req.originalUrl, err);
  AppError.handle(new InternalError(), res);
});
export default app;
