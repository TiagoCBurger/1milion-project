import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "VibeFly — Marketing tools for you and your AI agents";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#000000",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Glow background */}
        <div
          style={{
            position: "absolute",
            top: "-100px",
            left: "50%",
            transform: "translateX(-50%)",
            width: "800px",
            height: "500px",
            background:
              "radial-gradient(ellipse at center, rgba(124,58,237,0.25) 0%, rgba(6,182,212,0.1) 60%, transparent 100%)",
            borderRadius: "50%",
          }}
        />

        {/* Logo */}
        <div
          style={{
            fontSize: 64,
            fontWeight: 300,
            letterSpacing: "-2px",
            background: "linear-gradient(90deg, #7c3aed, #06b6d4)",
            backgroundClip: "text",
            color: "transparent",
            marginBottom: 24,
          }}
        >
          VibeFly
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: 28,
            fontWeight: 300,
            color: "#94a3b8",
            textAlign: "center",
            maxWidth: 700,
            lineHeight: 1.4,
          }}
        >
          Connect your marketing tools to any AI via MCP.{"\n"}Manage campaigns with natural language.
        </div>

        {/* Pills */}
        <div
          style={{
            display: "flex",
            gap: 12,
            marginTop: 48,
          }}
        >
          {["Claude", "Cursor", "ChatGPT", "MCP"].map((label) => (
            <div
              key={label}
              style={{
                padding: "8px 20px",
                borderRadius: 999,
                border: "1px solid rgba(124,58,237,0.4)",
                background: "rgba(124,58,237,0.08)",
                color: "#c4b5fd",
                fontSize: 18,
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    ),
    size
  );
}
