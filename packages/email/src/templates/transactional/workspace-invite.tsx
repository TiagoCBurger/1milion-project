import * as React from "react";
import { Layout } from "../components/layout";
import { Heading } from "../components/heading";
import { Paragraph } from "../components/paragraph";
import { Button } from "../components/button";

export interface WorkspaceInviteEmailProps {
  inviterName: string;
  workspaceName: string;
  inviteUrl: string;
}

export function WorkspaceInviteEmail({
  inviterName = "Algu\u00e9m",
  workspaceName = "Meu Workspace",
  inviteUrl = "https://app.vibefly.app/invite",
}: WorkspaceInviteEmailProps) {
  return (
    <Layout preview={`${inviterName} te convidou para ${workspaceName}`}>
      <Heading>Convite para workspace</Heading>
      <Paragraph>
        {inviterName} te convidou para participar do workspace{" "}
        <strong>{workspaceName}</strong> no VibeFly.
      </Paragraph>
      <Paragraph>
        Aceite o convite para come&ccedil;ar a colaborar na gest&atilde;o de
        an&uacute;ncios com o time.
      </Paragraph>
      <Button href={inviteUrl}>Aceitar convite</Button>
      <Paragraph muted>
        Se voc&ecirc; n&atilde;o conhece {inviterName}, pode ignorar este email.
      </Paragraph>
    </Layout>
  );
}

export default WorkspaceInviteEmail;
