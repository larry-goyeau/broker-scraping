// The run-time evidence check of the US scrapers written with
// ./cashapp_scraping.mjs: fetch a broker page (HTML, a PDF, or a Zendesk
// help-center article through its public JSON), reduce it to plain text,
// and stop the run when a sentence the scraper's header quotes is gone.
//
//   import { checkPage } from "../cashapp/pageCheck.mjs";
//   await checkPage(url, [/commission-free/i]);               // HTML
//   await checkPage(pdfUrl, [/\$0/], { pdf: true });          // PDF (PyMuPDF)
//   const text = await checkPage(url, []);                    // just the text
//
// PDFs are read with python3 and PyMuPDF (fitz), as in
// ../desertcreditunio/desertcreditunio_scraping.mjs.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function bytes(url) {
  let last = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" }, signal: AbortSignal.timeout(45_000) });
      if (response.ok) return Buffer.from(await response.arrayBuffer());
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await sleep(2000 * (attempt + 1));
  }
  throw new Error(last);
}

export const plain = (html) =>
  String(html)
    .replace(/\\u003c/g, "<")
    .replace(/\\u003e/g, ">")
    .replace(/\\u0026/g, "&")
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;| |​|‍/g, " ")
    .replace(/&amp;|&#038;/g, "&")
    .replace(/&#39;|&rsquo;|&#x27;|&#8217;|[‘’]/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;|&#8220;|&#8221;|[“”]/g, '"')
    .replace(/&ndash;|&mdash;|&#8211;|&#8212;|[–—]/g, "-")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ");

function pdfText(buffer, url) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pagecheck-"));
  const file = path.join(dir, "page.pdf");
  fs.writeFileSync(file, buffer);
  let python;
  try {
    python = spawnSync("python3", ["-c", "import fitz, sys\nsys.stdout.write('\\n'.join(page.get_text() for page in fitz.open(sys.argv[1])))", file], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      timeout: 120_000,
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  if (python.status !== 0) throw new Error(`could not read ${url}: ${(python.stderr || "").trim().slice(0, 300)}`);
  return python.stdout;
}

// A Zendesk article (help.<brand>.com/hc/en-us/articles/<id>-...) is read
// through /api/v2/help_center/en-us/articles/<id>.json: the HTML pages sit
// behind a bot wall, the JSON does not.
function zendeskJson(url) {
  const found = String(url).match(/^(https:\/\/[^/]+)\/hc\/([a-z-]+)\/articles\/(\d+)/i);
  return found ? `${found[1]}/api/v2/help_center/${found[2]}/articles/${found[3]}.json` : null;
}

export async function checkPage(url, patterns = [], { pdf = false } = {}) {
  let text;
  const api = zendeskJson(url);
  if (api) {
    const article = JSON.parse((await bytes(api)).toString("utf8")).article;
    text = plain(`${article.title} ${article.body}`);
  } else {
    const buffer = await bytes(url);
    text = pdf || buffer.subarray(0, 5).toString() === "%PDF-" ? plain(pdfText(buffer, url)) : plain(buffer.toString("utf8"));
  }
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
  await sleep(800);
  return text;
}

// Counts by MIC and type, for the run's last line.
export function countLine(rows) {
  const counts = {};
  for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
  return `${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`;
}
