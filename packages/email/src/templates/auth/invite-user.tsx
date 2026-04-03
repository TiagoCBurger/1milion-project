import * as React from "react";
import { Layout } from "../components/layout";
import { Heading } from "../components/heading";
import { Paragraph } from "../components/paragraph";
import { Button } from "../components/button";

interface InviteUserProps {
  confirmationUrl?: string;
}

export function InviteUserTemplate({
  confirmationUrl = "{{ .ConfirmationURL }}",
}: InviteUserProps) {
  return (
    <Layout preview="Você foi convidado para o VibeFly">
      <Heading>Voc&ecirc; foi convidado!</Heading>
      <Paragraph>
        Algu&eacute;m te convidou para usar o VibeFly &mdash; a plataforma de
        gest&atilde;o de Meta Ads com IA. Clique no bot&atilde;o abaixo para
        aceitar o convite e criar sua conta.
      </Paragraph>
      <Button href={confirmationUrl}>Aceitar convite</Button>
      <Paragraph muted>
        Se voc&ecirc; n&atilde;o esperava este convite, pode ignorar este email.
      </Paragraph>
    </Layout>
  );
}

export default InviteUserTemplate;
