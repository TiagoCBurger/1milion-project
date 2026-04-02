import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Import after mocking
import {
  createCustomer,
  createSubscriptionCheckout,
  verifyWebhookSignature,
  verifyWebhookQuerySecret,
  getProductId,
  parseWebhookPayload,
} from "@/lib/abacatepay";

describe("AbacatePay Client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createCustomer", () => {
    it("calls the correct endpoint with email", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { id: "cust_123", email: "test@example.com" },
          success: true,
          error: null,
        }),
      });

      const customer = await createCustomer({ email: "test@example.com" });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.abacatepay.com/v2/customers/create",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer test-abacatepay-key",
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({ email: "test@example.com" }),
        })
      );
      expect(customer.id).toBe("cust_123");
    });

    it("throws on API error", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => "Bad request",
      });

      await expect(
        createCustomer({ email: "test@example.com" })
      ).rejects.toThrow("[abacatepay]");
    });

    it("throws on success=false response", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: null,
          success: false,
          error: "Customer already exists",
        }),
      });

      await expect(
        createCustomer({ email: "test@example.com" })
      ).rejects.toThrow("Customer already exists");
    });
  });

  describe("createSubscriptionCheckout", () => {
    it("sends correct payload with product ID and CARD method", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            id: "sub_123",
            status: "PENDING",
            url: "https://pay.abacatepay.com/checkout/sub_123",
          },
          success: true,
          error: null,
        }),
      });

      const result = await createSubscriptionCheckout({
        productId: "prod_test_pro_m",
        customerId: "cust_123",
        returnUrl: "https://app.com/success",
        externalId: "workspace-abc",
        metadata: { workspace_id: "workspace-abc", tier: "pro", cycle: "monthly" },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.abacatepay.com/v2/subscriptions/create",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            items: [{ id: "prod_test_pro_m", quantity: 1 }],
            methods: ["CARD"],
            customerId: "cust_123",
            returnUrl: "https://app.com/success",
            externalId: "workspace-abc",
            metadata: { workspace_id: "workspace-abc", tier: "pro", cycle: "monthly" },
          }),
        })
      );
      expect(result.url).toBe("https://pay.abacatepay.com/checkout/sub_123");
    });
  });

  describe("getProductId", () => {
    it("returns correct product ID for pro monthly", () => {
      expect(getProductId("pro", "monthly")).toBe("prod_test_pro_m");
    });

    it("returns correct product ID for max annually", () => {
      expect(getProductId("max", "annually")).toBe("prod_test_max_a");
    });

    it("throws for missing env var", () => {
      const original = process.env.ABACATEPAY_PRODUCT_PRO_MONTHLY;
      delete process.env.ABACATEPAY_PRODUCT_PRO_MONTHLY;

      expect(() => getProductId("pro", "monthly")).toThrow("Missing env var");

      process.env.ABACATEPAY_PRODUCT_PRO_MONTHLY = original;
    });
  });

  describe("verifyWebhookQuerySecret", () => {
    it("returns false for null secret", () => {
      expect(verifyWebhookQuerySecret(null)).toBe(false);
    });

    it("returns true for matching secret", () => {
      expect(verifyWebhookQuerySecret("test-webhook-secret")).toBe(true);
    });

    it("returns false for wrong secret", () => {
      expect(verifyWebhookQuerySecret("wrong-secret")).toBe(false);
    });
  });

  describe("verifyWebhookSignature", () => {
    // AbacatePay public key used for HMAC-SHA256 verification
    const ABACATEPAY_PUBLIC_KEY =
      "t9dXRhHHo3yDEj5pVDYz0frf7q6bMKyMRmxxCPIPp3RCplBfXRxqlC6ZpiWmOqj4L63qEaeUOtrCI8P0VMUgo6iIga2ri9ogaHFs0WIIywSMg0q7RmBfybe1E5XJcfC4IW3alNqym0tXoAKkzvfEjZxV6bE0oG2zJrNNYmUCKZyV0KZ3JS8Votf9EAWWYdiDkMkpbMdPggfh1EqHlVkMiTady6jOR3hyzGEHrIz2Ret0xHKMbiqkr9HS1JhNHDX9";

    it("returns false for null signature", async () => {
      const result = await verifyWebhookSignature('{"test": true}', null);
      expect(result).toBe(false);
    });

    it("returns false for invalid signature", async () => {
      const result = await verifyWebhookSignature(
        '{"test": true}',
        "invalidsignature"
      );
      expect(result).toBe(false);
    });

    it("validates a correct HMAC-SHA256 Base64 signature", async () => {
      const payload = '{"id":"evt_123","event":"subscription.completed"}';

      // Generate expected Base64 signature using the public key
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(ABACATEPAY_PUBLIC_KEY),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
      const expectedBase64 = btoa(String.fromCharCode(...new Uint8Array(sig)));

      const result = await verifyWebhookSignature(payload, expectedBase64);
      expect(result).toBe(true);
    });

    it("rejects tampered payload", async () => {
      const originalPayload = '{"id":"evt_123"}';
      const tamperedPayload = '{"id":"evt_456"}';

      // Sign the original
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(ABACATEPAY_PUBLIC_KEY),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(originalPayload));
      const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(sig)));

      // Verify with tampered body
      const result = await verifyWebhookSignature(tamperedPayload, signatureBase64);
      expect(result).toBe(false);
    });
  });

  describe("parseWebhookPayload", () => {
    it("parses v2 webhook payload with nested subscription data", () => {
      const raw = JSON.stringify({
        id: "log_123",
        event: "subscription.completed",
        apiVersion: 2,
        devMode: false,
        data: {
          subscription: {
            id: "subs_abc",
            amount: 3700,
            status: "ACTIVE",
            frequency: "MONTHLY",
            createdAt: "2026-04-01T00:00:00Z",
            updatedAt: "2026-04-01T00:00:05Z",
          },
          customer: { id: "cust_1", name: "Test", email: "t@t.com", taxId: "123" },
          checkout: {
            id: "bill_abc",
            externalId: "ws-1",
            metadata: { workspace_id: "ws-1", tier: "pro" },
          },
        },
      });
      const parsed = parseWebhookPayload(raw);
      expect(parsed.id).toBe("log_123");
      expect(parsed.event).toBe("subscription.completed");
      expect(parsed.apiVersion).toBe(2);
      expect(parsed.data.subscription.id).toBe("subs_abc");
      expect(parsed.data.subscription.status).toBe("ACTIVE");
      expect(parsed.data.checkout.externalId).toBe("ws-1");
    });
  });
});
