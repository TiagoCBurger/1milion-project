import * as React from "react";
import { Layout } from "../components/layout";
import { Heading } from "../components/heading";
import { Paragraph } from "../components/paragraph";
import { Button } from "../components/button";
import { BRAND } from "../../constants";
import { Text } from "@react-email/components";

export interface FeatureAnnouncementEmailProps {
  featureName: string;
  tagline: string;
  description: string;
  benefits: string[];
  ctaLabel?: string;
  ctaUrl?: string;
  unsubscribeUrl?: string;
}

export function FeatureAnnouncementEmail({
  featureName = "Nova Funcionalidade",
  tagline = "Isso vai mudar como voc\u00ea trabalha.",
  description = "Descri\u00e7\u00e3o da funcionalidade.",
  benefits = ["Beneficio 1", "Beneficio 2", "Beneficio 3"],
  ctaLabel = "Experimentar agora",
  ctaUrl = "https://app.vibefly.app",
  unsubscribeUrl = "https://app.vibefly.app/unsubscribe",
}: FeatureAnnouncementEmailProps) {
  return (
    <Layout
      preview={`Novo no VibeFly: ${featureName}`}
      showUnsubscribe
      unsubscribeUrl={unsubscribeUrl}
    >
      <div
        style={{
          backgroundColor: BRAND.violet,
          borderRadius: "6px",
          padding: "6px 12px",
          display: "inline-block",
          marginBottom: "16px",
        }}
      >
        <Text
          style={{
            fontFamily: "Inter, Helvetica, Arial, sans-serif",
            fontSize: "12px",
            fontWeight: 700,
            color: BRAND.white,
            margin: 0,
            textTransform: "uppercase" as const,
            letterSpacing: "0.5px",
          }}
        >
          Novo
        </Text>
      </div>
      <Heading as="h1">{featureName}</Heading>
      <Paragraph>
        <em>{tagline}</em>
      </Paragraph>
      <Paragraph>{description}</Paragraph>
      {benefits.length > 0 && (
        <>
          <Paragraph>O que muda pra voc\u00ea:</Paragraph>
          {benefits.map((benefit, idx) => (
            <Paragraph key={idx}>&rarr; {benefit}</Paragraph>
          ))}
        </>
      )}
      <Button href={ctaUrl}>{ctaLabel}</Button>
    </Layout>
  );
}

export default FeatureAnnouncementEmail;
