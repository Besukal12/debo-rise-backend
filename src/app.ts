import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { AppError, ErrorType } from "./core/AppError.js";
import Logger from "./core/Logger.js";
import { env } from "./config/env.js";
import { InternalError } from "./core/CustomError.js";

const app = express();

app.use(cors);

app.use(cookieParser());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

//app routes

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof AppError) {
    AppError.handle(err, res);

    if (err.type === ErrorType.INTERNAL) {
      Logger.error(
        `500 - ${err.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`,
      );
    } else {
      Logger.error(
        `500 - ${err.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`,
      );
      Logger.error(err.stack);

      if (env.NODE_ENV === "development") {
        res.status(500).send({
          message: err.message,
          stack: err.stack,
        });
      }

      AppError.handle(new InternalError(), res)
    }
  }
});

export default app;
