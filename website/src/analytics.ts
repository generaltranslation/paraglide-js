const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const PRODUCTION_HOSTNAME = "paraglidejs.com";

let initialized = false;

export async function initAnalytics() {
  if (
    initialized ||
    !POSTHOG_KEY ||
    window.location.hostname !== PRODUCTION_HOSTNAME
  ) {
    return;
  }
  initialized = true;

  const { default: posthog } = await import("posthog-js");

  posthog.init(POSTHOG_KEY, {
    defaults: "2026-08-30",
    api_host: "/ingest",
    ui_host: "https://us.posthog.com",
    // No cookies or browser storage, so the site needs no consent banner. PostHog
    // counts visitors with a daily server-side hash; the project must allow cookieless events.
    cookieless_mode: "always",
    person_profiles: "identified_only",
    capture_pageview: "history_change",
    capture_pageleave: false,
    autocapture: false,
    advanced_disable_feature_flags: true,
    // The shared GT project enables these remotely; the docs site doesn't need them.
    disable_session_recording: true,
    disable_surveys: true,
    disable_product_tours: true,
    disable_conversations: true,
    capture_exceptions: false,
    capture_dead_clicks: false,
    capture_heatmaps: false,
    capture_performance: false,
  });

  document.addEventListener("click", handleGtLinkClick, { capture: true });
  document.addEventListener("auxclick", handleGtLinkClick, { capture: true });

  function handleGtLinkClick(event: MouseEvent) {
    if (event.type === "auxclick" && event.button !== 1) return;
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLAnchorElement>("a[href]");
    if (!link || !/(^|\.)generaltranslation\.com$/.test(link.hostname)) return;

    posthog.capture("gt_link_clicked", { href: link.href });
  }
}
