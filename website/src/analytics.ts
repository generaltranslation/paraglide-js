import posthog from "posthog-js";

/**
 * PostHog analytics, sent to General Translation's PostHog project.
 *
 * - Cookieless (`persistence: "memory"`), so the site needs no consent banner.
 * - Sent through the `/ingest` proxy (see worker/index.ts) so ad blockers don't drop events.
 * - Disabled when `VITE_POSTHOG_KEY` isn't set, e.g. in local development.
 */

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;

let initialized = false;

export function initAnalytics() {
  if (initialized || typeof window === "undefined" || !POSTHOG_KEY) return;
  initialized = true;

  posthog.init(POSTHOG_KEY, {
    api_host: "/ingest",
    ui_host: "https://us.posthog.com",
    persistence: "memory",
    person_profiles: "identified_only",
    // Pageviews are captured on route changes, see capturePageview().
    capture_pageview: false,
    autocapture: false,
    // The shared project enables these remotely; the docs site doesn't need them.
    disable_session_recording: true,
    disable_surveys: true,
    capture_dead_clicks: false,
    capture_heatmaps: false,
    capture_performance: false,
  });
  posthog.register({ site: "paraglidejs" });

  document.addEventListener("click", handleGtLinkClick, { capture: true });
}

export function capture(event: string, properties?: Record<string, unknown>) {
  if (!initialized) return;
  posthog.capture(event, properties);
}

export function capturePageview() {
  capture("$pageview");
}

function handleGtLinkClick(event: MouseEvent) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const link = target.closest<HTMLAnchorElement>("a[href]");
  if (!link) return;

  let url: URL;
  try {
    url = new URL(link.href, window.location.href);
  } catch {
    return;
  }
  if (!/(^|\.)generaltranslation\.com$/.test(url.hostname)) return;

  capture("gt_link_clicked", {
    href: url.href,
    location: link.dataset.location ?? window.location.pathname,
  });
}
