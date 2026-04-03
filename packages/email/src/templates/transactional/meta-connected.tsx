import * as React from "react";
import { Layout } from "../components/layout";
import { Heading } from "../components/heading";
import { Paragraph } from "../components/paragraph";
import { Button } from "../components/button";

export interface MetaConnectedEmailProps {
  userName: string;
  businessName: string;
  accountCount: number;
  dashboardUrl?: string;
}

export function MetaConnectedEmail({
  userName = "Usu\u00e1rio",
  businessName = "Meu Business",
  accountCount = 3,
  dashboardUrl = "https://app.vibefly.app/dashboard",
}: MetaConnectedEmailProps) {
  return (
    <Layout preview={`${businessName} conectado ao VibeFly`}>
      <Heading>Meta conectado!</Heading>
      <Paragraph>
        Fala, {userName}! Sua conta do Meta foi conectada com sucesso ao
        VibeFly.
      </Paragraph>
      <Paragraph>
        <strong>{businessName}</strong> est&aacute; pronto com{" "}
        <strong>
          {accountCount} conta{accountCount !== 1 ? "s" : ""} de
          an&uacute;ncio
        </strong>{" "}
        dispon&iacute;ve{accountCount !== 1 ? "is" : "l"}.
      </Paragraph>
      <Paragraph>
        Agora voc&ecirc; pode usar a IA para analisar, criar e otimizar suas
        campanhas direto pelo VibeFly.
      </Paragraph>
      <Button href={dashboardUrl}>Ir para o dashboard</Button>
    </Layout>
  );
}

export default MetaConnectedEmail;
