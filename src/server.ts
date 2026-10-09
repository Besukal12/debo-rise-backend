import app from "./app.js";
import { env } from "./config.js";

const port = env.PORT;

app.listen(port, () => {
  console.log(`Debo Rise is running on port ${port}`);
});
