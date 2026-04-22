import { describe, expect, it } from "vitest";
import { isUserIdTrusted } from "../lib/user-id-auth";

async function sign(key: string, message: string): Promise<string> {
  const keyBytes = new TextEncoder().encode(key);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

describe("isUserIdTrusted", () => {
  const siteId = "site-123";
  const userId = "user-abc";

  it("returns true when signing key is not configured (legacy mode)", async () => {
    expect(
      await isUserIdTrusted({ signingKey: undefined, siteId, userId, signature: undefined }),
    ).toBe(true);
  });

  it("rejects missing signature when key is configured", async () => {
    expect(
      await isUserIdTrusted({ signingKey: "secret", siteId, userId, signature: undefined }),
    ).toBe(false);
  });

  it("accepts a valid signature", async () => {
    const key = "secret";
    const sig = await sign(key, `${siteId}.${userId}`);
    expect(await isUserIdTrusted({ signingKey: key, siteId, userId, signature: sig })).toBe(true);
  });

  it("rejects a signature minted for a different user_id", async () => {
    const key = "secret";
    const sig = await sign(key, `${siteId}.otheruser`);
    expect(await isUserIdTrusted({ signingKey: key, siteId, userId, signature: sig })).toBe(false);
  });

  it("rejects a signature minted for a different site_id", async () => {
    const key = "secret";
    const sig = await sign(key, `othersite.${userId}`);
    expect(await isUserIdTrusted({ signingKey: key, siteId, userId, signature: sig })).toBe(false);
  });
});
