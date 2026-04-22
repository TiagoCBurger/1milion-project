// ============================================================
// AbacatePay v2 Client Library (server-side only)
// ============================================================

const BASE_URL = "https://api.abacatepay.com/v2";

function getApiKey(): string {
  const key = process.env.ABACATEPAY_API_KEY;
  if (!key) throw new Error("[abacatepay] ABACATEPAY_API_KEY is not set");
  return key;
}

function getWebhookSecret(): string {
  const secret = process.env.ABACATEPAY_WEBHOOK_SECRET;
  if (!secret) throw new Error("[abacatepay] ABACATEPAY_WEBHOOK_SECRET is not set");
  return secret;
}

// NOTE on webhook authentication:
//
// AbacatePay publishes a fixed HMAC "public key" in their docs — the same
// string for every merchant — so the HMAC X-Webhook-Signature cannot prove
// authenticity (anyone with internet access can compute it). The real gate
// is the per-merchant `webhookSecret` query-string parameter that the route
// compares against ABACATEPAY_WEBHOOK_SECRET.
//
// We still verify the HMAC because it acts as a body-integrity check and
// matches what the docs recommend, but `verifyWebhookSignature` is NOT a
// sufficient gate on its own — the query secret check MUST run first and
// MUST be timing-safe.
const ABACATEPAY_PUBLIC_KEY =
  "t9dXRhHHo3yDEj5pVDYz0frf7q6bMKyMRmxxCPIPp3RCplBfXRxqlC6ZpiWmOqj4L63qEaeUOtrCI8P0VMUgo6iIga2ri9ogaHFs0WIIywSMg0q7RmBfybe1E5XJcfC4IW3alNqym0tXoAKkzvfEjZxV6bE0oG2zJrNNYmUCKZyV0KZ3JS8Votf9EAWWYdiDkMkpbMdPggfh1EqHlVkMiTady6jOR3hyzGEHrIz2Ret0xHKMbiqkr9HS1JhNHDX9";

// ── Types ────────────────────────────────────────────────────

export interface AbacatePayCustomer {
  id: string;
  email: string;
  name?: string;
  cellphone?: string;
  taxId?: string;
}

export interface AbacatePayCheckout {
  id: string;
  externalId: string | null;
  url: string;
  amount: number;
  paidAmount: number | null;
  status: string;
  metadata: Record<string, string> | null;
  createdAt: string;
  updatedAt: string;
}

interface AbacatePayResponse<T> {
  data: T;
  success: boolean;
  error: string | null;
}

export interface WebhookSubscriptionData {
  id: string;
  amount: number;
  currency: string;
  method: string;
  status: string;
  frequency: string;
  createdAt: string;
  updatedAt: string;
  canceledAt: string | null;
}

export interface AbacatePayWebhookPayload {
  id: string;
  event: string;
  apiVersion: number;
  devMode: boolean;
  data: {
    subscription: WebhookSubscriptionData;
    customer: { id: string; name: string; email: string; taxId: string };
    payment: Record<string, unknown>;
    checkout: AbacatePayCheckout;
  };
}

// ── Internal fetch helper ────────────────────────────────────

async function abacateRequest<T>(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getApiKey()}`,
    "Content-Type": "application/json",
  };

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[abacatepay] ${method} ${path} failed (${res.status}): ${text}`);
  }

  const json = (await res.json()) as AbacatePayResponse<T>;
  if (!json.success) {
    throw new Error(`[abacatepay] ${method} ${path} error: ${json.error}`);
  }
  return json.data;
}

// ── Customers ────────────────────────────────────────────────

export async function createCustomer(params: {
  email: string;
  name?: string;
  taxId?: string;
  cellphone?: string;
}): Promise<AbacatePayCustomer> {
  return abacateRequest<AbacatePayCustomer>("POST", "/customers/create", params);
}

export async function listCustomers(): Promise<AbacatePayCustomer[]> {
  return abacateRequest<AbacatePayCustomer[]>("GET", "/customers/list");
}

// ── Subscriptions ────────────────────────────────────────────

export interface CreateSubscriptionCheckoutParams {
  productId: string;
  customerId?: string;
  returnUrl?: string;
  completionUrl?: string;
  externalId?: string;
  metadata?: Record<string, string>;
}

export async function createSubscriptionCheckout(
  params: CreateSubscriptionCheckoutParams
): Promise<AbacatePayCheckout> {
  const body: Record<string, unknown> = {
    items: [{ id: params.productId, quantity: 1 }],
    methods: ["CARD"],
  };
  if (params.customerId) body.customerId = params.customerId;
  if (params.returnUrl) body.returnUrl = params.returnUrl;
  if (params.completionUrl) body.completionUrl = params.completionUrl;
  if (params.externalId) body.externalId = params.externalId;
  if (params.metadata) body.metadata = params.metadata;

  return abacateRequest<AbacatePayCheckout>("POST", "/subscriptions/create", body);
}

// ── Product ID mapping ───────────────────────────────────────

type PaidTier = "pro" | "max";
type BillingCycle = "monthly";

const PRODUCT_ENV_MAP: Record<`${PaidTier}_${BillingCycle}`, string> = {
  pro_monthly: "ABACATEPAY_PRODUCT_PRO_MONTHLY",
  max_monthly: "ABACATEPAY_PRODUCT_MAX_MONTHLY",
};

export function getProductId(tier: PaidTier, cycle: BillingCycle): string {
  const envKey = PRODUCT_ENV_MAP[`${tier}_${cycle}`];
  const productId = process.env[envKey];
  if (!productId) {
    throw new Error(`[abacatepay] Missing env var: ${envKey}`);
  }
  return productId;
}

// ── Webhook verification ─────────────────────────────────────

/**
 * Verifies the webhook query string secret using a timing-safe comparison.
 * This is the ONLY real authenticity check — see the note on ABACATEPAY_PUBLIC_KEY.
 */
export function verifyWebhookQuerySecret(querySecret: string | null): boolean {
  if (!querySecret) return false;
  const expected = getWebhookSecret();
  if (querySecret.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= querySecret.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Verifies the HMAC-SHA256 signature from X-Webhook-Signature header.
 * Uses AbacatePay's public key and Base64 encoding per v2 docs.
 */
export async function verifyWebhookSignature(
  rawBody: string,
  signature: string | null
): Promise<boolean> {
  if (!signature) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(ABACATEPAY_PUBLIC_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));

  // Encode as Base64 per AbacatePay v2 docs
  const expectedBase64 = btoa(String.fromCharCode(...new Uint8Array(sig)));

  // Timing-safe comparison
  if (expectedBase64.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expectedBase64.length; i++) {
    mismatch |= expectedBase64.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}

export function parseWebhookPayload(rawBody: string): AbacatePayWebhookPayload {
  return JSON.parse(rawBody) as AbacatePayWebhookPayload;
}
