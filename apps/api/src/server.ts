import { config } from "./config.js";
import { createApp } from "./app.js";
import { prisma } from "./prisma.js";

const app = createApp(prisma);
const server = app.listen(config.PORT, () => {
  console.info(JSON.stringify({ level: "info", message: "api_listening", port: config.PORT, env: config.NODE_ENV }));
});

async function shutdown(signal: string) {
  console.info(JSON.stringify({ level: "info", message: "shutdown", signal }));
  server.close(async (error) => {
    await prisma.$disconnect();
    process.exit(error ? 1 : 0);
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
