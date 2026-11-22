/**
 * B564. A web page is read as its article.
 * Scripts, styles, navigation, headers, footers, cookie banners and link lists
 * stay out. Headings, paragraphs and tables stay.
 */
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

const BLOCKS = new Set([
  "P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6",
  "LI", "UL", "OL", "TABLE", "BLOCKQUOTE", "SECTION", "ARTICLE", "FIGCAPTION",
]);

export function sourceIsHtml(source, text = "") {
  const body = String(text ?? source?.text ?? "");
  const head = body.slice(0, 800).trim().toLowerCase();
  if (head.startsWith("<!doctype") || head.startsWith("<html") || /<script[\s>]/.test(head)) return true;
  const mime = String(source?.mimeType || "").toLowerCase();
  const name = String(source?.name || source?.filename || source?.title || "");
  const named = mime.includes("html") || /\.html?$/i.test(name);
  if (!named) return false;
  return !body.trim() && typeof source?.contentBase64 === "string" && source.contentBase64.length > 0;
}

function renderNode(node) {
  if (!node) return "";
  if (node.nodeType === 3) return node.textContent || "";
  const name = node.nodeName;
  if (name === "SCRIPT" || name === "STYLE" || name === "NOSCRIPT" || name === "NAV") return "";
  if (name === "BR") return "\n";
  if (name === "TR") {
    const cells = [...node.children].map((cell) => renderNode(cell).replace(/\s+/g, " ").trim()).filter(Boolean);
    return `${cells.join("\t")}\n`;
  }
  const inner = [...node.childNodes].map((child) => renderNode(child)).join("");
  if (BLOCKS.has(name)) return `\n${inner.trim()}\n`;
  return inner;
}

function articleTextFromHtml(contentHtml) {
  const dom = new JSDOM(`<body>${contentHtml}</body>`);
  const text = renderNode(dom.window.document.body);
  return text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * The main article as plain text. A page with no article throws.
 * @param {string} html
 */
export function extractArticleFromHtml(html) {
  if (typeof html !== "string" || !html.trim()) {
    throw new Error("extractArticleFromHtml: html is missing");
  }
  const dom = new JSDOM(html, { url: "https://local.invalid/article" });
  const article = new Readability(dom.window.document).parse();
  const content = typeof article?.content === "string" ? article.content.trim() : "";
  if (!content) {
    throw new Error("extractArticleFromHtml: no article text");
  }
  const text = articleTextFromHtml(content);
  if (!text) {
    throw new Error("extractArticleFromHtml: no article text");
  }
  return text;
}
