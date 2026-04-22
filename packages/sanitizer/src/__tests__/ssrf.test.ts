import { describe, it, expect } from "vitest";
import {
  isPrivateIpv4,
  isPrivateIpv6,
  isPrivateAddress,
  validateExternalUrl,
} from "../ssrf";

describe("isPrivateIpv4", () => {
  it.each([
    "10.0.0.1",
    "10.255.255.254",
    "172.16.0.1",
    "172.31.255.254",
    "192.168.1.1",
    "127.0.0.1",
    "169.254.169.254", // AWS / GCP / Azure metadata
    "100.64.0.1", // CGNAT
    "0.0.0.0",
    "224.0.0.1", // multicast
    "240.0.0.1",
    "192.0.2.1", // TEST-NET-1
    "203.0.113.1", // TEST-NET-3
  ])("blocks %s", (addr) => {
    expect(isPrivateIpv4(addr)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "192.169.0.1", "104.16.0.1"])(
    "allows public %s",
    (addr) => {
      expect(isPrivateIpv4(addr)).toBe(false);
    },
  );

  it("rejects malformed addresses", () => {
    expect(isPrivateIpv4("not.an.ip")).toBe(false);
    expect(isPrivateIpv4("999.999.999.999")).toBe(false);
    expect(isPrivateIpv4("10.0.0")).toBe(false);
  });
});

describe("isPrivateIpv6", () => {
  it.each([
    "::1",
    "::",
    "fe80::1",
    "fc00::1",
    "fd00::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "2001:db8::1",
  ])("blocks %s", (addr) => {
    expect(isPrivateIpv6(addr)).toBe(true);
  });

  it.each(["2606:4700:4700::1111", "2620:fe::fe", "::ffff:8.8.8.8"])(
    "allows public %s",
    (addr) => {
      expect(isPrivateIpv6(addr)).toBe(false);
    },
  );
});

describe("isPrivateAddress", () => {
  it("dispatches to v4 / v6 by literal", () => {
    expect(isPrivateAddress("127.0.0.1")).toBe(true);
    expect(isPrivateAddress("::1")).toBe(true);
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
  });
});

describe("validateExternalUrl", () => {
  const fakeResolver = (mapping: Record<string, string[]>) =>
    async (host: string) => mapping[host] ?? [];

  it("blocks file: protocol", async () => {
    const r = await validateExternalUrl(
      "file:///etc/passwd",
      fakeResolver({}),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("blocked_protocol");
  });

  it("blocks gopher: protocol", async () => {
    const r = await validateExternalUrl(
      "gopher://attacker.example/",
      fakeResolver({}),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("blocked_protocol");
  });

  it("blocks non-standard ports", async () => {
    const r = await validateExternalUrl(
      "https://example.com:9000/x",
      fakeResolver({ "example.com": ["8.8.8.8"] }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("blocked_port");
  });

  it("blocks IP literals in private range", async () => {
    const r = await validateExternalUrl(
      "http://169.254.169.254/latest/meta-data/",
      fakeResolver({}),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("blocked_host");
    }
  });

  it("blocks hostnames that resolve to private IPs (DNS-rebinding pattern)", async () => {
    const r = await validateExternalUrl(
      "https://attacker-rebound.example.com/",
      fakeResolver({ "attacker-rebound.example.com": ["10.0.0.1"] }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("blocked_host");
    }
  });

  it("blocks when ANY resolved address is private (mixed v4 + v6)", async () => {
    const r = await validateExternalUrl(
      "https://mixed.example/",
      fakeResolver({ "mixed.example": ["8.8.8.8", "fe80::1"] }),
    );
    expect(r.ok).toBe(false);
  });

  it("blocks hostnames with no DNS records", async () => {
    const r = await validateExternalUrl(
      "https://nxdomain.example/",
      fakeResolver({}),
    );
    expect(r.ok).toBe(false);
  });

  it("allows public HTTPS host", async () => {
    const r = await validateExternalUrl(
      "https://cdn.example.com/img.jpg",
      fakeResolver({ "cdn.example.com": ["104.16.0.1"] }),
    );
    expect(r.ok).toBe(true);
  });

  it("allows IPv6 public host", async () => {
    const r = await validateExternalUrl(
      "https://[2606:4700::1111]/img",
      fakeResolver({}),
    );
    expect(r.ok).toBe(true);
  });
});
