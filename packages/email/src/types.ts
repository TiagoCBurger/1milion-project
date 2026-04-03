// ============================================================
// Email System Types
// ============================================================

export type EmailEventType =
  | "sent"
  | "delivered"
  | "bounced"
  | "complained"
  | "opened"
  | "clicked";

export interface EmailEvent {
  id: string;
  resend_email_id: string;
  event_type: EmailEventType;
  to_email: string;
  subject: string | null;
  tags: Record<string, string>;
  metadata: Record<string, unknown>;
  workspace_id: string | null;
  user_id: string | null;
  created_at: string;
}

export interface EmailPreference {
  id: string;
  user_id: string;
  marketing_opted_in: boolean;
  product_updates: boolean;
  tips_and_tricks: boolean;
  unsubscribed_at: string | null;
  updated_at: string;
}

export interface SendEmailOptions<P extends Record<string, unknown>> {
  to: string | string[];
  subject: string;
  template: React.FC<P>;
  props: P;
  tags?: { name: string; value: string }[];
  replyTo?: string;
}

export interface SendBroadcastOptions<P extends Record<string, unknown>> {
  audienceId: string;
  from?: string;
  subject: string;
  template: React.FC<P>;
  props: P;
  name: string;
}
