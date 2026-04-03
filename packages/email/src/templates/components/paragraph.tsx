import { Text } from "@react-email/components";
import * as React from "react";
import { BRAND } from "../../constants";

interface ParagraphProps {
  children: React.ReactNode;
  muted?: boolean;
}

export function Paragraph({ children, muted = false }: ParagraphProps) {
  return (
    <Text
      style={{
        fontFamily: "Inter, Helvetica, Arial, sans-serif",
        fontSize: "16px",
        lineHeight: "1.6",
        color: muted ? BRAND.slate400 : BRAND.slate700,
        margin: "0 0 16px 0",
      }}
    >
      {children}
    </Text>
  );
}
