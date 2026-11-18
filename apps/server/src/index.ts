import { config, assertProductionSecrets } from "./config.js";
import { buildServer } from "./server.js";

async function main() {
  assertProductionSecrets(config);
  const server = buildServer({ config });

  // Handle graceful shutdown on SIGINT / SIGTERM
  const handleSignal = async (signal: string) => {
    server.log.info(`Received ${signal}. Shutting down gracefully...`);
    try {
      await server.close();
      server.log.info("Server closed successfully.");
      process.exit(0);
    } catch (err) {
      server.log.error(err, "Error during graceful shutdown");
      process.exit(1);
    }
  };

  process.on("SIGINT", () => handleSignal("SIGINT"));
  process.on("SIGTERM", () => handleSignal("SIGTERM"));

  try {
    const address = await server.listen({
      port: config.PORT,
      host: config.HOST
    });
    console.log(`[PageShooter Server] Listening on ${address}`);
    console.log(`[PageShooter Server] Environment: ${config.NODE_ENV}`);
    console.log(`[PageShooter Server] Health endpoint: ${address}/api/health`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

main();
