import posthog from "posthog-js";

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;

let initialized = false;

export function initAnalytics() {
  if (initialized || !POSTHOG_KEY) return;
  initialized = true;

  posthog.init(POSTHOG_KEY, {
    api_host: "/ingest",
    ui_host: "https://us.posthog.com",
    // Cookieless, so the site needs no consent banner.
    persistence: "memory",
    person_profiles: "identified_only",
    capture_pageview: false,
    autocapture: false,
    // The shared GT project enables these remotely; the docs site doesn't need them.
    disable_session_recording: true,
    disable_surveys: true,
    capture_dead_clicks: false,
    capture_heatmaps: false,
    capture_performance: false,
  });
  posthog.register({ site: "paraglidejs" });

  document.addEventListener("click", handleGtLinkClick, { capture: true });
}

export function capturePageview() {
  if (initialized) posthog.capture("$pageview");
}

function handleGtLinkClick(event: MouseEvent) {
  if (!(event.target instanceof Element)) return;
  const link = event.target.closest<HTMLAnchorElement>("a[href]");
  if (!link || !/(^|\.)generaltranslation\.com$/.test(link.hostname)) return;

  posthog.capture("gt_link_clicked", {
    href: link.href,
    location: window.location.pathname,
  });
}
