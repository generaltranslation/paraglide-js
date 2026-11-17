// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Footer } from "./Footer";

describe("Footer", () => {
  it("credits General Translation as maintainer with a tracked link", () => {
    const html = renderToStaticMarkup(<Footer />);
    const document = new DOMParser().parseFromString(html, "text/html");

    expect(document.body.textContent?.replace(/\s+/g, " ")).toContain(
      "Paraglide JS is maintained by General Translation."
    );
    const maintainerLink = Array.from(document.querySelectorAll("footer a")).find(
      (link) => link.textContent?.trim() === "General Translation"
    );
    expect(maintainerLink?.getAttribute("href")).toBe(
      "https://generaltranslation.com/?utm_source=paraglidejs&utm_medium=footer"
    );
  });
});
