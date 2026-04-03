import * as React from "react";
import { Layout } from "../components/layout";
import { Heading } from "../components/heading";
import { Paragraph } from "../components/paragraph";
import { Button } from "../components/button";

export interface MetaDisconnectedEmailProps {
  userName: string;
  workspaceName: string;
  reconnectUrl?: string;
}

export function MetaDisconnectedEmail({
  userName = "Usu\u00e1rio",
  workspaceName = "Meu Workspace",
  reconnectUrl = "https://app.vibefly.app/dashboard/connections",
}: MetaDisconnectedEmailProps) {
  return (
    <Layout preview="Conexão com Meta expirou no VibeFly">
      <Heading>Conex&atilde;o com Meta expirou</Heading>
      <Paragraph>
        Fala, {userName}. A conex&atilde;o do Meta no workspace{" "}
        <strong>{workspaceName}</strong> expirou ou foi revogada.
      </Paragraph>
      <Paragraph>
        Sem essa conex&atilde;o, o VibeFly n&atilde;o consegue acessar suas
        campanhas e dados de an&uacute;ncios. Reconecte para voltar a usar
        normalmente.
      </Paragraph>
      <Button href={reconnectUrl}>Reconectar Meta</Button>
      <Paragraph muted>
        Se voc&ecirc; mesmo revogou o acesso, pode ignorar este email.
      </Paragraph>
    </Layout>
  );
}

export default MetaDisconnectedEmail;
