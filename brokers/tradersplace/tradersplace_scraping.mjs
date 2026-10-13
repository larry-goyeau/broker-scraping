// What Traders Place sells in shares and listed funds, with no login.
// The search is the book. A row it returns has a page with "Wert handeln".
// The form wants at least three characters and returns at most 250 rows, so
// a full answer is kept and a full page is asked again with one more
// character, including a space. Shares are type 1, listed funds type 99.
// Funds, bonds, indices, options and futures are other types and stay out.
//
//   https://tradersplace.de/wertpapiersuche
//   https://tradersplace.de/angebot/uebersicht/aktien
//   https://tradersplace.de/angebot/uebersicht/etfs
//   https://tradersplace.de/service/service-tools/handelsplaetze
//
//   node brokers/tradersplace/tradersplace_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const SEARCH = "https://tradersplace.de/wertpapiersuche";
const OUTPUT = new URL("tradersplace-parsed.json", import.meta.url);
const CACHE = new URL("tradersplace-search-cache.json", import.meta.url);
const ALPH = "abcdefghijklmnopqrstuvwxyz0123456789".split("");
const MORE = [...ALPH, " "];
const CAP = 250;
const KINDS = [
  { id: "1", kind: "STOCK" },
  { id: "99", kind: "LISTED" },
];

const VENUE = {
  "NYSE CTA": "NYSE",
  "NASDAQ UTP": "Nasdaq",
  "Nasdaq Other OTC": "OTC Markets",
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function decode(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&(auml|ouml|uuml|Auml|Ouml|Uuml|szlig);/g, (_, name) => ({
      auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß",
    }[name]))
    .replace(/\s+/g, " ")
    .trim();
}

function listingType(kind, name) {
  if (kind === "STOCK") return "STOCK";
  if (/\bETCs?\b/i.test(name)) return "ETC";
  if (/\bETNs?\b/i.test(name)) return "ETN";
  if (/\bETPs?\b/i.test(name)) return "ETP";
  return "ETF";
}

async function textOf(url, body) {
  let last;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(url, {
        method: body ? "POST" : "GET",
        headers: {
          "User-Agent": UA,
          Accept: "text/html",
          ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
        },
        body,
        signal: AbortSignal.timeout(60_000),
      });
      if (response.status === 429 || response.status >= 500) {
        last = new Error(`${response.status} ${url}`);
        await sleep(400 * (attempt + 1));
        continue;
      }
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      return await response.text();
    } catch (error) {
      last = error;
      if (attempt === 3) break;
      await sleep(400 * (attempt + 1));
    }
  }
  throw last;
}

function extractData(html) {
  const marker = html.indexOf('"data":');
  if (marker < 0) return [];
  const start = html.indexOf("[", marker);
  if (start < 0) return [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "[") depth += 1;
    else if (ch === "]") {
      depth -= 1;
      if (depth === 0) return JSON.parse(html.slice(start, i + 1));
    }
  }
  throw new Error("search results were not a closed list");
}

function parseRows(html, kind) {
  const rows = [];
  for (const row of extractData(html)) {
    if (!Array.isArray(row) || row.length < 3) continue;
    const link = String(row[0] || "");
    const tts = (link.match(/tts-(\d+)/) || [])[1];
    const name = decode(link);
    const venue = decode(row[1]);
    const currency = decode(row[2]).toUpperCase();
    if (!tts || !name || !venue || !/^[A-Z]{3}$/.test(currency)) continue;
    rows.push({ tts, name, venue, currency, kind });
  }
  return rows;
}

async function search(query, typeId) {
  const body = new URLSearchParams({
    "search[search_text]": query,
    "search[typeID]": typeId,
    "search[region]": "All",
    "search[currency]": "All",
  });
  return parseRows(await textOf(SEARCH, body), typeId);
}

function loadCache() {
  if (!fs.existsSync(CACHE)) return { done: [], queue: [], rows: {} };
  return JSON.parse(fs.readFileSync(CACHE, "utf8"));
}

function saveCache(cache) {
  fs.writeFileSync(CACHE, JSON.stringify(cache));
}

function seed() {
  const queue = [];
  for (const a of ALPH) {
    for (const b of ALPH) {
      for (const c of ALPH) queue.push(`1:${a}${b}${c}`, `99:${a}${b}${c}`);
    }
  }
  return queue;
}

async function collect(cache) {
  const done = new Set(cache.done);
  if (!cache.queue.length && done.size === 0) cache.queue = seed();
  const queued = new Set(cache.queue);
  const rows = cache.rows;
  let cursor = 0;
  let active = 0;
  let sinceSave = 0;
  const workers = 8;

  async function worker() {
    for (;;) {
      let job;
      if (cursor < cache.queue.length) job = cache.queue[cursor++];
      else if (active === 0) return;
      else {
        await sleep(40);
        continue;
      }
      if (done.has(job)) continue;
      active += 1;
      try {
        const split = job.indexOf(":");
        const typeId = job.slice(0, split);
        const query = job.slice(split + 1);
        const found = await search(query, typeId);
        const kind = typeId === "1" ? "STOCK" : "LISTED";
        for (const row of found) {
          row.kind = kind;
          rows[row.tts] = row;
        }
        if (found.length >= CAP && query.length < 18) {
          for (const ch of MORE) {
            const next = `${typeId}:${query}${ch}`;
            if (done.has(next) || queued.has(next)) continue;
            queued.add(next);
            cache.queue.push(next);
          }
        }
        done.add(job);
        sinceSave += 1;
        if (sinceSave >= 200) {
          cache.done = [...done];
          saveCache(cache);
          sinceSave = 0;
          console.error(`search ${done.size} queries, ${Object.keys(rows).length} rows, ${cache.queue.length - cursor} waiting`);
        }
      } finally {
        active -= 1;
      }
    }
  }

  await Promise.all(Array.from({ length: workers }, worker));
  cache.done = [...done];
  saveCache(cache);
  console.error(`search finished: ${Object.keys(rows).length} rows from ${done.size} queries`);
  return rows;
}

async function instrumentOf(tts) {
  const html = await textOf(`https://tradersplace.de/aktien/details/tts-${tts}`);
  const isin = (html.match(/data-isin="([A-Z]{2}[A-Z0-9]{10})"/) || [])[1] || "";
  const wkn = ((html.match(/wkn\s+([A-Z0-9]{5,6})/i) || [])[1] || "").toUpperCase();
  const siblings = [...html.matchAll(/\/aktien\/details\/tts-(\d+)/g)].map((match) => match[1]);
  return { isin, wkn, siblings };
}

async function resolveIsins(rows) {
  const pending = Object.keys(rows);
  const known = new Map();
  let cursor = 0;
  let active = 0;
  let resolved = 0;

  async function worker() {
    for (;;) {
      let tts;
      if (cursor < pending.length) tts = pending[cursor++];
      else if (active === 0) return;
      else {
        await sleep(30);
        continue;
      }
      if (known.has(tts)) continue;
      active += 1;
      try {
        const found = await instrumentOf(tts);
        if (!found.isin) continue;
        const group = new Set([tts, ...found.siblings]);
        for (const id of group) known.set(id, found);
        resolved += 1;
        if (resolved % 200 === 0) console.error(`isin ${resolved}, covered ${known.size} of ${pending.length}`);
      } catch (error) {
        console.error(`detail tts-${tts}: ${error.message}`);
      } finally {
        active -= 1;
      }
    }
  }

  await Promise.all(Array.from({ length: 8 }, worker));
  return known;
}

const cache = loadCache();
const rows = await collect(cache);
const facts = await resolveIsins(rows);

const results = [];
const seen = new Set();
let missingIsin = 0;
for (const row of Object.values(rows)) {
  const fact = facts.get(row.tts);
  if (!fact?.isin) {
    missingIsin += 1;
    continue;
  }
  const type = listingType(row.kind, row.name);
  const exchange = VENUE[row.venue] || row.venue;
  const ticker = fact.wkn || (fact.isin.startsWith("DE000") ? fact.isin.slice(5, 11) : "");
  if (!ticker) continue;
  const id = `${fact.isin}:${exchange}:${type}`;
  if (seen.has(id)) continue;
  seen.add(id);
  results.push({
    query: fact.isin,
    ticker,
    name: row.name,
    exchange,
    currency: row.currency,
    type,
    raw: [ticker, row.name, exchange, row.currency, fact.isin].join(" "),
    isin: fact.isin,
  });
}

const apple = results.some((row) => row.isin === "US0378331005");
if (!apple) throw new Error("Apple was not in the search");
const shares = new Set(results.filter((row) => row.type === "STOCK").map((row) => row.isin));
const funds = new Set(results.filter((row) => row.type !== "STOCK").map((row) => row.isin));
if (shares.size < 5000) throw new Error(`only ${shares.size} shares`);
if (funds.size < 500) throw new Error(`only ${funds.size} listed funds`);

results.sort((left, right) => left.type.localeCompare(right.type) || left.ticker.localeCompare(right.ticker) || left.exchange.localeCompare(right.exchange));
fs.writeFileSync(OUTPUT, JSON.stringify(stampRows(withoutObligations(results)), null, 2));

const byType = new Map();
for (const row of results) byType.set(row.type, (byType.get(row.type) || 0) + 1);
console.error(
  `${results.length} listings over ${new Set(results.map((row) => row.isin)).size} instruments ` +
    `(${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")})` +
    (missingIsin ? `, ${missingIsin} rows without an ISIN` : "")
);
