/**
 * Public typings for values returned from Resend SDK calls.
 * Resend's declaration file keeps `Audience`, `Contact`, `Broadcast`, etc. as
 * non-exported interfaces, which triggers TS4058 on our exported wrappers.
 */

export type ResendAudience = {
  id: string;
  name: string;
  created_at: string;
};

export type ResendContact = {
  created_at: string;
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  unsubscribed: boolean;
};

/** Row from `broadcasts.list()` (subset of full broadcast). */
export type ResendBroadcastSummary = {
  id: string;
  name: string;
  audience_id: string | null;
  status: "draft" | "sent" | "queued";
  created_at: string;
  scheduled_at: string | null;
  sent_at: string | null;
};

/** Full broadcast from `broadcasts.get()`. */
export type ResendBroadcastDetail = {
  object: "broadcast";
  id: string;
  name: string;
  audience_id: string | null;
  from: string | null;
  subject: string | null;
  reply_to: string[] | null;
  preview_text: string | null;
  status: "draft" | "sent" | "queued";
  created_at: string;
  scheduled_at: string | null;
  sent_at: string | null;
};
