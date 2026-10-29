// What a bank or credit union that embeds Eko's digital investing sells,
// and the page reading its scrapers share. Eko Investments, Inc. (an
// SEC-registered adviser) runs the "Investments" tab inside the bank's
// online banking; brokerage is Alpaca Securities LLC. Self-directed
// portfolios buy and sell single US stocks and ETFs; pre-built and hybrid
// portfolios are managed products and are not in the catalogues.
//
// The list itself sits behind online banking. Eko's FAQ document, which
// the banks publish under their own name, gives its size: "You have
// access to a wide range of investment options, including more than 5,000
// fractionable stocks and ETFs" and "You have the option to trade around
// 5,000 fractionable stocks and ETFs". Where the bank publishes that (or
// another) figure, the scraper passes it as n and the catalogue keeps the
// n most popular lines of the US book (../tfcapital/usTop.mjs: 30-day
// average traded value on TradingView's US scanner, market value after
// it), shares, ETFs and ETNs ranked together, since the figure is one for
// all kinds. Where the bank gives no figure, the catalogue is the whole US
// exchange book of the day, as for the other Eko banks (../crewstrust,
// ../educatorscreditu).
//
// The book (../wellstrade/usBook.mjs): shares, ADRs, REITs, partnership
// units, preferreds, closed-end funds, ETFs and ETNs on Nasdaq, NYSE, NYSE
// American, NYSE Arca, Cboe BZX and the Texas Stock Exchange, less the
// lines with an open trade halt; warrants, rights, units, when-issued
// lines and listed notes are left out there, bonds by withoutObligations.
// No bank names OTC Markets, so none is added. The US is one NBBO market:
// one row per title on its primary listing, in dollars.
//
// Some bank sites answer scripts with a Cloudflare challenge. readPage and
// readPdf then fall back on the latest Internet Archive capture of the same
// address and say so (source "archive <timestamp>").

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { usTop } from "../tfcapital/usTop.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ENTITIES = { lt: "<", gt: ">", quot: '"', amp: "&", rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', nbsp: " ", ndash: "-", mdash: "-" };
const decode = (s) =>
  s.replace(/&(lt|gt|quot|amp|rsquo|lsquo|ldquo|rdquo|nbsp|ndash|mdash|#\d+|#x[0-9a-f]+);/gi, (m, e) => {
    const known = ENTITIES[e.toLowerCase()];
    if (known !== undefined) return known;
    return e[1] === "x" || e[1] === "X" ? String.fromCodePoint(parseInt(e.slice(2), 16)) : String.fromCodePoint(Number(e.slice(1)));
  });

// Visible text, plus the text kept in attributes (accordion answers some
// sites store as escaped HTML in an attribute).
export function plain(html) {
  let text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ");
  for (let i = 0; i < 3; i += 1) text = decode(text);
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[​ ]/g, " ")
    .replace(/\s+/g, " ");
}

async function get(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let wait = 2000 * (attempt + 1);
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,application/pdf,*/*" }, signal: AbortSignal.timeout(45_000) });
      if (response.ok) return Buffer.from(await response.arrayBuffer());
      last = `${response.status} ${url}`;
      if (response.status === 403 || response.status === 404) break;
      // The Internet Archive answers 429 to bursts; it wants a longer pause.
      if (response.status === 429) wait = 15_000 * (attempt + 1);
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await sleep(wait);
  }
  throw new Error(last);
}

// The latest 200 capture of the address on the Internet Archive.
async function archived(url) {
  const key = url.replace(/^https?:\/\/(www\.)?/, "");
  const cdx = JSON.parse((await get(`https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(key)}&output=json&filter=statuscode:200&limit=-1`)).toString("utf8"));
  const hit = cdx[1];
  if (!hit) throw new Error(`no archived capture of ${url}`);
  return { bytes: await get(`https://web.archive.org/web/${hit[1]}id_/${hit[2]}`), source: `archive ${hit[1]}` };
}

async function fetchOrArchive(url, isGood) {
  try {
    const bytes = await get(url);
    if (isGood(bytes)) return { bytes, source: "live" };
  } catch {
    // Cloudflare challenge or a network failure: try the archive.
  }
  const copy = await archived(url);
  if (!isGood(copy.bytes)) throw new Error(`the archived copy of ${url} is not readable`);
  return copy;
}

const challenge = (text) => /Just a moment\.\.\.|Attention Required! \| Cloudflare|Enable JavaScript and cookies to continue/i.test(text);

export async function readPage(url) {
  const { bytes, source } = await fetchOrArchive(url, (b) => !challenge(b.toString("utf8")));
  const html = bytes.toString("utf8");
  return { text: plain(html), html, source };
}

// The absolute address of the first link whose href or text matches.
export function linkOf(url, { html }, pattern) {
  for (const m of html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]{0,400}?)<\/a>/gi)) {
    if (pattern.test(m[1]) || pattern.test(plain(m[2]).trim())) {
      const href = m[1].replace(/&amp;/g, "&").replace(/^https?:\/\/web\.archive\.org\/web\/\d+[a-z_]*\//, "");
      return new URL(href, url).href;
    }
  }
  throw new Error(`${url} no longer links ${pattern}`);
}

export function pdfToText(bytes) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eko-"));
  const file = path.join(dir, "doc.pdf");
  fs.writeFileSync(file, bytes);
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
  if (python.status !== 0) throw new Error(`could not read the PDF: ${(python.stderr || "").trim().slice(0, 400)}`);
  return python.stdout.replace(/[‘’]/g, "'").replace(/[​ ]/g, " ").replace(/\s+/g, " ");
}

export async function readPdf(url) {
  const { bytes, source } = await fetchOrArchive(url, (b) => b.subarray(0, 5).toString("latin1") === "%PDF-");
  return { text: pdfToText(bytes), source };
}

// The page still says what the header quotes, or the run stops.
export function check(url, { text, source }, patterns) {
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} (${source}) no longer says ${pattern}`);
  return source;
}

// The Eko FAQ document's sentences on the self-directed offer and its cost.
export const EKO_FAQ = [
  /more than 5,000 fractionable stocks and ETFs/i,
  /trade around 5,000 fractionable stocks and ETFs/i,
  /Self-directed investing is commission-free\. We don't charge anything per trade, or to open or maintain your account/i,
];

// The US book, the n most popular lines of it when n is given.
export async function ekoBook({ n } = {}) {
  const book = await usBook();
  const report = book.report;
  const all = stampRows(withoutObligations(book));
  if (all.length < 10000) throw new Error(`only ${all.length} rows in the US book`);
  if (!n) {
    all.report = { ...report, kept: all.length };
    return all;
  }
  const top = await usTop(all, n);
  if (top.length !== n) throw new Error(`only ${top.length} rows kept of ${n}`);
  top.report = { ...report, top: top.report };
  return top;
}

// One line per MIC and type, and how the book was read.
export function describe(rows) {
  const counts = {};
  for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
  const lines = [`${rows.length} rows (${Object.entries(counts).map(([label, k]) => `${k} ${label}`).join(", ")})`];
  const { directories, halts, top } = rows.report || {};
  if (directories) lines.push(`directories ${JSON.stringify(directories)}; halts: ${(halts || []).join(", ")}`);
  if (top) lines.push(`kept the ${top.kept} most popular of ${top.candidates}: ${top.byValue} by traded value, ${top.byCap} by market value, ${top.unranked} unranked; last kept ${top.cutoff}`);
  return lines.join("\n");
}
