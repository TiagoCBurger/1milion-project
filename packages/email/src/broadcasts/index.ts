// ============================================================
// Resend Broadcast Management
// ============================================================

import { getResendClient } from "../client";

export async function createBroadcastDraft(opts: {
  audienceId: string;
  from: string;
  subject: string;
  html: string;
  name: string;
}) {
  const resend = getResendClient();
  const { data, error } = await resend.broadcasts.create({
    audienceId: opts.audienceId,
    from: opts.from,
    subject: opts.subject,
    html: opts.html,
    name: opts.name,
  });
  if (error) throw new Error(`[email] Failed to create broadcast: ${error.message}`);
  return data!;
}

export async function sendBroadcastById(broadcastId: string) {
  const resend = getResendClient();
  const { data, error } = await resend.broadcasts.send(broadcastId);
  if (error) throw new Error(`[email] Failed to send broadcast: ${error.message}`);
  return data!;
}

export async function listBroadcasts() {
  const resend = getResendClient();
  const { data, error } = await resend.broadcasts.list();
  if (error) throw new Error(`[email] Failed to list broadcasts: ${error.message}`);
  return data!.data;
}

export async function getBroadcast(broadcastId: string) {
  const resend = getResendClient();
  const { data, error } = await resend.broadcasts.get(broadcastId);
  if (error) throw new Error(`[email] Failed to get broadcast: ${error.message}`);
  return data!;
}
