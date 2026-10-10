import Logger from "./core/Logger.js";
import app from "./app.js";
import { env } from "./config/env.js";

const port = env.PORT;

app
  .listen(port, () => {
    Logger.info(`Debo Rise is running on port ${port}`);
  })
  .on("error", (e) => Logger.error(e));
