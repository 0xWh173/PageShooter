import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { config } from "../config.js";

export const JWT_ISSUER = "pageshooter-server";
export const JWT_AUDIENCE = "pageshooter-client";

export interface TokenPayload {
  userId: string;
  username: string;
  jti?: string;
  exp?: number;
  iat?: number;
}

export function generateToken(
  payload: TokenPayload,
  expiresIn: string = config.JWT_EXPIRES_IN,
  secret: string = config.JWT_SECRET
): string {
  const jti = payload.jti || crypto.randomUUID();
  return jwt.sign(
    {
      sub: payload.userId,
      username: payload.username
    },
    secret,
    {
      expiresIn: expiresIn as jwt.SignOptions["expiresIn"],
      algorithm: "HS256",
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      jwtid: jti
    }
  );
}

export function verifyToken(token: string, secret: string = config.JWT_SECRET): TokenPayload {
  const decoded = jwt.verify(token, secret, {
    algorithms: ["HS256"],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE
  }) as jwt.JwtPayload;

  if (!decoded || typeof decoded.sub !== "string" || typeof decoded.username !== "string") {
    throw new Error("Invalid token claims");
  }
  return {
    userId: decoded.sub,
    username: decoded.username,
    jti: decoded.jti,
    exp: decoded.exp,
    iat: decoded.iat
  };
}
