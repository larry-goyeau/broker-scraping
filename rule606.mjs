// Where a US broker-dealer sends held NMS orders, from the quarterly Rule 606(a)
// reports FINRA publishes as one zip of XML. The cost scripts read the mix so the
// 605 figure they use is weighted toward the teneurs that broker actually reaches.
//
// Citadel and Virtu do not publish a 605 we can read. Their weight falls back to
// the blended 605 already in spread.json. Exchanges and ATS do the same.
//
//   node rule606.mjs              -- refresh and list each mapped broker
//   node rule606.mjs tastytrade   -- that broker's venue mix
//
// https://www.finra.org/finra-data/606-nms-data/bulk-file

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { zipEntries } from "./xlm-monthly.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = path.join(ROOT, "parsed_json", "rule606.json");
const RULE605_PATH = path.join(ROOT, "parsed_json", "rule605-monthly.json");
const INDEX = "https://www.finra.org/finra-data/606-nms-data/bulk-file";
const STALE_DAYS = 50;

// CRD prefixes in the zip filename. Several files for one CRD are merged.
export const US_BROKERS = {
  alpaca: { crd: ["288202"], name: "Alpaca Securities LLC" },
  choicetrade: { crd: ["104021"], name: "ChoiceTrade" },
  firstrade: { crd: ["16843"], name: "Firstrade Securities Inc." },
  interactivebrokers: { crd: ["36418"], name: "Interactive Brokers LLC" },
  robinhood: { crd: ["165998", "287900"], name: "Robinhood Financial LLC" },
  siebert: { crd: ["5376"], name: "Muriel Siebert & Co." },
  sogotrade: { crd: ["17912"], name: "SogoTrade" },
  tastytrade: { crd: ["277027"], name: "Tastytrade Inc" },
  tradier: { crd: ["104982"], name: "Tradier Brokerage, Inc." },
  tradestation: { crd: ["39473"], name: "TradeStation Securities" },
  tradeup: { crd: ["18483"], name: "TradeUP Securities, Inc." },
  tradezero: { crd: ["282940"], name: "TradeZero America" },
  vested: { crd: ["315194"], name: "VF Securities, Inc." },
  webull: { crd: ["170580"], name: "Webull Financial LLC" },
};

// Introducing brokers that do not file their own 606: same mix as the US BD
// that actually routes the order.
const ALIASES = {
  thndr: "alpaca",
};

const ricOf = (name) => {
  const n = String(name || "").toLowerCase();
  if (n.includes("citadel")) return "CDRG";
  if (n.includes("virtu") || n.includes("knight")) return "NITE";
  if (n.includes("jane") && n.includes("street")) return "JNST";
  if (/\bubs\b/.test(n)) return "UBSS";
  if (n.includes("hudson") || /\bhrt\b/.test(n)) return "HRTF";
  if (n.includes("two sigma") || n.includes("soho")) return "SOHO";
  if (/\bg1\b/.test(n) || n.includes("etmm") || n.includes("execution services")) return "ETMM";
  return "OTHER";
};

const num = (re, text) => {
  const hit = text.match(re);
  if (!hit) return 0;
  const v = Number(hit[1]);
  return Number.isFinite(v) ? v : 0;
};

function parseReport(text) {
  const bd = (text.match(/<bd>([^<]+)<\/bd>/) || [])[1]?.replace(/&amp;/g, "&") || "";
  const weights = new Map();
  for (const month of text.split(/<rMonthly>/).slice(1)) {
    for (const [, , body] of month.matchAll(/<(rSP500|rOtherStocks)>([\s\S]*?)<\/\1>/g)) {
      const mkt = num(/<ndoMarketPct>([^<]+)/, body);
      const mlim = num(/<ndoMarketableLimitPct>([^<]+)/, body);
      for (const venue of body.matchAll(/<rVenue>([\s\S]*?)<\/rVenue>/g)) {
        const chunk = venue[1];
        const name = (chunk.match(/<name>([^<]+)/) || [])[1]?.replace(/&amp;/g, "&") || "";
        const w =
          (num(/<marketPct>([^<]+)/, chunk) / 100) * (mkt / 100) +
          (num(/<marketableLimitPct>([^<]+)/, chunk) / 100) * (mlim / 100);
        if (!(w > 0) || !name) continue;
        const ric = ricOf(name);
        weights.set(ric, (weights.get(ric) || 0) + w);
      }
    }
  }
  const total = [...weights.values()].reduce((s, v) => s + v, 0);
  const mix = {};
  if (total > 0) for (const [ric, w] of weights) mix[ric] = Number((w / total).toPrecision(4));
  return { bd, mix };
}

async function newestZip() {
  const res = await fetch(INDEX, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`FINRA ${res.status}`);
  const html = await res.text();
  const urls = [...html.matchAll(/https:\/\/cdn\.finra\.org\/606reportBulk\/[^"'<\s]+606_NMS_\d{4}_Q\d\.zip/g)].map(
    (m) => m[0]
  );
  if (!urls.length) throw new Error("aucun zip 606 sur la page FINRA");
  return urls[0];
}

function mergeMix(into, add) {
  const keys = new Set([...Object.keys(into), ...Object.keys(add)]);
  const out = {};
  let sum = 0;
  for (const k of keys) {
    const v = (into[k] || 0) + (add[k] || 0);
    if (v > 0) {
      out[k] = v;
      sum += v;
    }
  }
  if (!(sum > 0)) return into;
  for (const k of Object.keys(out)) out[k] = Number((out[k] / sum).toPrecision(4));
  return out;
}

async function zipBuffer() {
  const local = "/tmp/rule606/606.zip";
  try {
    const url = await newestZip();
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(120000) });
    if (res.ok) return { url, buf: Buffer.from(await res.arrayBuffer()) };
  } catch {
    /* fall through to a zip already on disk */
  }
  if (fs.existsSync(local)) return { url: local, buf: fs.readFileSync(local) };
  throw new Error("zip 606 introuvable");
}

export async function download606({ quiet = false } = {}) {
  const { url, buf } = await zipBuffer();
  const read = zipEntries(buf);
  const q = (url.match(/(\d{4}_Q\d)/) || [])[1]?.replace("_", "-") || null;
  const brokers = {};
  for (const [folder, meta] of Object.entries(US_BROKERS)) {
    const files = read.names.filter(
      (n) => n.endsWith(".xml") && meta.crd.some((c) => n.startsWith(`${c}_`) || n.startsWith(`${c.padStart(c.length, "0")}_`))
    );
    if (!files.length) {
      if (!quiet) console.error(`606 : ${folder} (CRD ${meta.crd.join(",")}) absent du zip ${q}`);
      continue;
    }
    let mix = {};
    let bd = meta.name;
    for (const name of files) {
      const parsed = parseReport(read(name));
      if (parsed.bd) bd = parsed.bd;
      mix = mergeMix(mix, parsed.mix);
    }
    brokers[folder] = { crd: meta.crd, name: bd, files, mix };
  }
  const table = { quarter: q, fetchedAt: new Date().toISOString(), source: url, brokers };
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(table, null, 2));
  return table;
}

export async function monthlyRouting({ refresh = false, quiet = false } = {}) {
  const cached = fs.existsSync(CACHE_PATH) ? JSON.parse(fs.readFileSync(CACHE_PATH, "utf8")) : null;
  const age = cached ? (Date.now() - Date.parse(cached.fetchedAt)) / 86400000 : Infinity;
  if (cached && !refresh && age < STALE_DAYS) return cached;
  try {
    const fresh = await download606({ quiet });
    if (!quiet) {
      console.error(`606 ${fresh.quarter} : ${Object.keys(fresh.brokers).length} brokers US`);
    }
    return fresh;
  } catch (e) {
    if (!cached) throw e;
    if (!quiet) console.error(`606 : ${String(e.message || e)} — table ${cached.quarter} conservée`);
    return cached;
  }
}

let cached606 = null;
let cached605 = null;

function load606() {
  if (cached606) return cached606;
  if (!fs.existsSync(CACHE_PATH)) return null;
  cached606 = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
  return cached606;
}

function load605() {
  if (cached605) return cached605;
  if (!fs.existsSync(RULE605_PATH)) return null;
  cached605 = JSON.parse(fs.readFileSync(RULE605_PATH, "utf8"));
  return cached605;
}

export function routingOf(broker) {
  const raw = String(broker || "")
    .trim()
    .toLowerCase()
    .split(":")[0];
  const key = ALIASES[raw] || raw;
  return load606()?.brokers?.[key] || null;
}

function tickerKey(ticker) {
  const raw = String(ticker || "")
    .trim()
    .toUpperCase();
  if (!raw || /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(raw)) return null;
  const bare = raw.replace(/\.(US|N|O|K|A|P)$/, "").split(/[:/]/).pop();
  return bare || null;
}

// 605 of the teneurs this broker reaches, weighted by its 606 mix. A signed
// negative 605 (Jane Street on a thin name) is treated as zero rather than a rebate.
export function usBookPerShare({ broker, ticker, fallback = null }) {
  const routing = routingOf(broker);
  const key = tickerKey(ticker);
  const line = key ? load605()?.symbols?.[key] : null;
  const blend = line?.perShare;
  if (fallback == null || blend == null || !routing?.mix) return fallback;
  const by = line.byReporter || {};
  let num = 0;
  let den = 0;
  for (const [ric, w] of Object.entries(routing.mix)) {
    if (!(w > 0)) continue;
    const raw = Object.prototype.hasOwnProperty.call(by, ric) ? by[ric] : blend;
    const v = raw < 0 ? 0 : raw;
    num += v * w;
    den += w;
  }
  if (!(den > 0)) return fallback;
  return Number(Math.max(0, num / den).toPrecision(6));
}

export function apply606(book, { broker, ticker }) {
  if (!book?.leaf || book.leaf.perShare == null || !broker || !ticker) return book;
  const perShare = usBookPerShare({ broker, ticker, fallback: book.leaf.perShare });
  if (perShare == null || perShare === book.leaf.perShare) return book;
  return { ...book, leaf: { ...book.leaf, perShare }, via606: true };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const asked = process.argv[2]?.toLowerCase();
  const table = await monthlyRouting({ refresh: !asked && !process.argv.includes("--cached") });
  if (asked) {
    const row = table.brokers[asked];
    if (!row) {
      console.log(`${asked} n'a pas de 606 dans ${table.quarter}`);
      process.exit(0);
    }
    console.log(`${asked} — ${row.name} (${table.quarter})`);
    for (const [ric, w] of Object.entries(row.mix).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${ric.padEnd(6)} ${(100 * w).toFixed(1)} %`);
    }
    process.exit(0);
  }
  console.log(`table ${table.quarter}`);
  for (const [folder, row] of Object.entries(table.brokers)) {
    const mix = Object.entries(row.mix)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${(100 * v).toFixed(0)}%`)
      .join("  ");
    console.log(`  ${folder.padEnd(22)} ${mix}`);
  }
}
