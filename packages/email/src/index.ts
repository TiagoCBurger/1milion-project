// ============================================================
// @vibefly/email — Public API
// ============================================================

// Client
export { getResendClient } from "./client";

// Send utilities
export { sendTransactionalEmail, sendBroadcast } from "./send";

// Audiences
export {
  createAudience,
  listAudiences,
  addContact,
  removeContact,
  listContacts,
  updateContactSubscription,
  syncUserToAudience,
} from "./audiences";

// Broadcasts
export {
  createBroadcastDraft,
  sendBroadcastById,
  listBroadcasts,
  getBroadcast,
} from "./broadcasts";

// Constants
export {
  FROM_ADDRESS,
  FROM_NOREPLY,
  REPLY_TO,
  EMAIL_TAGS,
  BRAND,
} from "./constants";

// Types
export type {
  EmailEventType,
  EmailEvent,
  EmailPreference,
  SendEmailOptions,
  SendBroadcastOptions,
} from "./types";

export type {
  ResendAudience,
  ResendBroadcastDetail,
  ResendBroadcastSummary,
  ResendContact,
} from "./resend-shapes";

// Templates — transactional
export { WelcomeEmail } from "./templates/transactional/welcome";
export { WorkspaceInviteEmail } from "./templates/transactional/workspace-invite";
export { BillingReceiptEmail } from "./templates/transactional/billing-receipt";
export { BillingFailedEmail } from "./templates/transactional/billing-failed";
export { PlanChangedEmail } from "./templates/transactional/plan-changed";
export { PlanCancelingEmail } from "./templates/transactional/plan-canceling";
export { MetaConnectedEmail } from "./templates/transactional/meta-connected";
export { MetaDisconnectedEmail } from "./templates/transactional/meta-disconnected";
export { UsageLimitWarningEmail } from "./templates/transactional/usage-limit-warning";

// Templates — auth
export { ConfirmEmailTemplate } from "./templates/auth/confirm-email";
export { ResetPasswordTemplate } from "./templates/auth/reset-password";
export { MagicLinkTemplate } from "./templates/auth/magic-link";
export { InviteUserTemplate } from "./templates/auth/invite-user";

// Templates — marketing
export { NewsletterEmail } from "./templates/marketing/newsletter";
export { FeatureAnnouncementEmail } from "./templates/marketing/feature-announcement";
export { TipsAndTricksEmail } from "./templates/marketing/tips-and-tricks";
