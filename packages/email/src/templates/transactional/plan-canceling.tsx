import * as React from "react";
import { Layout } from "../components/layout";
import { Heading } from "../components/heading";
import { Paragraph } from "../components/paragraph";
import { Button } from "../components/button";

export interface PlanCancelingEmailProps {
  userName: string;
  tierName: string;
  endDate: string;
  billingUrl?: string;
}

export function PlanCancelingEmail({
  userName = "Usu\u00e1rio",
  tierName = "Pro",
  endDate = "01/05/2026",
  billingUrl = "https://app.vibefly.app/dashboard/billing",
}: PlanCancelingEmailProps) {
  return (
    <Layout preview="Cancelamento agendado no VibeFly">
      <Heading>Cancelamento agendado</Heading>
      <Paragraph>
        Fala, {userName}. Confirmamos o cancelamento do seu plano VibeFly{" "}
        {tierName}.
      </Paragraph>
      <Paragraph>
        Voc&ecirc; continua com acesso a todos os recursos at&eacute;{" "}
        <strong>{endDate}</strong>. Depois disso, sua conta volta para o plano
        gratuito.
      </Paragraph>
      <Paragraph>
        Mudou de ideia? Voc&ecirc; pode reativar o plano a qualquer momento
        antes da data.
      </Paragraph>
      <Button href={billingUrl}>Reativar plano</Button>
      <Paragraph muted>
        Se quiser compartilhar o motivo do cancelamento, &eacute; s&oacute;
        responder este email. Ajuda a gente a melhorar.
      </Paragraph>
    </Layout>
  );
}

export default PlanCancelingEmail;
