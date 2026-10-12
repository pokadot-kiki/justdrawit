const crypto = require("crypto");

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_COOKIE = "jdi_session";

function parseCookies(header = "") {
  const cookies = {};
  for (const part of String(header).split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    if (name) cookies[name] = part.slice(separator + 1).trim();
  }
  return cookies;
}

function signSession(user, secret, now = Date.now()) {
  if (typeof secret !== "string" || Buffer.byteLength(secret) < 32) throw new Error("AUTH_SESSION_SECRET must be at least 32 bytes");
  const payload = Buffer.from(JSON.stringify({
    sub: user.sub,
    email: user.email,
    name: user.name,
    exp: now + SESSION_TTL_MS,
  })).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function readSession(token, secret, now = Date.now()) {
  if (typeof token !== "string" || token.length > 4096 || typeof secret !== "string" || Buffer.byteLength(secret) < 32) return null;
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;
  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length || !crypto.timingSafeEqual(actualBytes, expectedBytes)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (
      typeof session.sub !== "string" || !session.sub ||
      typeof session.email !== "string" || typeof session.name !== "string" ||
      !Number.isSafeInteger(session.exp) || session.exp <= now
    ) return null;
    return { sub: session.sub, email: session.email, name: session.name };
  } catch {
    return null;
  }
}

module.exports = { SESSION_COOKIE, SESSION_TTL_MS, parseCookies, readSession, signSession };
