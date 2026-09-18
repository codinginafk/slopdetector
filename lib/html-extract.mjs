/**
 * html-extract.mjs — fetch a URL and pull the main article text.
 * Uses cheerio, degrades to a text-dump fallback if the page is weird.
 */

import * as cheerio from "cheerio";

const MAX_BYTES = 2_000_000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; SlopDetector/1.0; +https://slopdetector.praveentechworld.com)";

export async function extractMainText(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`Could not fetch page (HTTP ${res.status}).`);
  }
  if (!(res.headers.get("content-type") || "").includes("text/html")) {
    throw new Error("URL does not point to an HTML page.");
  }

  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) {
    throw new Error("Page is too large to analyze.");
  }
  const html = Buffer.from(buf).toString("utf8").replace(/<\0/g, "<").replace(/\0/g, "");

  const $ = cheerio.load(html);

  // strip scripts/styles/iframes/nav/forms + author bio boxes (site boilerplate, not article voice)
  $("script, style, noscript, iframe, svg, nav, header, footer, aside, form, button, .ad, .ads, [class*='advert'], [id*='advert']").remove();
  $(".author-bio, .author-box, .author-card, .post-author, .article-author, [class*='author-bio'], [class*='author-box'], [rel='author']").remove();

  const article = $("article, main, [role='main'], .post-content, .entry-content, .article-content, .content").first();
  const container = article.length ? article : $("body");

  const clean = container
    .clone()
    .find("div, span, p")
    .contents()
    .filter(function () {
      return this.type === "text" && (this.parentNode ? this.parentNode.name === "p" || this.parentNode.name === "li" || this.parentNode.name === "h1" || this.parentNode.name === "h2" || this.parentNode.name === "h3" || this.parentNode.name === "h4" : false);
    })
    .map(function () {
      return $(this).text().trim();
    })
    .get();

  let text = clean.join("\n\n");

  if (text.length < 200) {
    // fallback: dump visible text of the body
    text = $("body").text().replace(/\s*\n\s*\n+/g, "\n").replace(/[ \t]+/g, " ").trim();
  }

  if (text.length < 50) {
    throw new Error("No readable article text found on that page.");
  }
  return text;
}
