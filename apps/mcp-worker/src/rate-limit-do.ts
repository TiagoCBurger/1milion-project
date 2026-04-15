import { DurableObject } from "cloudflare:workers";

/**
 * Per-workspace rate-limit + upload counters.
 *
 * One instance per workspace (stub via `idFromName(workspaceId)`). Counters live
 * in DO storage (SQLite-backed), giving atomic reads/increments with no KV write
 * pressure. Old windows are lazily overwritten; no cleanup needed.
 */

interface RateCheckBody {
  perMinute: number;
  perHour: number;
  perDay: number;
}

interface UploadCheckBody {
  kind: "images" | "videos";
  perDay: number;
}

export interface RateCheckResponse {
  limited: boolean;
  limit?: number;
  retryAfter?: number;
  scope?: "minute" | "hour" | "day";
  minuteCount: number;
  hourCount: number;
  dayCount: number;
}

export interface UploadCheckResponse {
  allowed: boolean;
  current: number;
  limit: number;
}

type Counter = { window: string; count: number };

export class RateLimitDO extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    if (url.pathname === "/check-rate") {
      const body = (await request.json()) as RateCheckBody;
      return Response.json(await this.checkRate(body));
    }

    if (url.pathname === "/check-upload") {
      const body = (await request.json()) as UploadCheckBody;
      return Response.json(await this.checkUpload(body));
    }

    return new Response("Not found", { status: 404 });
  }

  private async checkRate(body: RateCheckBody): Promise<RateCheckResponse> {
    const now = Date.now();
    const minuteWindow = String(Math.floor(now / 60_000));
    const hourWindow = String(Math.floor(now / 3_600_000));
    const dayWindow = new Date(now).toISOString().slice(0, 10);

    return this.ctx.blockConcurrencyWhile(async () => {
      const stored = await this.ctx.storage.get<Counter>([
        "rate:minute",
        "rate:hour",
        "rate:day",
      ]);

      const minute = rollWindow(stored.get("rate:minute"), minuteWindow);
      const hour = rollWindow(stored.get("rate:hour"), hourWindow);
      const day = rollWindow(stored.get("rate:day"), dayWindow);

      // Limit check (0 means "disabled" — skip, don't block)
      if (body.perMinute > 0 && minute.count >= body.perMinute) {
        return {
          limited: true,
          limit: body.perMinute,
          retryAfter: 60 - Math.floor((now % 60_000) / 1000),
          scope: "minute" as const,
          minuteCount: minute.count,
          hourCount: hour.count,
          dayCount: day.count,
        };
      }
      if (body.perHour > 0 && hour.count >= body.perHour) {
        return {
          limited: true,
          limit: body.perHour,
          retryAfter: 3600 - Math.floor((now % 3_600_000) / 1000),
          scope: "hour" as const,
          minuteCount: minute.count,
          hourCount: hour.count,
          dayCount: day.count,
        };
      }
      if (body.perDay > 0 && day.count >= body.perDay) {
        return {
          limited: true,
          limit: body.perDay,
          retryAfter: secondsUntilUtcMidnight(now),
          scope: "day" as const,
          minuteCount: minute.count,
          hourCount: hour.count,
          dayCount: day.count,
        };
      }

      minute.count += 1;
      hour.count += 1;
      day.count += 1;

      await this.ctx.storage.put({
        "rate:minute": minute,
        "rate:hour": hour,
        "rate:day": day,
      });

      return {
        limited: false,
        minuteCount: minute.count,
        hourCount: hour.count,
        dayCount: day.count,
      };
    });
  }

  private async checkUpload(body: UploadCheckBody): Promise<UploadCheckResponse> {
    if (!Number.isFinite(body.perDay) || body.perDay <= 0) {
      return { allowed: body.perDay === Infinity || body.perDay > 0, current: 0, limit: body.perDay };
    }

    const dayWindow = new Date().toISOString().slice(0, 10);
    const key = `upload:${body.kind}`;

    return this.ctx.blockConcurrencyWhile(async () => {
      const stored = await this.ctx.storage.get<Counter>(key);
      const counter = rollWindow(stored, dayWindow);

      if (counter.count >= body.perDay) {
        return { allowed: false, current: counter.count, limit: body.perDay };
      }

      counter.count += 1;
      await this.ctx.storage.put(key, counter);
      return { allowed: true, current: counter.count, limit: body.perDay };
    });
  }
}

function rollWindow(current: Counter | undefined, window: string): Counter {
  if (!current || current.window !== window) {
    return { window, count: 0 };
  }
  return { window: current.window, count: current.count };
}

function secondsUntilUtcMidnight(now: number): number {
  const d = new Date(now);
  const next = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() + 1,
    0,
    0,
    0,
    0,
  );
  return Math.ceil((next - now) / 1000);
}
