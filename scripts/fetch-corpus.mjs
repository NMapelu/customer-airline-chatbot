#!/usr/bin/env node
// Fetch the KQ policy pages listed in docs/sources.json and convert them to markdown.
// KQ's text is never committed (this repo is public): it is fetched into docs/public/,
// which git ignores, and from there only goes into the private database at ingest.
//
//   npm run fetch-corpus            (writes docs/public/)
//   node scripts/fetch-corpus.mjs <out-dir> [sources.json]
//
// Behind an HTTPS proxy, set NODE_USE_ENV_PROXY=1 so Node's fetch uses HTTPS_PROXY.
//
// Writes <out-dir>/<slug>.md with the four front-matter keys check-corpus expects.
// Pages that redirect elsewhere, come back empty, or can't be fetched are skipped;
// the script then exits 1 and lists them. Needs Node 22 (built-in fetch), no system tools.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { extractText, getDocumentProxy } from "unpdf";

const MIN_WORDS = 50;
const USER_AGENT = "Mozilla/5.0 (compatible; kq-policy-assistant corpus fetcher)";

// Blocks that are never policy text: scripts, navigation, forms and promo panels.
// They are dropped from the parsed DOM by turndown, not with regexes, so odd markup can't slip through.
const DROP_TAGS = ["script", "style", "noscript", "svg", "form", "button", "nav", "aside", "iframe", "img", "picture", "video"];
const DROP_CLASSES = /\b(panel--swoosh|breadcrumb|cookie|heroblock__image)/;

function makeTurndown() {
  const td = new TurndownService({ headingStyle: "atx", bulletListMarker: "-", codeBlockStyle: "fenced" });
  td.use(gfm);
  td.remove(DROP_TAGS);
  td.addRule("dropPanels", {
    filter: (node) => node.nodeType === 1 && DROP_CLASSES.test(node.getAttribute("class") ?? ""),
    replacement: () => "",
  });
  // Page headings become ## and ### only.
  td.addRule("headings", {
    filter: ["h1", "h2", "h3", "h4", "h5", "h6"],
    replacement: (content, node) => {
      const text = content.trim();
      if (!text) return "";
      return `\n\n${node.nodeName === "H1" ? "##" : "###"} ${text}\n\n`;
    },
  });
  // KQ tables have no <th> row, which the gfm plugin leaves as raw HTML; use the first row as the header.
  td.addRule("tables", {
    filter: "table",
    replacement: (_content, node) => {
      // turndown has already escaped backslashes and other markdown characters (a\b becomes a\\b),
      // so only "|" still needs escaping. Escaping backslashes again would double them.
      const escapePipes = (md) => md.split("|").join("\\|");
      const cell = (c) => escapePipes(td.turndown(c.innerHTML).replace(/\s*\n+\s*/g, " ")).trim();
      const isCell = (c) => c.nodeName === "TD" || c.nodeName === "TH";
      const rows = Array.from(node.getElementsByTagName("tr")).map((tr) => Array.from(tr.childNodes).filter(isCell).map(cell));
      if (!rows.length) return "";
      const width = Math.max(...rows.map((r) => r.length));
      const line = (r) => `| ${Array.from({ length: width }, (_, i) => r[i] ?? "").join(" | ")} |`;
      return `\n\n${[line(rows[0]), line(Array(width).fill("---")), ...rows.slice(1).map(line)].join("\n")}\n\n`;
    },
  });
  return td;
}

function textOf(html) {
  // Used only for the page title. Any "<" or ">" left after removing tags is dropped too.
  return html.replace(/<[^>]+>/g, " ").replace(/[<>]/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

// Return the page's policy body: the main column without hero image, sidebar or promo panels.
function mainHtml(html) {
  const start = html.indexOf("<main");
  const end = html.indexOf("</main>");
  if (start < 0 || end < 0) return { title: "", body: "" };
  let body = html.slice(start, end);
  const headings = [...body.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => textOf(m[1]));
  const title = headings.find(Boolean) ?? "";
  const col = body.indexOf("layout-withsidebar__main");
  const side = body.indexOf("layout-withsidebar__side");
  if (col >= 0) body = body.slice(body.indexOf(">", col) + 1, side > col ? side : undefined);
  // Accordion text sits inside <template> elements, which a DOM parser keeps out of the tree.
  body = body.replace(/<template\b[^>]*>/gi, "<div>").replace(/<\/template>/gi, "</div>");
  return { title, body };
}

function tidy(md) {
  return md.replace(/^(#{2,3}) *$/gm, "").replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

async function pdfToMarkdown(bytes) {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: false });
  return text.map((page) => page.trim()).filter(Boolean).join("\n\n");
}

const wordCount = (s) => s.split(/\s+/).filter(Boolean).length;
const slugTitle = (slug) => slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const yamlString = (s) => JSON.stringify(s); // JSON strings are valid YAML scalars

async function convertPage({ slug, url, title: sourceTitle }, td) {
  let res;
  try {
    res = await fetch(url, { redirect: "follow", headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(60_000) });
  } catch (err) {
    return { skip: `fetch failed (${err.cause?.code ?? err.message})` };
  }
  if (!res.ok) return { skip: `HTTP ${res.status}` };
  const finalUrl = res.url;
  if (res.redirected && finalUrl.replace(/\/$/, "") !== url.replace(/\/$/, "")) {
    return { skip: `redirects to ${finalUrl}` };
  }
  const type = res.headers.get("content-type") ?? "";
  let title;
  let md;
  if (type.includes("pdf")) {
    title = sourceTitle || slugTitle(slug);
    md = `## ${title}\n\n${await pdfToMarkdown(await res.arrayBuffer())}`;
  } else {
    const page = mainHtml(await res.text());
    title = sourceTitle || page.title || slugTitle(slug);
    md = page.body ? td.turndown(page.body) : "";
  }
  md = tidy(md);
  const words = wordCount(md);
  if (words < MIN_WORDS) return { skip: `empty after conversion (${words} words; may be rendered by JavaScript)` };
  if (!/^## /m.test(md)) md = `## ${title}\n\n${md}`;
  const retrieved = new Date().toISOString().slice(0, 10);
  const front = `---\ntitle: ${yamlString(title)}\naudience: public\nsource_url: ${finalUrl}\nretrieved: ${retrieved}\n---\n\n`;
  return { markdown: front + md, words, headings: (md.match(/^##+ /gm) ?? []).length };
}

async function main() {
  const [outDir, sourcesPath = "docs/sources.json"] = process.argv.slice(2);
  if (!outDir) {
    console.error("usage: node fetch-corpus.mjs <out-dir> [sources.json]");
    process.exit(2);
  }
  const sources = JSON.parse(await readFile(sourcesPath, "utf8"));
  await mkdir(outDir, { recursive: true });
  const td = makeTurndown();
  const skipped = [];
  for (const source of sources) {
    const result = await convertPage(source, td);
    if (result.skip) {
      skipped.push(`${source.slug}: ${result.skip}`);
      console.log(`SKIP ${source.slug}: ${result.skip}`);
      continue;
    }
    await writeFile(path.join(outDir, `${source.slug}.md`), result.markdown, "utf8");
    console.log(`OK   ${source.slug}: ${result.words} words, ${result.headings} headings`);
  }
  if (skipped.length) {
    console.error(`\n${skipped.length} of ${sources.length} pages skipped:\n- ${skipped.join("\n- ")}`);
    process.exit(1);
  }
}

await main();
