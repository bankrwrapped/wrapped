// Encrypts X OAuth refresh tokens at rest in the `sessions` table (Module 14).
// AES-256-GCM: authenticated encryption, so a tampered ciphertext fails to
// decrypt rather than silently returning garbage that gets sent to X's API.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../config/env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // recommended for GCM, not the 16 used for CBC
const AUTH_TAG_LENGTH = 16;

function loadKey(): Buffer {
  const key = Buffer.from(env.SESSION_ENC_KEY, "hex");
  if (key.length !== 32) {
    throw new Error("SESSION_ENC_KEY must be a 64-character hex string (32 bytes) for AES-256 - got " + key.length + " bytes");
  }
  return key;
}
const KEY = loadKey();

// Output shape: "<iv>:<authTag>:<ciphertext>", all hex. Colon-joined rather
// than concatenated so decrypt can split unambiguously without storing
// fixed-offset lengths separately.
function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return iv.toString("hex") + ":" + authTag.toString("hex") + ":" + ciphertext.toString("hex");
}

function decrypt(encrypted: string): string {
  const parts = encrypted.split(":");
  if (parts.length !== 3) {
    throw new Error("malformed encrypted session value - expected iv:authTag:ciphertext");
  }
  const [ivHex, authTagHex, ciphertextHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error("malformed encrypted session value - iv or authTag wrong length");
  }
  const decipher = createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, "hex")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

// Session id: opaque, unguessable, app-generated (see schema.sql comment -
// no pgcrypto/uuid-ossp extension exists in this DB). 32 random bytes,
// base64url so it's cookie-safe with no padding/encoding issues.
function generateSessionId(): string {
  return randomBytes(32).toString("base64url");
}

export const sessionCrypto = {
  encrypt,
  decrypt,
  generateSessionId,
};
