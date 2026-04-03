import { Button as EmailButton } from "@react-email/components";
import * as React from "react";
import { BRAND } from "../../constants";

interface ButtonProps {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
}

export function Button({ href, children, variant = "primary" }: ButtonProps) {
  const isPrimary = variant === "primary";

  return (
    <EmailButton
      href={href}
      style={{
        display: "inline-block",
        padding: "12px 24px",
        fontSize: "14px",
        fontWeight: 700,
        fontFamily: "Inter, Helvetica, Arial, sans-serif",
        color: isPrimary ? BRAND.white : BRAND.violet,
        backgroundColor: isPrimary ? BRAND.violet : "transparent",
        border: isPrimary ? "none" : `2px solid ${BRAND.violet}`,
        borderRadius: "6px",
        textDecoration: "none",
        textAlign: "center" as const,
      }}
    >
      {children}
    </EmailButton>
  );
}
