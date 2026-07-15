import { SignJWT, jwtVerify } from "jose";

export const COOKIE_NAME = "auth_token";

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || "dev-secret-change-in-production",
);

export interface JwtPayload {
  sub: string;
  username: string;
}

export async function signToken(payload: JwtPayload): Promise<string> {
  return new SignJWT({ username: payload.username })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return {
      sub: payload.sub!,
      username: payload.username as string,
    };
  } catch {
    return null;
  }
}
