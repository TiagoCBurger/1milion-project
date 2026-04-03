// ============================================================
// Email Constants
// ============================================================

export const FROM_ADDRESS = "VibeFly <oi@vibefly.app>";
export const FROM_NOREPLY = "VibeFly <noreply@vibefly.app>";
export const REPLY_TO = "suporte@vibefly.app";

export const EMAIL_TAGS = {
  WELCOME: "welcome",
  BILLING: "billing",
  WORKSPACE_INVITE: "workspace-invite",
  AUTH: "auth",
  MARKETING: "marketing",
  ALERT: "alert",
  META: "meta-connection",
} as const;

// Brand colors for templates
export const BRAND = {
  violet: "#7C3AED",
  cyan: "#06B6D4",
  amber: "#F59E0B",
  slate900: "#0F172A",
  slate700: "#334155",
  slate400: "#94A3B8",
  slate100: "#F1F5F9",
  white: "#FFFFFF",
  gradient: "linear-gradient(135deg, #7C3AED, #06B6D4)",
} as const;
