// ============================================================
// Resend Audience Management
// ============================================================

import { getResendClient } from "../client";
import type { ResendAudience, ResendContact } from "../resend-shapes";

export async function createAudience(name: string) {
  const resend = getResendClient();
  const { data, error } = await resend.audiences.create({ name });
  if (error) throw new Error(`[email] Failed to create audience: ${error.message}`);
  return data!;
}

export async function listAudiences(): Promise<ResendAudience[]> {
  const resend = getResendClient();
  const { data, error } = await resend.audiences.list();
  if (error) throw new Error(`[email] Failed to list audiences: ${error.message}`);
  return data!.data as ResendAudience[];
}

export async function addContact(
  audienceId: string,
  email: string,
  firstName?: string,
  unsubscribed?: boolean
) {
  const resend = getResendClient();
  const { data, error } = await resend.contacts.create({
    audienceId,
    email,
    firstName,
    unsubscribed: unsubscribed ?? false,
  });
  if (error) throw new Error(`[email] Failed to add contact: ${error.message}`);
  return data!;
}

export async function removeContact(audienceId: string, contactId: string) {
  const resend = getResendClient();
  const { data, error } = await resend.contacts.remove({
    audienceId,
    id: contactId,
  });
  if (error) throw new Error(`[email] Failed to remove contact: ${error.message}`);
  return data!;
}

export async function listContacts(audienceId: string): Promise<ResendContact[]> {
  const resend = getResendClient();
  const { data, error } = await resend.contacts.list({ audienceId });
  if (error) throw new Error(`[email] Failed to list contacts: ${error.message}`);
  return data!.data as ResendContact[];
}

export async function updateContactSubscription(
  audienceId: string,
  contactId: string,
  unsubscribed: boolean
) {
  const resend = getResendClient();
  const { data, error } = await resend.contacts.update({
    audienceId,
    id: contactId,
    unsubscribed,
  });
  if (error) throw new Error(`[email] Failed to update contact: ${error.message}`);
  return data!;
}

/**
 * Sync a user to an audience. Adds if not present, updates if exists.
 */
export async function syncUserToAudience(
  audienceId: string,
  email: string,
  firstName?: string
) {
  return addContact(audienceId, email, firstName, false);
}
