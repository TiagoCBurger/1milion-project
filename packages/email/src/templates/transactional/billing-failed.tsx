import * as React from "react";
import { Layout } from "../components/layout";
import { Heading } from "../components/heading";
import { Paragraph } from "../components/paragraph";
import { Button } from "../components/button";

export interface BillingFailedEmailProps {
  userName: string;
  tierName: string;
  billingUrl?: string;
  /** Deadline after which access is downgraded to free. Locale-formatted string. */
  gracePeriodEnd?: string;
}

export function BillingFailedEmail({
  userName = "Usu\u00e1rio",
  tierName = "Pro",
  billingUrl = "https://app.vibefly.app/dashboard/billing",
  gracePeriodEnd,
}: BillingFailedEmailProps) {
  return (
    <Layout preview="Problema no pagamento do VibeFly">
      <Heading>Problema no pagamento</Heading>
      <Paragraph>
        Fala, {userName}. N&atilde;o conseguimos processar o pagamento do seu
        plano VibeFly {tierName}.
      </Paragraph>
      <Paragraph>
        Isso pode acontecer por cart&atilde;o expirado, limite insuficiente ou
        bloqueio do banco. Atualize seus dados de pagamento para manter seu
        plano ativo.
      </Paragraph>
      {gracePeriodEnd ? (
        <Paragraph>
          Seu acesso {tierName} continua liberado at&eacute; {gracePeriodEnd}.
          Depois dessa data a conta volta automaticamente para o plano
          gratuito.
        </Paragraph>
      ) : null}
      <Button href={billingUrl}>Atualizar pagamento</Button>
      <Paragraph muted>
        Se o problema persistir, responda este email que a gente resolve junto.
      </Paragraph>
    </Layout>
  );
}

export default BillingFailedEmail;
