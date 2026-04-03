import * as React from "react";
import { Hr } from "@react-email/components";
import { Layout } from "../components/layout";
import { Heading } from "../components/heading";
import { Paragraph } from "../components/paragraph";
import { Button } from "../components/button";
import { BRAND } from "../../constants";

export interface NewsletterEmailProps {
  subject: string;
  previewText?: string;
  sections: Array<{
    title: string;
    body: string;
    ctaLabel?: string;
    ctaUrl?: string;
  }>;
  unsubscribeUrl?: string;
}

export function NewsletterEmail({
  subject = "Newsletter VibeFly",
  previewText,
  sections = [
    {
      title: "Novidade no VibeFly",
      body: "Conte\u00fade da se\u00e7\u00e3o aqui.",
      ctaLabel: "Saiba mais",
      ctaUrl: "https://app.vibefly.app",
    },
  ],
  unsubscribeUrl = "https://app.vibefly.app/unsubscribe",
}: NewsletterEmailProps) {
  return (
    <Layout
      preview={previewText ?? subject}
      showUnsubscribe
      unsubscribeUrl={unsubscribeUrl}
    >
      <Heading as="h1">{subject}</Heading>
      {sections.map((section, idx) => (
        <React.Fragment key={idx}>
          {idx > 0 && (
            <Hr style={{ borderColor: BRAND.slate100, margin: "24px 0" }} />
          )}
          <Heading as="h2">{section.title}</Heading>
          <Paragraph>{section.body}</Paragraph>
          {section.ctaLabel && section.ctaUrl && (
            <Button href={section.ctaUrl}>{section.ctaLabel}</Button>
          )}
        </React.Fragment>
      ))}
    </Layout>
  );
}

export default NewsletterEmail;
