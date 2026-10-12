import { createServer } from "node:http";
import { Server } from "socket.io";
import Logger from "./core/Logger.js";
import app from "./app.js";
import { env } from "./config/env.js";
import { configureHelpSocket } from "./modules/help/help.socket.js";

const port = env.PORT;
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: env.WEB_ORIGIN ?? false, credentials: true },
});
configureHelpSocket(io);

httpServer
  .listen(port, () => {
    Logger.info(`Debo Rise is running on port ${port}`);
  })
  .on("error", (e) => Logger.error(e));
