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
          background: "#f9f8f3",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 40,
            right: 80,
            width: 420,
            height: 420,
            background: "rgba(217, 255, 95, 0.35)",
            borderRadius: "50%",
            filter: "blur(72px)",
            display: "flex",
          }}
        />

        <div
          style={{
            fontSize: 64,
            fontWeight: 500,
            letterSpacing: "-2px",
            color: "#2c2920",
            marginBottom: 24,
            display: "flex",
          }}
        >
          VibeFly
        </div>

        <div
          style={{
            fontSize: 26,
            fontWeight: 400,
            color: "#6b6658",
            display: "flex",
            textAlign: "center",
            maxWidth: 720,
            lineHeight: 1.35,
          }}
        >
          Conecte o marketing à IA — sem fricção. MCP para Claude, Cursor e mais.
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 48 }}>
          {["Claude", "Cursor", "ChatGPT", "MCP"].map((label) => (
            <div
              key={label}
              style={{
                padding: "10px 22px",
                borderRadius: 999,
                border: "1px solid #e5e4de",
                background: "#ffffff",
                color: "#2c2920",
                fontSize: 17,
                fontWeight: 500,
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
