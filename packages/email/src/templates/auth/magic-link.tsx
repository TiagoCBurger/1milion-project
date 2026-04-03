import * as React from "react";
import { Layout } from "../components/layout";
import { Heading } from "../components/heading";
import { Paragraph } from "../components/paragraph";
import { Button } from "../components/button";

interface MagicLinkProps {
  confirmationUrl?: string;
}

export function MagicLinkTemplate({
  confirmationUrl = "{{ .ConfirmationURL }}",
}: MagicLinkProps) {
  return (
    <Layout preview="Seu link de acesso ao VibeFly">
      <Heading>Link de acesso</Heading>
      <Paragraph>
        Clique no bot&atilde;o abaixo para acessar sua conta no VibeFly. Este
        link &eacute; v&aacute;lido por 1 hora.
      </Paragraph>
      <Button href={confirmationUrl}>Acessar VibeFly</Button>
      <Paragraph muted>
        Se voc&ecirc; n&atilde;o solicitou este link, pode ignorar este email.
      </Paragraph>
    </Layout>
  );
}

export default MagicLinkTemplate;
