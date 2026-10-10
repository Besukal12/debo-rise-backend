import { createLogger, transports, format } from "winston";
import { env } from "../config/env.js";
import path from "node:path";
import fs from "node:fs";
import DailyRotateFile from "winston-daily-rotate-file";

let dir = env.LOG_DIR;

if (!dir) {
  path.resolve(process.cwd(), "logs");
}

if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const logLevel = env.NODE_ENV === "production" ? "debug" : "warn";

const dailyRotateFile = new DailyRotateFile({
  level: logLevel,
  filename: `${dir}/%DATE%-results.log`,
  datePattern: "YYYY-MM-DD",
  zippedArchive: true,
  handleExceptions: true,
  maxSize: "20m",
  maxFiles: "14d",
  format: format.combine(
    format.errors({ stack: true }),
    format.timestamp(),
    format.json(),
  ),
});

export default createLogger({
  transports: [
    new transports.Console({
      level: logLevel,
      format: format.combine(
        format.errors({ stack: true }),
        format.timestamp(),
        format.colorize(),
        format.prettyPrint(),
        format.printf(
          (info) => `${info.timestamp} [${info.level}]: ${info.message}`,
        ),
      ),
    }),
    dailyRotateFile,
  ],
  exceptionHandlers: [dailyRotateFile],
  exitOnError: false,
});
