import * as React from "react";
import { Layout } from "../components/layout";
import { Heading } from "../components/heading";
import { Paragraph } from "../components/paragraph";
import { Button } from "../components/button";

interface ResetPasswordProps {
  confirmationUrl?: string;
}

export function ResetPasswordTemplate({
  confirmationUrl = "{{ .ConfirmationURL }}",
}: ResetPasswordProps) {
  return (
    <Layout preview="Redefinir sua senha no VibeFly">
      <Heading>Redefinir senha</Heading>
      <Paragraph>
        Recebemos uma solicita&ccedil;&atilde;o para redefinir a senha da sua
        conta no VibeFly. Clique no bot&atilde;o abaixo para criar uma nova
        senha.
      </Paragraph>
      <Button href={confirmationUrl}>Redefinir senha</Button>
      <Paragraph muted>
        Se voc&ecirc; n&atilde;o solicitou a redefini&ccedil;&atilde;o de senha,
        pode ignorar este email. Sua senha atual permanece inalterada.
      </Paragraph>
    </Layout>
  );
}

export default ResetPasswordTemplate;
