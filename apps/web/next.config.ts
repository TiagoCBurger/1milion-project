import type { NextConfig } from "next";

// Parse R2_PUBLIC_URL into a remotePatterns entry at build time. Missing env
// is fine in CI — we fall back to an empty allow-list so the build still
// succeeds; runtime will reject image loads if the var isn't wired up.
type RemotePattern = NonNullable<
  NonNullable<NextConfig["images"]>["remotePatterns"]
>[number];

function r2RemotePattern(): RemotePattern[] {
  const raw = process.env.R2_PUBLIC_URL;
  if (!raw) return [];
  try {
    const url = new URL(raw);
    return [
      {
        protocol: url.protocol === "http:" ? "http" : "https",
        hostname: url.hostname,
        pathname: "/**",
      },
    ];
  } catch {
    return [];
  }
}

const FACEBOOK_CDN_PATTERNS: RemotePattern[] = [
  // Facebook Page profile pictures — /me/accounts returns graph.facebook.com URLs
  { protocol: "https", hostname: "graph.facebook.com", pathname: "/**" },
  // Actual image bytes live on fbcdn.net subdomains.
  { protocol: "https", hostname: "**.fbcdn.net", pathname: "/**" },
];

const nextConfig: NextConfig = {
  transpilePackages: ["@vibefly/email"],
  images: {
    remotePatterns: [...r2RemotePattern(), ...FACEBOOK_CDN_PATTERNS],
  },
  // Server Actions handle file uploads up to 30MB (max_image_bytes). Default
  // 1MB default would break the creative upload flow.
  experimental: {
    serverActions: {
      bodySizeLimit: "32mb",
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
