import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Img,
  Text,
  Hr,
  Font,
} from "@react-email/components";
import * as React from "react";
import { BRAND } from "../../constants";

interface LayoutProps {
  preview?: string;
  children: React.ReactNode;
  showUnsubscribe?: boolean;
  unsubscribeUrl?: string;
}

export function Layout({
  preview,
  children,
  showUnsubscribe = false,
  unsubscribeUrl,
}: LayoutProps) {
  return (
    <Html lang="pt-BR">
      <Head>
        <Font
          fontFamily="Inter"
          fallbackFontFamily="Helvetica"
          webFont={{
            url: "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hjQ.woff2",
            format: "woff2",
          }}
          fontWeight={400}
          fontStyle="normal"
        />
        <Font
          fontFamily="Inter"
          fallbackFontFamily="Helvetica"
          webFont={{
            url: "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuI6fAZ9hjQ.woff2",
            format: "woff2",
          }}
          fontWeight={700}
          fontStyle="normal"
        />
      </Head>
      <Body
        style={{
          backgroundColor: BRAND.slate100,
          fontFamily: "Inter, Helvetica, Arial, sans-serif",
          margin: 0,
          padding: 0,
        }}
      >
        {preview && (
          <Text style={{ display: "none", maxHeight: 0, overflow: "hidden" }}>
            {preview}
          </Text>
        )}
        <Container
          style={{
            maxWidth: "600px",
            margin: "0 auto",
            backgroundColor: BRAND.white,
            borderRadius: "8px",
            overflow: "hidden",
            marginTop: "40px",
            marginBottom: "40px",
          }}
        >
          {/* Header with gradient */}
          <Section
            style={{
              background: BRAND.gradient,
              padding: "24px 32px",
              textAlign: "center" as const,
            }}
          >
            <Text
              style={{
                fontSize: "24px",
                fontWeight: 800,
                color: BRAND.white,
                margin: 0,
                letterSpacing: "-0.5px",
              }}
            >
              VibeFly
            </Text>
          </Section>

          {/* Content */}
          <Section style={{ padding: "32px" }}>{children}</Section>

          {/* Footer */}
          <Hr style={{ borderColor: BRAND.slate100, margin: "0 32px" }} />
          <Section style={{ padding: "24px 32px", textAlign: "center" as const }}>
            <Text
              style={{
                fontSize: "12px",
                color: BRAND.slate400,
                margin: "0 0 8px 0",
              }}
            >
              VibeFly &mdash; Gestão de Meta Ads com IA
            </Text>
            <Text
              style={{
                fontSize: "12px",
                color: BRAND.slate400,
                margin: 0,
              }}
            >
              &copy; {new Date().getFullYear()} VibeFly. Todos os direitos
              reservados.
            </Text>
            {showUnsubscribe && unsubscribeUrl && (
              <Text
                style={{
                  fontSize: "12px",
                  color: BRAND.slate400,
                  margin: "8px 0 0 0",
                }}
              >
                <a
                  href={unsubscribeUrl}
                  style={{ color: BRAND.slate400, textDecoration: "underline" }}
                >
                  Cancelar inscri&ccedil;&atilde;o
                </a>
              </Text>
            )}
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
