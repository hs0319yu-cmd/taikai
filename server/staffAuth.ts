import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { Request } from "express";
import { parse as parseCookieHeader } from "cookie";
import { COOKIE_NAME } from "@shared/const";
import { getStaffById } from "./db";

const deriveKey = (password: string, salt: Buffer, length: number) => new Promise<Buffer>((resolve, reject) => {
  scryptCallback(password, salt, length, (error, key) => error ? reject(error) : resolve(key));
});
const SESSION_TTL_SECONDS = 60 * 60 * 12;
const secret = () => {
  const value = process.env.AUTH_SESSION_SECRET || process.env.MANUS_JWT_SECRET;
  if (!value || value.length < 32) throw new Error("AUTH_SESSION_SECRET must be at least 32 characters");
  return new TextEncoder().encode(value);
};

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = await deriveKey(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const [scheme, saltHex, hashHex] = encoded.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  if (expected.length !== 64 || !/^[0-9a-f]{32}$/i.test(saltHex)) return false;
  const actual = await deriveKey(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(expected, actual);
}

export async function createStaffSession(staffId: number) {
  return new SignJWT({ staffId, kind: "staff" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret());
}

export async function authenticateStaffRequest(req: Request) {
  const cookies = parseCookieHeader(req.headers.cookie ?? "");
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (payload.kind !== "staff" || !Number.isInteger(payload.staffId)) return null;
    const staff = await getStaffById(Number(payload.staffId));
    if (!staff || !staff.isActive) return null;
    return {
      id: staff.id,
      openId: `staff_${staff.id}`,
      name: staff.name,
      email: staff.email,
      loginMethod: "password",
      role: staff.role,
      createdAt: staff.createdAt,
      updatedAt: staff.updatedAt,
      lastSignedIn: staff.lastSignedIn,
    } as const;
  } catch {
    return null;
  }
}

export const STAFF_SESSION_MAX_AGE = SESSION_TTL_SECONDS * 1000;
