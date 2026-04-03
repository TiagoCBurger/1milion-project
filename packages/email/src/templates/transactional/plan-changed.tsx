import * as React from "react";
import { Layout } from "../components/layout";
import { Heading } from "../components/heading";
import { Paragraph } from "../components/paragraph";
import { Button } from "../components/button";

export interface PlanChangedEmailProps {
  userName: string;
  oldTier: string;
  newTier: string;
  dashboardUrl?: string;
}

export function PlanChangedEmail({
  userName = "Usu\u00e1rio",
  oldTier = "Pro",
  newTier = "Max",
  dashboardUrl = "https://app.vibefly.app/dashboard",
}: PlanChangedEmailProps) {
  return (
    <Layout preview={`Plano atualizado para VibeFly ${newTier}`}>
      <Heading>Plano atualizado</Heading>
      <Paragraph>
        Fala, {userName}! Seu plano foi alterado de{" "}
        <strong>VibeFly {oldTier}</strong> para{" "}
        <strong>VibeFly {newTier}</strong>.
      </Paragraph>
      <Paragraph>
        Os novos limites e recursos j&aacute; est&atilde;o ativos na sua conta.
      </Paragraph>
      <Button href={dashboardUrl}>Ver meu plano</Button>
    </Layout>
  );
}

export default PlanChangedEmail;
