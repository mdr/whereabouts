import { existsSync } from "node:fs";
import { createApp, defaultStaticDir } from "./app.ts";
import { configFromEnv } from "./config.ts";
import { configureGameRooms } from "./rooms.ts";

const config = configFromEnv(process.env, defaultStaticDir());
configureGameRooms({ config: config.game });

const staticDir = config.staticDir && existsSync(config.staticDir) ? config.staticDir : null;
const app = createApp({ staticDir, logger: true });

const address = await app.listen(config.port, config.host);
app.fastify.log.info(`whereabouts server on ${address} (static: ${staticDir ?? "none"})`);

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    void app.close().then(() => process.exit(0));
  });
}
