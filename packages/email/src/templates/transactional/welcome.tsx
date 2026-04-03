import * as React from "react";
import { Layout } from "../components/layout";
import { Heading } from "../components/heading";
import { Paragraph } from "../components/paragraph";
import { Button } from "../components/button";

export interface WelcomeEmailProps {
  userName: string;
  dashboardUrl?: string;
}

export function WelcomeEmail({
  userName = "Usu\u00e1rio",
  dashboardUrl = "https://app.vibefly.app/dashboard",
}: WelcomeEmailProps) {
  return (
    <Layout preview={`Bem-vindo ao VibeFly, ${userName}!`}>
      <Heading>Bem-vindo ao VibeFly!</Heading>
      <Paragraph>
        Fala, {userName}! Sua conta no VibeFly est&aacute; pronta. Agora
        voc&ecirc; pode conectar seu Business Manager e come&ccedil;ar a
        gerenciar seus an&uacute;ncios de um jeito que faz sentido.
      </Paragraph>
      <Paragraph>Pr&oacute;ximos passos:</Paragraph>
      <Paragraph>
        1. Crie seu primeiro workspace
        <br />
        2. Conecte sua conta do Meta
        <br />
        3. Comece a usar a IA pra otimizar suas campanhas
      </Paragraph>
      <Button href={dashboardUrl}>Acessar o dashboard</Button>
      <Paragraph muted>
        Qualquer d&uacute;vida, &eacute; s&oacute; responder este email.
        Estamos aqui.
      </Paragraph>
    </Layout>
  );
}

export default WelcomeEmail;
