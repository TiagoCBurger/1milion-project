import { Heading as EmailHeading } from "@react-email/components";
import * as React from "react";
import { BRAND } from "../../constants";

interface HeadingProps {
  children: React.ReactNode;
  as?: "h1" | "h2" | "h3";
}

const sizes = {
  h1: "24px",
  h2: "20px",
  h3: "16px",
};

export function Heading({ children, as = "h2" }: HeadingProps) {
  return (
    <EmailHeading
      as={as}
      style={{
        fontFamily: "Inter, Helvetica, Arial, sans-serif",
        fontWeight: 700,
        fontSize: sizes[as],
        color: BRAND.slate900,
        margin: "0 0 16px 0",
        lineHeight: "1.3",
      }}
    >
      {children}
    </EmailHeading>
  );
}
