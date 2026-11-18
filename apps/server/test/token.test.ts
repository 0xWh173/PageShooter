import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";
import { generateToken, verifyToken } from "../src/services/token.js";

describe("JWT Issuance & Verification", () => {
  const testSecret = "super_secure_test_secret_key_at_least_32_characters_long_123456";
  const payload = {
    userId: "d8e3b2a1-0000-0000-0000-000000000001",
    username: "TestHero"
  };

  it("generates a signed JWT with correct subject and username claims", () => {
    const token = generateToken(payload, "1h", testSecret);
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3);

    const verified = verifyToken(token, testSecret);
    expect(verified.userId).toBe(payload.userId);
    expect(verified.username).toBe(payload.username);
  });

  it("rejects token signed with an untrusted or mismatched secret", () => {
    const token = generateToken(payload, "1h", testSecret);
    const attackerSecret = "attacker_different_secret_key_at_least_32_characters_123";

    expect(() => {
      verifyToken(token, attackerSecret);
    }).toThrow(/invalid signature/i);
  });

  it("rejects tampered token payloads", () => {
    const token = generateToken(payload, "1h", testSecret);
    const parts = token.split(".");
    const tamperedPayload = Buffer.from(JSON.stringify({ sub: "hacked-user", username: "Hacker" })).toString("base64url");
    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

    expect(() => {
      verifyToken(tamperedToken, testSecret);
    }).toThrow();
  });

  it("rejects expired tokens", () => {
    const expiredToken = generateToken(payload, "-1s", testSecret);
    expect(() => {
      verifyToken(expiredToken, testSecret);
    }).toThrow(/jwt expired/i);
  });

  it("rejects token with mismatched issuer or audience", () => {
    const badIssuerToken = jwt.sign(
      { sub: payload.userId, username: payload.username },
      testSecret,
      { algorithm: "HS256", issuer: "untrusted-issuer", audience: "pageshooter-client" }
    );
    expect(() => {
      verifyToken(badIssuerToken, testSecret);
    }).toThrow(/jwt issuer invalid/i);

    const badAudienceToken = jwt.sign(
      { sub: payload.userId, username: payload.username },
      testSecret,
      { algorithm: "HS256", issuer: "pageshooter-server", audience: "untrusted-audience" }
    );
    expect(() => {
      verifyToken(badAudienceToken, testSecret);
    }).toThrow(/jwt audience invalid/i);
  });

  it("strictly pins algorithm HS256 and rejects 'none' algorithm token", () => {
    // Attempt none algorithm attack
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const body = Buffer.from(
      JSON.stringify({
        sub: payload.userId,
        username: payload.username,
        iss: "pageshooter-server",
        aud: "pageshooter-client",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600
      })
    ).toString("base64url");
    const noneToken = `${header}.${body}.`;

    expect(() => {
      verifyToken(noneToken, testSecret);
    }).toThrow();
  });

  it("verifies approved claims structure (iss: pageshooter-server, aud: pageshooter-client, jti, sub)", () => {
    const token = generateToken(payload, "1h", testSecret);
    const decoded = jwt.decode(token) as jwt.JwtPayload;

    expect(decoded.iss).toBe("pageshooter-server");
    expect(decoded.aud).toBe("pageshooter-client");
    expect(decoded.sub).toBe(payload.userId);
    expect(decoded.username).toBe(payload.username);
    expect(decoded.jti).toBeDefined();
    expect(typeof decoded.jti).toBe("string");
    expect(decoded.exp).toBeDefined();
    expect(decoded.iat).toBeDefined();

    const verified = verifyToken(token, testSecret);
    expect(verified.userId).toBe(payload.userId);
    expect(verified.username).toBe(payload.username);
    expect(verified.jti).toBe(decoded.jti);
  });
});
