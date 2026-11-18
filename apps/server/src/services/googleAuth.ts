import { OAuth2Client } from "google-auth-library";
import { config } from "../config.js";

export interface GoogleTokenPayload {
  googleSub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

export type GoogleTokenVerifier = (idToken: string) => Promise<GoogleTokenPayload>;

let defaultClient: OAuth2Client | null = null;

function getClient(): OAuth2Client {
  if (!defaultClient) {
    defaultClient = new OAuth2Client(config.GOOGLE_CLIENT_ID);
  }
  return defaultClient;
}

export const verifyGoogleIdToken: GoogleTokenVerifier = async (idToken: string): Promise<GoogleTokenPayload> => {
  const client = getClient();
  const ticket = await client.verifyIdToken({
    idToken,
    audience: config.GOOGLE_CLIENT_ID
  });

  const payload = ticket.getPayload();
  if (!payload || !payload.sub || !payload.email) {
    throw new Error("Invalid Google token: missing required claims (sub, email)");
  }

  // Validate email verification claim
  if (!payload.email_verified) {
    throw new Error("Invalid Google token: email is not verified by Google");
  }

  // Validate issuer
  const validIssuers = ["accounts.google.com", "https://accounts.google.com"];
  if (!payload.iss || !validIssuers.includes(payload.iss)) {
    throw new Error(`Invalid Google token issuer: ${payload.iss}`);
  }

  // Validate expiration explicitly
  if (payload.exp && payload.exp * 1000 < Date.now()) {
    throw new Error("Invalid Google token: token has expired");
  }

  return {
    googleSub: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified,
    name: payload.name,
    picture: payload.picture
  };
};
