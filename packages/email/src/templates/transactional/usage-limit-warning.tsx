import * as React from "react";
import { Text } from "@react-email/components";
import { Layout } from "../components/layout";
import { Heading } from "../components/heading";
import { Paragraph } from "../components/paragraph";
import { Button } from "../components/button";
import { BRAND } from "../../constants";

export interface UsageLimitWarningEmailProps {
  userName: string;
  currentUsage: number;
  limit: number;
  resource: string;
  upgradeUrl?: string;
}

export function UsageLimitWarningEmail({
  userName = "Usu\u00e1rio",
  currentUsage = 400,
  limit = 500,
  resource = "requisi\u00e7\u00f5es di\u00e1rias",
  upgradeUrl = "https://app.vibefly.app/dashboard/billing",
}: UsageLimitWarningEmailProps) {
  const percentage = Math.round((currentUsage / limit) * 100);

  return (
    <Layout preview={`${percentage}% do limite de ${resource} usado`}>
      <Heading>Aten&ccedil;&atilde;o: limite pr&oacute;ximo</Heading>
      <Paragraph>
        Fala, {userName}. Voc&ecirc; j&aacute; usou{" "}
        <strong>{percentage}%</strong> do seu limite de {resource}.
      </Paragraph>
      <div
        style={{
          backgroundColor: BRAND.slate100,
          borderRadius: "8px",
          padding: "20px",
          marginBottom: "16px",
          textAlign: "center" as const,
        }}
      >
        <Text
          style={{
            fontFamily:
              "JetBrains Mono, Consolas, monospace",
            fontSize: "32px",
            fontWeight: 700,
            color: BRAND.amber,
            margin: "0 0 4px 0",
          }}
        >
          {currentUsage.toLocaleString("pt-BR")} /{" "}
          {limit.toLocaleString("pt-BR")}
        </Text>
        <Text
          style={{
            fontFamily: "Inter, Helvetica, Arial, sans-serif",
            fontSize: "14px",
            color: BRAND.slate400,
            margin: 0,
          }}
        >
          {resource}
        </Text>
      </div>
      <Paragraph>
        Quando o limite for atingido, novas requisi&ccedil;&otilde;es
        ser&atilde;o bloqueadas at&eacute; o pr&oacute;ximo per&iacute;odo.
        Considere fazer upgrade para continuar sem interrup&ccedil;&atilde;o.
      </Paragraph>
      <Button href={upgradeUrl}>Fazer upgrade</Button>
    </Layout>
  );
}

export default UsageLimitWarningEmail;
