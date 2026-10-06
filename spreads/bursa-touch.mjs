// Bursa cash touch. The exchange page prints a bid and an ask, and it
// does not answer from here. This reads the same two prices on KLSE
// Screener, one public page per counter. A last trade is never written
// in their place.
//
// The page does not stamp the quote, so the clock of the read is the
// only time we have. Continuous matching is 09:00–12:30 and 14:30–16:45
// in Kuala Lumpur. Outside those windows nothing is written. The reading
// is bursa-touch.json. spread.mjs copies it into spread.json
// (`--only=bursa-touch`).
//
//   node spreads/bursa-touch.mjs

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { catalogueRows } from "../catalogues.mjs";
import { norm } from "./venues.mjs";

const STORE = fileURLToPath(new URL("./bursa-touch.json", import.meta.url));
const BOARD = "https://www.klsescreener.com/v2/screener/quote_results";
const PAGE = "https://www.klsescreener.com/v2/stocks/view/";
const MY = new Set(["myx", "xkls", "malaysia", "bursa", "bursamy", "malay"]);
const KEEP = new Set(["STOCK", "ETF", "ETN", "ETC", "REIT"]);
const AT_ONCE = 8;

const kualaLumpur = (when = new Date()) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kuala_Lumpur",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(when)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  );
  const hour = Number(parts.hour) % 24;
  const minute = Number(parts.minute);
  return {
    weekday: parts.weekday,
    day: ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(parts.weekday),
    minutes: hour * 60 + minute,
    clock: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    date: `${parts.year}-${parts.month}-${parts.day}`,
  };
};

const inSession = (at) => {
  if (!at?.day) return false;
  const morning = at.minutes >= 9 * 60 && at.minutes < 12 * 60 + 30;
  const afternoon = at.minutes >= 14 * 60 + 30 && at.minutes < 16 * 60 + 45;
  return morning || afternoon;
};

const num = (value) => {
  const text = String(value ?? "").replace(/,/g, "").trim();
  if (!text || text === "--" || text === "-") return null;
  const n = Number(text);
  return n > 0 ? n : null;
};

const bpFrom = (bid, ask) => {
  if (!(bid > 0) || !(ask > 0) || ask < bid) return null;
  const bp = ((ask - bid) / ((ask + bid) / 2)) * 1e4;
  return bp > 0 ? Number(bp.toFixed(2)) : null;
};

async function text(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
          Referer: "https://www.klsescreener.com/v2/screener/quote_results",
        },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) {
        const body = await response.text();
        if (body) return body;
        last = "vide";
      } else last = `${response.status}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error(last || url);
}

// The board prints the short name and the Bursa code. A catalogue row
// uses one or the other. A digit code is also filed without its leading
// zeros, so 0012 and 12 meet.
function codesOf(html) {
  const byName = new Map();
  const byCode = new Map();
  for (const block of html.matchAll(/<tr class="list">(.*?)<\/tr>/gs)) {
    const body = block[1];
    const link = body.match(/href="\/v2\/stocks\/view\/([^"/]+)[^"]*"[^>]*>([^<]+)<\/a>/);
    const codeCell = body.match(/title="Code">([^<]*)</);
    if (!link || !codeCell) continue;
    const code = codeCell[1].trim().toUpperCase();
    const name = link[2].replace(/\s+/g, "").toUpperCase();
    if (!code) continue;
    byCode.set(code, code);
    if (/^\d+$/.test(code)) byCode.set(code.replace(/^0+/, ""), code);
    if (byName.has(name) && byName.get(name) !== code) byName.set(name, "");
    else if (!byName.has(name)) byName.set(name, code);
  }
  if (byCode.size < 1000) throw new Error("le tableau Bursa est incomplet");
  return { byName, byCode };
}

function resolveCode(ticker, board) {
  const token = String(ticker || "").replace(/\s+/g, "").toUpperCase().replace(/\.KL$/, "");
  if (!token) return "";
  return board.byCode.get(token) || board.byCode.get(token.replace(/^0+/, "")) || board.byName.get(token) || "";
}

function listings(board) {
  const byCode = new Map();
  let unmatched = 0;
  for (const row of catalogueRows()) {
    if (!MY.has(norm(row.exchange))) continue;
    const type = String(row.type || "").toUpperCase();
    if (type && !KEEP.has(type)) continue;
    const isin = String(row.isin || "").toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) continue;
    const code = resolveCode(row.ticker, board);
    if (!code) {
      unmatched += 1;
      continue;
    }
    const counts = byCode.get(code) || new Map();
    counts.set(isin, (counts.get(isin) || 0) + 1);
    byCode.set(code, counts);
  }
  const jobs = [];
  let tied = 0;
  for (const [code, counts] of byCode) {
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) {
      tied += 1;
      continue;
    }
    jobs.push({ code, isin: ranked[0][0] });
  }
  jobs.sort((a, b) => a.code.localeCompare(b.code));
  return { jobs, tied, unmatched };
}

function touchOf(html) {
  const bid = num(html.match(/id="price-bid">\s*([^<]+)/)?.[1]);
  const ask = num(html.match(/id="price-ask">\s*([^<]+)/)?.[1]);
  return { bid, ask, bp: bpFrom(bid, ask) };
}

async function pool(items, worker) {
  const out = new Array(items.length);
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      out[index] = await worker(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(AT_ONCE, items.length) }, run));
  return out;
}

const now = kualaLumpur();
if (!inSession(now)) {
  console.error(`hors séance, Kuala Lumpur ${now.weekday} ${now.clock}. Rien n'est écrit.`);
  process.exit(1);
}

console.error(`Kuala Lumpur ${now.clock}. Tableau des codes…`);
const board = codesOf(await text(BOARD));
const { jobs, tied, unmatched } = listings(board);
console.error(`${jobs.length} codes, ${tied} codes à ISIN partagé laissés de côté.`);
if (!jobs.length) {
  console.error("aucun code du catalogue sur le tableau. Rien n'est écrit.");
  process.exit(1);
}

let noTouch = 0;
let failed = 0;
let done = 0;
const found = [];
await pool(jobs, async (job) => {
  let html = "";
  try {
    html = await text(`${PAGE}${encodeURIComponent(job.code)}`);
  } catch {
    failed += 1;
  }
  done += 1;
  if (done % 200 === 0) console.error(`${done}/${jobs.length}`);
  if (!html) return;
  const touch = touchOf(html);
  if (touch.bp == null) {
    noTouch += 1;
    return;
  }
  found.push({
    isin: job.isin,
    mic: "XKLS",
    code: job.code,
    bid: touch.bid,
    ask: touch.ask,
    bp: touch.bp,
    stamp: `${now.date} ${now.clock}`,
    url: `${PAGE}${encodeURIComponent(job.code)}`,
  });
});

found.sort((a, b) => a.code.localeCompare(b.code));
if (!found.length) {
  console.error(`aucune touche. Kuala Lumpur ${now.clock}. ${failed} pages en échec. Rien n'est écrit.`);
  process.exit(1);
}

fs.writeFileSync(
  STORE,
  JSON.stringify(
    { at: new Date().toISOString(), clock: now.clock, rows: found, noTouch, failed, unmatched, tied },
    null,
    2
  )
);
console.error(
  `${found.length} touches, ${noTouch} sans bid et ask, ${failed} pages en échec. Écrit dans bursa-touch.json.`
);
