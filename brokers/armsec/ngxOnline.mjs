// The common end of the scrapers of Nigerian online brokers whose only
// place is the Nigerian Exchange and which name no list of their own
// (../armsec and the others of its batch). Each scraper gives the broker's
// own sentences the catalogue rests on; this checks them on the broker's
// pages with a plain fetch (a PDF is read with PyMuPDF, as
// ../morgancapital/ngxWhole.mjs does), throws when one is gone, then writes
// the exchange's whole listing of the day read by ngxWhole (shares, listed
// REITs and ETFs; closed-end funds, suspended and delisting lines left
// out, as written there), less the lines `keep` refuses, to
// <folder>/<folder>-parsed.json.
//
// ngxOnline({ folder, evidence, keep?, minRows? }):
//   folder    the broker's folder name;
//   evidence  { url: [RegExp, ...] }, checked on the page's plain text;
//   keep      (row) => boolean, a filter for a board or kind the broker
//             does not sell (every row by default);
//   minRows   throw below this many rows (130 by default; ngxWhole holds
//             about 145 on a normal day).
// It returns the rows written.

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { ngxWhole, PLACE } from "../morgancapital/ngxWhole.mjs";
import { spawnSync } from "node:child_process";
import fs from "node:fs";

export { PLACE };

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchPage(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(45_000) });
      if (response.ok) {
        const pdf = /pdf/i.test(response.headers.get("content-type") || "") || /\.pdf($|\?)/i.test(url);
        return pdf ? pdfText(Buffer.from(await response.arrayBuffer())) : response.text();
      }
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(800 * (attempt + 1));
  }
  throw new Error(last);
}

function pdfText(bytes) {
  const python = spawnSync(
    "python3",
    ["-c", "import sys, fitz\ndoc = fitz.open(stream=sys.stdin.buffer.read(), filetype='pdf')\nprint(' '.join(page.get_text() for page in doc))"],
    { input: bytes, maxBuffer: 64 * 1024 * 1024 }
  );
  if (python.error || python.status !== 0) {
    const detail = python.stderr?.toString() || python.error?.message || "";
    throw new Error(detail.includes("No module named 'fitz'") ? "PyMuPDF is missing: pip install pymupdf" : detail.slice(0, 400));
  }
  return python.stdout.toString();
}

export const plain = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#0?38;|&amp;/g, "&")
    .replace(/&#0?39;|&#x27;|&#8217;|&rsquo;|&lsquo;|&#8216;/g, "'")
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;|&quot;/g, '"')
    .replace(/&#8211;|&#8212;|&ndash;|&mdash;/g, "-")
    .replace(/&#8358;/g, "₦")
    .replace(/&nbsp;|&#160;| /g, " ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ");

export async function checkEvidence(evidence) {
  for (const [url, patterns] of Object.entries(evidence)) {
    const text = plain(await fetchPage(url));
    for (const pattern of patterns) {
      if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
    }
    await sleep(400);
  }
}

export async function ngxOnline({ folder, evidence, keep = () => true, minRows = 130 }) {
  await checkEvidence(evidence);
  const { rows, day, dolDay, dropped, leftOut } = await ngxWhole();
  const kept = stampRows(withoutObligations(rows.filter(keep)));
  if (kept.length < minRows) throw new Error(`${folder}: only ${kept.length} rows`);
  fs.writeFileSync(new URL(`../${folder}/${folder}-parsed.json`, import.meta.url), JSON.stringify(kept, null, 2));

  const count = { STOCK: 0, ETF: 0 };
  for (const row of kept) count[row.type] = (count[row.type] || 0) + 1;
  console.error(
    `${folder}: ${kept.length} rows (${day}, Daily Official List ${dolDay}), ${PLACE} ${count.STOCK} STOCK, ${count.ETF} ETF; ` +
      `ISIN ${kept.filter((row) => row.isin).length}. Dropped ${dropped.length} suspended or delisting: ` +
      `${dropped.map((line) => line.ticker).join(", ") || "none"}. Left out: ` +
      `${[...leftOut].map(([label, value]) => `${value} ${label}`).join(", ") || "none"}` +
      `${rows.length - rows.filter(keep).length ? `; ${rows.length - rows.filter(keep).length} refused by the broker's own exclusions` : ""}.`
  );
  return kept;
}
