// The catalogue of a Hong Kong broker that sells the whole of HKEX, maybe
// Northbound Stock Connect, and US shares and ETFs, and publishes no list:
// bocomhk, ccbi, cswealth, centralchinahk, citibankhk, eddid, elebank,
// innovax. Each scraper says what its broker sells and which exceptions
// its pages name; this module puts the places together:
//
//   - HKEX: ../primehk/hkexBook.mjs (HKEX's List of Securities: shares,
//     REITs and ETPs; HKD, USD and RMB counters as their own codes; less
//     suspended, never-traded and temporary counters);
//   - Stock Connect: ./connectBook.mjs (HKEX's Northbound buy-and-sell
//     lists of SSE and SZSE); STAR Market and ChiNext shares are dropped or
//     kept with a remark, as the broker's pages say;
//   - United States: ../wellstrade/usBook.mjs (Nasdaq Trader's symbol
//     directories, one NBBO row per title on its primary listing, less open
//     halts, warrants, rights, units and listed notes), optionally cut to
//     the primary listings the broker names, then the broker's own filter;
//     OTC Markets lines (../moomoous/otcBook.mjs) only when asked for.
//
// Bonds go through ../../obligation.mjs and residency stamps through
// ../../accepted.mjs, as in every catalogue.
//
// Also: page(url) and evidence(url, patterns) read a broker page as text
// and throw when a sentence a catalogue rests on is gone.

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { otcBook } from "../moomoous/otcBook.mjs";
import { hkexBook } from "../primehk/hkexBook.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { connectBook } from "./connectBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const BOARD_REMARK = {
  STAR: "STAR Market shares on Stock Connect are for institutional professional investors only.",
  ChiNext: "ChiNext shares on Stock Connect are for institutional professional investors only.",
};

export function plain(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (all, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ");
}

// Page text; `get` replaces fetch for a server whose certificate chain
// Node cannot verify alone (see ../ccbi).
export async function page(url, { get } = {}) {
  let last = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      if (get) return plain(await get(url));
      const response = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "zh-HK,zh;q=0.9,en;q=0.8" }, signal: AbortSignal.timeout(45_000) });
      if (response.ok) return plain(await response.text());
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await sleep(2000 * (attempt + 1));
  }
  throw new Error(last);
}

export async function evidence(url, patterns, options = {}) {
  const text = await page(url, options);
  const missing = patterns.filter((pattern) => !pattern.test(text));
  if (missing.length) throw new Error(`${url} no longer says ${missing.map(String).join(", ")}`);
  return text;
}

const tally = (list, key) => list.reduce((acc, item) => ((acc[key(item)] = (acc[key(item)] || 0) + 1), acc), {});

// options:
//   folder        the broker folder (writes <folder>-parsed.json there)
//   connect       null, or { STAR: "drop" | "remark", ChiNext: "drop" | "remark" }
//   us            null, or { mics: [...primary listings kept] | null,
//                            filter: async (rows) => ({ kept, left: { reason: [tickers] } }),
//                            otc: null | [OTC screener markets, e.g. OTC_PUBLIC] }
//   drop          (row) => reason | "" for an exception on any place
//   remark        a sentence added to every row (a client-dependent restriction)
//   least         { HKEX, connect, US } minimum rows kept per place
export async function hkCatalogue({ folder, connect = null, us = null, drop = () => "", remark = "", least = {} }) {
  const out = [];
  const left = {};
  const leave = (reason, row) => (left[reason] = [...(left[reason] || []), `${row.exchange}:${row.ticker}`]);
  const notes = [];

  const hk = await hkexBook();
  notes.push(`HKEX list as at ${hk.listDate}, quotations ${hk.quoteDate}; dropped ${hk.dropped.length} ${JSON.stringify(tally(hk.dropped, (item) => item.reason.replace(/ \(main counter.*\)$/, "").replace(/ from .*$/, "")))}; halted (kept) ${hk.halted.length}; out of scope ${JSON.stringify(hk.outOfScope)}`);
  out.push(...hk.rows);

  if (connect) {
    const book = await connectBook();
    notes.push(`Northbound lists updated ${JSON.stringify(book.updated)}`);
    for (const row of book.rows) {
      const { board, ...rest } = row;
      if (board && connect[board] === "drop") { leave(`${board} (not offered)`, row); continue; }
      if (board) rest.remark = BOARD_REMARK[board];
      out.push(rest);
    }
  }

  if (us) {
    const book = await usBook();
    notes.push(`US directories ${JSON.stringify(book.report.directories)}; usBook left out ${Object.entries(book.report.leftOut).map(([what, list]) => `${list.length} ${what}`).join(", ")}`);
    let rows = [...book];
    if (us.mics) {
      const named = new Set(us.mics);
      rows = rows.filter((row) => named.has(row.mic) || (leave(`US primary listing ${row.mic} not named`, row), false));
    }
    if (us.filter) {
      const result = await us.filter(rows);
      rows = result.kept;
      for (const [reason, list] of Object.entries(result.left || {})) left[reason] = [...(left[reason] || []), ...list];
    }
    out.push(...rows);
    if (us.otc) {
      const otc = await otcBook(book, { markets: us.otc });
      notes.push(otc.summary);
      out.push(...otc.rows);
    }
  }

  const kept = [];
  for (const row of out) {
    const reason = drop(row);
    if (reason) { leave(reason, row); continue; }
    if (remark) row.remark = [row.remark, remark].filter(Boolean).join(" ");
    kept.push(row);
  }
  const rows = stampRows(withoutObligations(kept));

  const byPlace = tally(rows, (row) => (row.mic === "XHKG" ? "HKEX" : row.mic === "XSHG" || row.mic === "XSHE" ? "connect" : "US"));
  for (const [place, n] of Object.entries(least)) {
    if ((byPlace[place] || 0) < n) throw new Error(`${folder}: only ${byPlace[place] || 0} ${place} rows (expected ${n}+)`);
  }
  fs.writeFileSync(new URL(`../${folder}/${folder}-parsed.json`, import.meta.url), JSON.stringify(rows, null, 2));

  console.error(`${folder}: ${rows.length} rows; by place/type ${JSON.stringify(tally(rows, (row) => `${row.exchange} ${row.currency} ${row.type}`))}; ISIN ${rows.filter((row) => row.isin).length}`);
  for (const note of notes) console.error(`  ${note}`);
  for (const [reason, list] of Object.entries(left)) console.error(`  left out ${list.length} ${reason}: ${list.slice(0, 12).join(", ")}${list.length > 12 ? ", ..." : ""}`);
  if (kept.length > rows.length) console.error(`  left out ${kept.length - rows.length} bonds`);
  return rows;
}
