import { DiscordSDK } from "@discord/embedded-app-sdk";

const DEFAULT_DISCORD_CLIENT_ID = "1568155504415481956";

let discordSdkInstance: DiscordSDK | null = null;
let readyPromise: Promise<DiscordSDK | null> | null = null;

export function isRunningInDiscordActivity(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return (
    params.has("frame_id") ||
    window.location.hostname.endsWith(".discordsays.com")
  );
}

/**
 * Initializes the Discord Embedded App SDK when launched inside a Discord Activity iframe.
 * Safely no-ops when running in a standard browser or test environment.
 */
export async function initDiscordActivity(): Promise<DiscordSDK | null> {
  if (!isRunningInDiscordActivity()) {
    return null;
  }

  if (readyPromise) {
    return readyPromise;
  }

  readyPromise = (async () => {
    try {
      const metaEnv = (import.meta as unknown as { env?: Record<string, string | undefined> })?.env;
      const clientId = metaEnv?.VITE_DISCORD_CLIENT_ID || DEFAULT_DISCORD_CLIENT_ID;
      const sdk = new DiscordSDK(clientId);
      await sdk.ready();
      discordSdkInstance = sdk;
      return sdk;
    } catch {
      // Non-fatal fallback if SDK initialization fails outside Discord
      return null;
    }
  })();

  return readyPromise;
}

export function getDiscordSdk(): DiscordSDK | null {
  return discordSdkInstance;
}
