"use client";

import { useCallback } from "react";

const TRACK_WORKER_URL =
  process.env.NEXT_PUBLIC_TRACK_WORKER_URL ?? "https://track-worker.ticburger.workers.dev";

// ── Cookie helpers ──────────────────────────────────────────

function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match?.[1];
}

function getFbc(): string | undefined {
  // First check cookie
  const cookie = getCookie("_fbc");
  if (cookie) return cookie;
  // Fallback: build from fbclid URL param
  if (typeof window === "undefined") return undefined;
  const params = new URLSearchParams(window.location.search);
  const fbclid = params.get("fbclid");
  if (fbclid) {
    return `fb.1.${Date.now()}.${fbclid}`;
  }
  return undefined;
}

function getFbp(): string | undefined {
  return getCookie("_fbp");
}

// ── Types ───────────────────────────────────────────────────

interface UserData {
  email?: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  external_id?: string;
}

interface CustomData {
  value?: number;
  currency?: string;
  content_name?: string;
  content_category?: string;
  content_ids?: string[];
  content_type?: string;
  num_items?: number;
  order_id?: string;
  search_string?: string;
  status?: string;
  [key: string]: unknown;
}

interface TrackOptions {
  user_data?: UserData;
  custom_data?: CustomData;
  event_source_url?: string;
}

// ── Hook ────────────────────────────────────────────────────

export function useMetaTrack(organizationId: string) {
  const track = useCallback(
    async (eventName: string, options?: TrackOptions) => {
      const eventId = crypto.randomUUID();

      // 1. Fire client-side Pixel event (deduplicated via eventID)
      if (typeof window !== "undefined" && typeof window.fbq === "function") {
        window.fbq("track", eventName, options?.custom_data ?? {}, {
          eventID: eventId,
        });
      }

      // 2. Send to CAPI via track-worker (server-side, enriched)
      const fbc = getFbc();
      const fbp = getFbp();

      const payload = {
        organization_id: organizationId,
        event_name: eventName,
        event_id: eventId,
        event_time: Math.floor(Date.now() / 1000),
        event_source_url: options?.event_source_url ?? window?.location?.href,
        action_source: "website" as const,
        user_data: {
          ...options?.user_data,
          fbc,
          fbp,
        },
        custom_data: options?.custom_data,
      };

      try {
        await fetch(`${TRACK_WORKER_URL}/track`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          keepalive: true,
        });
      } catch (err) {
        console.error("[useMetaTrack] CAPI request failed:", err);
      }
    },
    [organizationId]
  );

  return { track };
}
