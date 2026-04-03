import * as React from "react";
import { Text } from "@react-email/components";
import { Layout } from "../components/layout";
import { Heading } from "../components/heading";
import { Paragraph } from "../components/paragraph";
import { BRAND } from "../../constants";

export interface BillingReceiptEmailProps {
  userName: string;
  tierName: string;
  amount: string;
  cycle: string;
  date?: string;
}

export function BillingReceiptEmail({
  userName = "Usu\u00e1rio",
  tierName = "Pro",
  amount = "R$ 97",
  cycle = "mensal",
  date = new Date().toLocaleDateString("pt-BR"),
}: BillingReceiptEmailProps) {
  return (
    <Layout preview={`Pagamento confirmado — VibeFly ${tierName}`}>
      <Heading>Pagamento confirmado</Heading>
      <Paragraph>
        Fala, {userName}! Seu pagamento foi processado com sucesso.
      </Paragraph>
      <div
        style={{
          backgroundColor: BRAND.slate100,
          borderRadius: "8px",
          padding: "20px",
          marginBottom: "16px",
        }}
      >
        <Text
          style={{
            fontFamily: "Inter, Helvetica, Arial, sans-serif",
            fontSize: "14px",
            color: BRAND.slate700,
            margin: "0 0 8px 0",
          }}
        >
          <strong>Plano:</strong> VibeFly {tierName}
        </Text>
        <Text
          style={{
            fontFamily:
              "JetBrains Mono, Consolas, monospace",
            fontSize: "24px",
            fontWeight: 700,
            color: BRAND.violet,
            margin: "0 0 8px 0",
          }}
        >
          {amount}/{cycle === "mensal" ? "m\u00eas" : "ano"}
        </Text>
        <Text
          style={{
            fontFamily: "Inter, Helvetica, Arial, sans-serif",
            fontSize: "12px",
            color: BRAND.slate400,
            margin: 0,
          }}
        >
          Data: {date}
        </Text>
      </div>
      <Paragraph muted>
        Este email serve como comprovante de pagamento. Se tiver qualquer
        d&uacute;vida sobre a cobran&ccedil;a, responda este email.
      </Paragraph>
    </Layout>
  );
}

export default BillingReceiptEmail;
