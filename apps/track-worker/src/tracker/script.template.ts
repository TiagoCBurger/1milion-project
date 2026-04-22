/* eslint-disable @typescript-eslint/no-explicit-any */
// Compiled into script.generated.ts by `pnpm build:tracker`.
// Served at GET /s.js. Loaded as:
//   <script async src="https://track.vibefly.app/s.js" data-site-id="pk_..."></script>

(() => {
  const script = document.currentScript as HTMLScriptElement | null;
  const publicKey = script?.getAttribute("data-site-id");
  const origin = script?.src ? new URL(script.src).origin : "";
  if (!publicKey || !origin) return;

  const ENDPOINT = origin + "/event";
  const USER_KEY = "vf_uid";
  const SESSION_KEY = "vf_sid";
  const SESSION_TTL_MS = 30 * 60 * 1000;

  const now = () => Date.now();
  const rid = () => {
    const r = "xxxxxxxxxxxx".replace(/x/g, () => ((Math.random() * 16) | 0).toString(16));
    return r + now().toString(16);
  };

  function safeLocal<T>(fn: () => T, fallback: T): T {
    try { return fn(); } catch { return fallback; }
  }

  function getUserId(): string {
    return safeLocal(() => {
      let id = localStorage.getItem(USER_KEY);
      if (!id) { id = rid(); localStorage.setItem(USER_KEY, id); }
      return id;
    }, "");
  }

  function getSessionId(): string {
    return safeLocal(() => {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { id?: string; ts?: number };
        if (parsed?.id && parsed.ts && now() - parsed.ts < SESSION_TTL_MS) {
          sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id: parsed.id, ts: now() }));
          return parsed.id;
        }
      }
      const id = rid();
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id, ts: now() }));
      return id;
    }, rid());
  }

  const state: {
    userId: string;
    user?: { id?: string; email?: string; phone?: string; external_id?: string; traits?: Record<string, unknown> };
    vitals: Record<string, number>;
  } = { userId: getUserId(), vitals: {} };

  function basePayload(): Record<string, unknown> {
    return {
      public_key: publicKey,
      session_id: getSessionId(),
      user_id: state.userId || undefined,
      url: location.href,
      referrer: document.referrer || undefined,
      page_title: document.title,
      screen_width: window.innerWidth,
      screen_height: window.innerHeight,
      timezone: safeLocal(() => Intl.DateTimeFormat().resolvedOptions().timeZone, undefined),
      language: navigator.language,
      user: state.user,
    };
  }

  function send(extra: Record<string, unknown>): void {
    const body = JSON.stringify({ ...basePayload(), ...extra });
    try {
      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: "application/json" });
        if (navigator.sendBeacon(ENDPOINT, blob)) return;
      }
    } catch {}
    try {
      fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
        credentials: "omit",
      }).catch(() => {});
    } catch {}
  }

  function pageview(): void {
    send({
      event_type: "pageview",
      web_vitals: Object.keys(state.vitals).length ? state.vitals : undefined,
    });
  }

  function track(
    name: string,
    props?: Record<string, unknown>,
    opts?: { value?: number; currency?: string; event_id?: string },
  ): void {
    send({
      event_type: "custom",
      event_name: name,
      event_id: opts?.event_id ?? rid(),
      props,
      value: opts?.value,
      currency: opts?.currency,
    });
  }

  function identify(userId: string, traits?: Record<string, unknown>): void {
    state.userId = userId;
    state.user = { id: userId, traits };
    safeLocal(() => localStorage.setItem(USER_KEY, userId), undefined);
    send({ event_type: "identify" });
  }

  // SPA navigation
  let lastUrl = location.href;
  const origPush = history.pushState;
  const origReplace = history.replaceState;
  const onNav = () => {
    if (location.href !== lastUrl) { lastUrl = location.href; pageview(); }
  };
  history.pushState = function (...args: any[]) {
    const r = (origPush as any).apply(this, args);
    setTimeout(onNav, 0);
    return r;
  };
  history.replaceState = function (...args: any[]) {
    const r = (origReplace as any).apply(this, args);
    setTimeout(onNav, 0);
    return r;
  };
  window.addEventListener("popstate", onNav);

  // Outbound clicks
  document.addEventListener(
    "click",
    (e) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      try {
        const u = new URL(a.href, location.href);
        if (u.hostname && u.hostname !== location.hostname) {
          send({ event_type: "outbound", outbound_url: u.href });
        }
      } catch {}
    },
    true,
  );

  // Web vitals (buffered PerformanceObserver — no external library)
  function observe(type: string, cb: (entry: any) => void): void {
    try {
      new PerformanceObserver((list) => list.getEntries().forEach(cb)).observe({
        type,
        buffered: true,
      } as PerformanceObserverInit);
    } catch {}
  }
  observe("largest-contentful-paint", (e) => { state.vitals.lcp = e.startTime; });
  observe("paint", (e) => { if (e.name === "first-contentful-paint") state.vitals.fcp = e.startTime; });
  let cls = 0;
  observe("layout-shift", (e) => {
    if (!e.hadRecentInput) { cls += e.value; state.vitals.cls = Math.round(cls * 1000) / 1000; }
  });
  observe("event", (e) => {
    const d = e.duration as number;
    if (typeof d === "number" && (!state.vitals.inp || d > state.vitals.inp)) state.vitals.inp = d;
  });
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (nav) state.vitals.ttfb = nav.responseStart;
  } catch {}

  (window as any).vibefly = { track, identify, pageview };

  if (document.readyState === "complete" || document.readyState === "interactive") pageview();
  else window.addEventListener("DOMContentLoaded", pageview, { once: true });

  window.addEventListener(
    "pagehide",
    () => { if (Object.keys(state.vitals).length) send({ event_type: "performance" }); },
    { capture: true },
  );
})();
