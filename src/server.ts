import Logger from "./core/Logger.js";
import app from "./app.js";
import { env } from "./config/env.js";

const port = env.PORT;

app.listen(port, () => {
  console.log(`Debo Rise is running on port ${port}`);
  Logger.info(`Debo Rise is running on port ${port}`);
});
