const LOOKUP_URL = "https://identitytoolkit.googleapis.com/v1/accounts:lookup";
const INVALID_TOKEN_ERRORS = new Set(["INVALID_ID_TOKEN", "TOKEN_EXPIRED", "USER_DISABLED", "USER_NOT_FOUND"]);

class FirebaseAuthError extends Error {
  constructor(code, options) {
    super(code, options);
    this.code = code;
  }
}

async function verifyIdToken(idToken, apiKey, fetchImpl = fetch) {
  if (
    typeof idToken !== "string" || idToken.length < 20 || idToken.length > 8192 ||
    typeof apiKey !== "string" || !apiKey
  ) throw new FirebaseAuthError("INVALID_TOKEN");

  let response;
  try {
    response = await fetchImpl(`${LOOKUP_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (error) {
    throw new FirebaseAuthError("PROVIDER_UNAVAILABLE", { cause: error });
  }
  if (!response.ok) {
    let providerCode = "";
    try {
      providerCode = (await response.json())?.error?.message || "";
    } catch {
      providerCode = "";
    }
    throw new FirebaseAuthError(response.status >= 500 || !INVALID_TOKEN_ERRORS.has(providerCode)
      ? "PROVIDER_UNAVAILABLE"
      : "INVALID_TOKEN");
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new FirebaseAuthError("PROVIDER_UNAVAILABLE", { cause: error });
  }
  const profile = Array.isArray(payload?.users) ? payload.users[0] : null;
  if (
    !profile ||
    typeof profile.localId !== "string" || !profile.localId || profile.localId.length > 128 ||
    typeof profile.email !== "string" || !profile.email || profile.email.length > 320
  ) throw new FirebaseAuthError("INVALID_TOKEN");
  if (profile.emailVerified !== true) throw new FirebaseAuthError("EMAIL_NOT_VERIFIED");

  return {
    sub: profile.localId,
    email: profile.email,
    name: typeof profile.displayName === "string" && profile.displayName.trim()
      ? profile.displayName.trim().slice(0, 120)
      : profile.email,
  };
}

module.exports = { FirebaseAuthError, verifyIdToken };
