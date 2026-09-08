import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  stripUntrustedIdentityFields,
  UNTRUSTED_IDENTITY_KEYS,
} from "../security/identity.js";
import { assertFound, assertOwnedByUser } from "../security/ownership.js";
import { AppError } from "../utils/errors.js";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function main(): void {
  console.info("Security regression checks…");

  const stripped = stripUntrustedIdentityFields({
    name: "Netflix",
    userId: "forged-user",
    user_id: "also-forged",
    amount: 15,
  });
  assert(!("userId" in stripped), "userId must be stripped");
  assert(!("user_id" in stripped), "user_id must be stripped");
  assert(stripped.name === "Netflix", "legitimate fields must remain");
  assert(UNTRUSTED_IDENTITY_KEYS.length >= 4, "identity denylist too small");

  try {
    assertFound(null, "Subscription not found");
    throw new Error("assertFound should throw");
  } catch (error) {
    assert(error instanceof AppError && error.statusCode === 404, "missing → 404");
  }

  try {
    assertOwnedByUser("user-a", "user-b", "Subscription not found");
    throw new Error("assertOwnedByUser should throw");
  } catch (error) {
    assert(
      error instanceof AppError && error.statusCode === 404,
      "cross-user → 404 (no enumeration)"
    );
  }

  const appSource = readFileSync(
    resolve(process.cwd(), "src/app.ts"),
    "utf8"
  );
  assert(appSource.includes("helmet("), "helmet must be enabled");
  assert(appSource.includes("rejectClientUserId"), "identity strip middleware required");
  assert(appSource.includes('disable("x-powered-by")'), "x-powered-by must be disabled");
  assert(appSource.includes("express.json({ limit: \"1mb\""), "JSON body limit required");

  const tokensSource = readFileSync(
    resolve(process.cwd(), "src/utils/tokens.ts"),
    "utf8"
  );
  assert(tokensSource.includes('algorithms: ["HS256"]'), "JWT alg must be pinned");

  console.info("Security checks passed.");
}

main();
