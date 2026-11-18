import { describe, it, expect } from "vitest";
import { loadConfig, envSchema } from "../src/config.js";

describe("Server Config Validation", () => {
  it("loads default configuration when no env overrides are provided", () => {
    const config = loadConfig({});
    expect(config.PORT).toBe(4000);
    expect(config.HOST).toBe("0.0.0.0");
    expect(config.NODE_ENV).toBe("development");
    expect(config.CORS_ORIGIN).toBe("http://localhost:5173,http://localhost:5175,http://localhost:3234");
    expect(config.DATABASE_URL).toBe("postgresql://postgres:postgres@localhost:5432/pageshooter");
  });

  it("successfully parses valid custom environment variables", () => {
    const customEnv = {
      PORT: "8080",
      HOST: "127.0.0.1",
      NODE_ENV: "production",
      CORS_ORIGIN: "https://pageshooter.com",
      DATABASE_URL: "postgresql://user:pass@db.example.com:5432/proddb"
    };

    const config = loadConfig(customEnv);
    expect(config.PORT).toBe(8080);
    expect(config.HOST).toBe("127.0.0.1");
    expect(config.NODE_ENV).toBe("production");
    expect(config.CORS_ORIGIN).toBe("https://pageshooter.com");
    expect(config.DATABASE_URL).toBe("postgresql://user:pass@db.example.com:5432/proddb");
  });

  it("throws descriptive error when PORT is invalid", () => {
    expect(() => {
      loadConfig({ PORT: "-50" });
    }).toThrow(/Invalid server environment configuration/);

    expect(() => {
      loadConfig({ PORT: "not-a-number" });
    }).toThrow(/Invalid server environment configuration/);
  });

  it("throws error when NODE_ENV is not one of development, production, test", () => {
    expect(() => {
      loadConfig({ NODE_ENV: "staging" as any });
    }).toThrow(/Invalid server environment configuration/);
  });

  it("validates schema directly using zod", () => {
    const result = envSchema.safeParse({ PORT: "3234" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PORT).toBe(3234);
    }
  });
});
