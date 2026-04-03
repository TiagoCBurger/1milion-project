// ============================================================
// Email Send Utilities
// ============================================================

import { render } from "@react-email/components";
import { createElement } from "react";
import { getResendClient } from "./client";
import { FROM_ADDRESS, FROM_NOREPLY, REPLY_TO } from "./constants";
import type { SendEmailOptions, SendBroadcastOptions } from "./types";

/**
 * Send a transactional email to one or more recipients.
 * Renders a React Email template and sends via Resend.
 */
export async function sendTransactionalEmail<P extends Record<string, unknown>>(
  opts: SendEmailOptions<P>
): Promise<{ id: string }> {
  const resend = getResendClient();
  const html = await render(createElement(opts.template, opts.props));

  const { data, error } = await resend.emails.send({
    from: FROM_NOREPLY,
    to: Array.isArray(opts.to) ? opts.to : [opts.to],
    subject: opts.subject,
    html,
    replyTo: opts.replyTo ?? REPLY_TO,
    tags: opts.tags,
  });

  if (error) {
    throw new Error(`[email] Failed to send: ${error.message}`);
  }

  return { id: data!.id };
}

/**
 * Send a marketing broadcast to a Resend audience.
 */
export async function sendBroadcast<P extends Record<string, unknown>>(
  opts: SendBroadcastOptions<P>
): Promise<{ id: string }> {
  const resend = getResendClient();
  const html = await render(createElement(opts.template, opts.props));

  const { data, error } = await resend.broadcasts.create({
    audienceId: opts.audienceId,
    from: opts.from ?? FROM_ADDRESS,
    subject: opts.subject,
    html,
    name: opts.name,
  });

  if (error) {
    throw new Error(`[email] Failed to create broadcast: ${error.message}`);
  }

  // Send the broadcast
  const broadcastId = data!.id;
  const sendResult = await resend.broadcasts.send(broadcastId);

  if (sendResult.error) {
    throw new Error(`[email] Failed to send broadcast: ${sendResult.error.message}`);
  }

  return { id: broadcastId };
}
