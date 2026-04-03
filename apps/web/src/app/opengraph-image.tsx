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
          background: "#0a0a0a",
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
        {/* Glow */}
        <div
          style={{
            position: "absolute",
            top: -80,
            left: 200,
            width: 800,
            height: 500,
            background: "rgba(124,58,237,0.18)",
            borderRadius: "50%",
            filter: "blur(80px)",
            display: "flex",
          }}
        />

        {/* Logo */}
        <div
          style={{
            fontSize: 72,
            fontWeight: 300,
            letterSpacing: "-3px",
            color: "#a78bfa",
            marginBottom: 20,
            display: "flex",
          }}
        >
          VibeFly
        </div>

        {/* Tagline line 1 */}
        <div
          style={{
            fontSize: 28,
            fontWeight: 300,
            color: "#94a3b8",
            display: "flex",
          }}
        >
          Connect your marketing tools to any AI via MCP.
        </div>

        {/* Tagline line 2 */}
        <div
          style={{
            fontSize: 28,
            fontWeight: 300,
            color: "#94a3b8",
            marginBottom: 48,
            display: "flex",
          }}
        >
          Manage campaigns with natural language.
        </div>

        {/* Pills */}
        <div style={{ display: "flex", gap: 12 }}>
          {["Claude", "Cursor", "ChatGPT", "MCP"].map((label) => (
            <div
              key={label}
              style={{
                padding: "8px 20px",
                borderRadius: 999,
                border: "1px solid rgba(124,58,237,0.5)",
                background: "rgba(124,58,237,0.1)",
                color: "#c4b5fd",
                fontSize: 18,
                display: "flex",
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
