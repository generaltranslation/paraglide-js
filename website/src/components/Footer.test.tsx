import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Footer } from "./Footer";

describe("Footer", () => {
  it("credits General Translation as maintainer with a tracked link", () => {
    const html = renderToStaticMarkup(<Footer />);

    expect(html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ")).toContain(
      "Paraglide JS is maintained by General Translation."
    );
    expect(html).toContain(
      'href="https://generaltranslation.com/?utm_source=paraglidejs&amp;utm_medium=footer"'
    );
  });
});
