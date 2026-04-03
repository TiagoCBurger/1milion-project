import * as React from "react";
import { Layout } from "../components/layout";
import { Heading } from "../components/heading";
import { Paragraph } from "../components/paragraph";
import { Button } from "../components/button";

interface ConfirmEmailProps {
  confirmationUrl?: string;
}

export function ConfirmEmailTemplate({
  confirmationUrl = "{{ .ConfirmationURL }}",
}: ConfirmEmailProps) {
  return (
    <Layout preview="Confirme seu email no VibeFly">
      <Heading>Confirme seu email</Heading>
      <Paragraph>
        Obrigado por se cadastrar no VibeFly! Para ativar sua conta e
        come&ccedil;ar a gerenciar seus an&uacute;ncios com IA, confirme seu
        endere&ccedil;o de email clicando no bot&atilde;o abaixo.
      </Paragraph>
      <Button href={confirmationUrl}>Confirmar email</Button>
      <Paragraph muted>
        Se voc&ecirc; n&atilde;o criou uma conta no VibeFly, pode ignorar este
        email.
      </Paragraph>
    </Layout>
  );
}

export default ConfirmEmailTemplate;
