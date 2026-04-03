import * as React from "react";
import { Hr, Text } from "@react-email/components";
import { Layout } from "../components/layout";
import { Heading } from "../components/heading";
import { Paragraph } from "../components/paragraph";
import { Button } from "../components/button";
import { BRAND } from "../../constants";

export interface TipsAndTricksEmailProps {
  tipTitle: string;
  tipIntro: string;
  steps: Array<{ step: number; title: string; description: string }>;
  ctaLabel?: string;
  ctaUrl?: string;
  unsubscribeUrl?: string;
}

export function TipsAndTricksEmail({
  tipTitle = "Como usar a IA pra economizar tempo",
  tipIntro = "Uma t\u00e9cnica simples que gest\u00f5es de tr\u00e1fego usam todo dia.",
  steps = [
    { step: 1, title: "Primeiro passo", description: "Descri\u00e7\u00e3o do passo." },
    { step: 2, title: "Segundo passo", description: "Descri\u00e7\u00e3o do passo." },
  ],
  ctaLabel = "Ver mais dicas",
  ctaUrl = "https://app.vibefly.app",
  unsubscribeUrl = "https://app.vibefly.app/unsubscribe",
}: TipsAndTricksEmailProps) {
  return (
    <Layout
      preview={tipTitle}
      showUnsubscribe
      unsubscribeUrl={unsubscribeUrl}
    >
      <Heading as="h1">{tipTitle}</Heading>
      <Paragraph>{tipIntro}</Paragraph>
      <Hr style={{ borderColor: BRAND.slate100, margin: "24px 0" }} />
      {steps.map((s) => (
        <div
          key={s.step}
          style={{
            display: "flex",
            alignItems: "flex-start",
            marginBottom: "20px",
          }}
        >
          <div
            style={{
              minWidth: "28px",
              height: "28px",
              borderRadius: "50%",
              backgroundColor: BRAND.violet,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginRight: "12px",
              flexShrink: 0,
            }}
          >
            <Text
              style={{
                fontFamily: "Inter, Helvetica, Arial, sans-serif",
                fontSize: "12px",
                fontWeight: 700,
                color: BRAND.white,
                margin: 0,
                lineHeight: "28px",
                textAlign: "center" as const,
              }}
            >
              {s.step}
            </Text>
          </div>
          <div>
            <Text
              style={{
                fontFamily: "Inter, Helvetica, Arial, sans-serif",
                fontSize: "16px",
                fontWeight: 700,
                color: BRAND.slate900,
                margin: "0 0 4px 0",
              }}
            >
              {s.title}
            </Text>
            <Text
              style={{
                fontFamily: "Inter, Helvetica, Arial, sans-serif",
                fontSize: "14px",
                color: BRAND.slate700,
                margin: 0,
                lineHeight: "1.5",
              }}
            >
              {s.description}
            </Text>
          </div>
        </div>
      ))}
      <Hr style={{ borderColor: BRAND.slate100, margin: "24px 0" }} />
      <Button href={ctaUrl}>{ctaLabel}</Button>
    </Layout>
  );
}

export default TipsAndTricksEmail;
