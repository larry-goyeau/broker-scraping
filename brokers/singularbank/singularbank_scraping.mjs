// What Singular Bank (Self Bank) lists in shares and exchange-traded funds,
// with no login. Two public searches are the book.
//
// Shares are the trading-center instrument search. Fewer than three
// characters is refused, so the walk starts at three. A query that comes
// back full is walked one character further. Warrants are in the same
// search and are not kept. A tracker is an ETF and is taken from the ETF
// search instead, which is the whole book.
//
// The ETF search is one list. Each line names the markets it trades on,
// one ticker, and no currency. The quote for that ISIN on that market
// names the ticker and the currency of that book: IWDA on Xetra is EUNL
// in euros, and the same ISIN in London is SWDA in pounds.
//
//   https://buscador.selfbank.es/api/funds?dataSource=etf-y-etc&limit=10000&page=1
//   https://tradingcenter.selfbank.es/services/api/?s0=Feed_Instrument.search
//   https://tradingcenter.selfbank.es/services/api/?s0=Feed_Instrument.getQuote
//
//   node brokers/singularbank/singularbank_scraping.mjs
//   node brokers/singularbank/singularbank_scraping.mjs --etfs
//   node brokers/singularbank/singularbank_scraping.mjs --stocks --prefix=IBE
//   node brokers/singularbank/singularbank_scraping.mjs --limit=20
//   node brokers/singularbank/singularbank_scraping.mjs --fresh

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const HOME = "https://tradingcenter.selfbank.es/";
const API = "https://tradingcenter.selfbank.es/services/api/";
const SIGN = "https://tradingcenter.selfbank.es/getSignature";
const FUNDS = "https://buscador.selfbank.es/api/funds?dataSource=etf-y-etc&limit=10000&page=1";
const OUTPUT = new URL("singularbank-parsed.json", import.meta.url);
const PROGRESS = new URL("singularbank-progress.json", import.meta.url);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

// Codes the ETF search prints, and the market the quote is asked on.
const MIC = {
  XE: "XETR",
  MI: "XMIL",
  LO: "XLON",
  PA: "XPAR",
  AM: "XAMS",
  IB: "XMCE",
  BR: "XBRU",
  LI: "XLIS",
};

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
// A three-character query that still fills the page is walked further.
const SPLIT_AT = 150;
const QUOTE_BATCH = 12;
const LANES = 4;

function arg(flag) {
  const hit = process.argv.slice(2).find((item) => item.startsWith(`--${flag}=`));
  return hit ? hit.split("=").slice(1).join("=") : "";
}

function numberArg(flag) {
  const value = arg(flag);
  return value && /^\d+$/.test(value) ? parseInt(value, 10) : 0;
}

const LIMIT = numberArg("limit");
const FRESH = process.argv.includes("--fresh");
const ETFS_ONLY = process.argv.includes("--etfs");
const STOCKS_ONLY = process.argv.includes("--stocks");
const prefixLimit = arg("prefix").trim().toUpperCase();
const sample = LIMIT > 0 || Boolean(prefixLimit);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function store(jar, response) {
  const lines = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  for (const line of lines) {
    const pair = line.split(";")[0];
    const cut = pair.indexOf("=");
    if (cut > 0) jar.set(pair.slice(0, cut).trim(), pair.slice(cut + 1).trim());
  }
}

function cookieHeader(jar) {
  return [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isinOf(value) {
  const text = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(text) ? text : "";
}

function productType(name, category) {
  const blob = `${name} ${category}`;
  if (/\bETNs?\b/i.test(blob)) return "ETN";
  if (/\bETCs?\b/i.test(blob)) return "ETC";
  if (/\bETPs?\b/i.test(blob)) return "ETP";
  if (/materias primas|activos digitales|physical/i.test(blob)) return "ETC";
  return "ETF";
}

function encodeForm(value, prefix) {
  const parts = [];
  for (const [key, item] of Object.entries(value)) {
    if (item == null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (item && typeof item === "object") parts.push(encodeForm(item, name));
    else parts.push(`${name}=${encodeURIComponent(item)}`);
  }
  return parts.filter(Boolean).join("&");
}

async function getText(url, jar = new Map()) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Cookie: cookieHeader(jar), Accept: "*/*" },
        signal: AbortSignal.timeout(30_000),
      });
      store(jar, response);
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${error.message || error}`;
    }
    await sleep(400 * (attempt + 1));
  }
  throw new Error(last);
}

let apiKey = "";

// The signature is tied to the cookie just set, so each call keeps its own.
async function call(actions) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const jar = new Map();
    try {
      const sig = JSON.parse(await getText(SIGN, jar));
      if (!Array.isArray(sig) || sig.length < 3) throw new Error("bad signature");
      const action = {};
      const query = [];
      actions.forEach(([service, params], index) => {
        const [domain, name] = service.split(".");
        action[`s${index}`] = { domain, service: name, params: params || {} };
        query.push(`s${index}=${encodeURIComponent(service)}`);
      });
      const body = encodeForm({
        hash: {
          timestamp: sig[0],
          nonce: sig[2],
          device: UA,
          os: "MacIntel",
          udid: 1,
          key: apiKey,
          signature: sig[1],
        },
        action,
      });
      const response = await fetch(`${API}?${query.join("&")}`, {
        method: "POST",
        headers: {
          "User-Agent": UA,
          Cookie: cookieHeader(jar),
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          Origin: "https://tradingcenter.selfbank.es",
        },
        body,
        signal: AbortSignal.timeout(40_000),
      });
      store(jar, response);
      if (!response.ok) {
        last = `${response.status} ${actions[0][0]}`;
      } else {
        const data = await response.json();
        if (data.error) last = data.error.message || "request refused";
        else return actions.map((_, index) => data[`s${index}`] || null);
      }
    } catch (error) {
      last = `${error.message || error}`;
    }
    await sleep(500 * (attempt + 1));
  }
  throw new Error(last);
}

function marketsOf(fund) {
  const codes = [];
  for (const raw of String(fund.mercado_negociacion || "").split(",")) {
    const code = raw.trim().toUpperCase();
    if (!code || codes.includes(code)) continue;
    if (!MIC[code]) throw new Error(`${fund.isin} names an unknown market ${code}`);
    codes.push(code);
  }
  return codes;
}

function quoteRow(fund, slot) {
  if (!slot || slot.error) return null;
  const quote = slot.result && slot.result.quote;
  if (!quote || quote.isTradable === false) return null;
  const isin = isinOf(quote.isin || fund.isin);
  const ticker = String(quote.code2 || fund.ticker || "").trim().toUpperCase();
  const currency = String(quote.currency || "").trim().toUpperCase();
  const exchange = String(quote.exchangeCode || "").trim().toUpperCase();
  if (!isin || !ticker || !currency || !exchange) return null;
  return {
    ticker,
    name: clean(fund.name),
    exchange,
    currency,
    type: productType(fund.name, fund.category),
    isin,
  };
}

function stockRow(item) {
  if (!item || item.isTradable === false) return null;
  if (String(item.instrumentType || "") !== "Stock") return null;
  const isin = isinOf(item.isin);
  const ticker = String(item.code2 || item.mnemo || "").trim().toUpperCase();
  const currency = String(item.currency || "").trim().toUpperCase();
  const exchange = String(item.exchangeCode || "").trim().toUpperCase();
  const name = clean(item.label || item.value);
  if (!isin || !ticker || !currency || !exchange || !name) return null;
  return { ticker, name, exchange, currency, type: "STOCK", isin };
}

function addRow(rows, seen, row) {
  const key = `${row.isin}|${row.exchange}|${row.currency}`;
  if (seen.has(key)) return false;
  seen.add(key);
  rows.push(row);
  return true;
}

function readJson(url) {
  if (FRESH || !fs.existsSync(url)) return null;
  return JSON.parse(fs.readFileSync(url, "utf8"));
}

const prior = readJson(OUTPUT);
const priorRows = Array.isArray(prior) ? prior : [];
const progress = sample ? null : readJson(PROGRESS);
const donePrefixes = new Set(Array.isArray(progress?.done) ? progress.done : []);

function seeds() {
  if (!prefixLimit && Array.isArray(progress?.pending)) {
    return progress.pending.filter((prefix) => !donePrefixes.has(prefix));
  }
  if (!prefixLimit) {
    const out = [];
    for (const a of ALPHABET) {
      for (const b of ALPHABET) {
        for (const c of ALPHABET) out.push(a + b + c);
      }
    }
    return out.filter((prefix) => !donePrefixes.has(prefix));
  }
  const prefix = prefixLimit;
  if (prefix.length >= 3) return [prefix];
  let layer = [prefix];
  while (layer[0].length < 3) {
    const next = [];
    for (const item of layer) {
      for (const ch of ALPHABET) next.push(item + ch);
    }
    layer = next;
  }
  return layer;
}

async function loadEtfs(rows, seen) {
  const page = JSON.parse(await getText(FUNDS));
  let funds = Array.isArray(page.funds) ? page.funds : [];
  if (LIMIT > 0) funds = funds.slice(0, LIMIT);
  const quoted = new Set(rows.filter((row) => row.type !== "STOCK").map((row) => `${row.isin}|${row.exchange}`));
  const tasks = [];
  for (const fund of funds) {
    const isin = isinOf(fund.isin);
    if (!isin) continue;
    fund.isin = isin;
    for (const code of marketsOf(fund)) {
      const mic = MIC[code];
      if (quoted.has(`${isin}|${mic}`)) continue;
      tasks.push({ fund, mic });
    }
  }
  console.error(`${funds.length} ETFs, ${tasks.length} quotes`);
  let missed = 0;
  for (let start = 0; start < tasks.length; start += QUOTE_BATCH * 2) {
    const slice = tasks.slice(start, start + QUOTE_BATCH * 2);
    const halves = [slice.slice(0, QUOTE_BATCH), slice.slice(QUOTE_BATCH)].filter((half) => half.length);
    const answered = await Promise.all(halves.map((half) =>
      call(half.map((task) => ["Feed_Instrument.getQuote", { symbol: `${task.fund.isin}.ISIN.${task.mic}` }]))
        .then((slots) => half.map((task, index) => ({ task, slot: slots[index] })))
    ));
    for (const batch of answered) {
      for (const { task, slot } of batch) {
        const row = quoteRow(task.fund, slot);
        if (!row) missed += 1;
        else addRow(rows, seen, row);
      }
    }
    fs.writeFileSync(OUTPUT, JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
    console.error(`${Math.min(start + slice.length, tasks.length)}/${tasks.length} quotes, ${rows.length} lines`);
  }
  return missed;
}

// Null means the query itself was refused. AAB does that: the service
// answers "Unknown error" and the names are recovered one character further.
async function searchPrefix(prefix) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const [slot] = await call([["Feed_Instrument.search", { query: prefix }]]);
      const items = slot && !slot.error && slot.result && Array.isArray(slot.result.instruments) ? slot.result.instruments : null;
      if (items) return items;
      last = (slot && slot.error && slot.error.message) || "search had no instruments";
    } catch (error) {
      last = error.message || String(error);
    }
    if (/unknown error|timeout|aborted/i.test(last)) return null;
    if (/no encontrado|not found|introuvable/i.test(last)) return [];
    await sleep(400 * (attempt + 1));
  }
  console.error(`${prefix}: ${last}`);
  return null;
}

async function loadStocks(rows, seen) {
  const pending = seeds();
  const kinds = new Map();
  const inflight = new Set();
  let cursor = 0;
  let searched = 0;

  async function run() {
    while (cursor < pending.length) {
      if (LIMIT > 0 && rows.filter((row) => row.type === "STOCK").length >= LIMIT) return;
      const prefix = pending[cursor];
      cursor += 1;
      inflight.add(prefix);
      const items = await searchPrefix(prefix);
      if (items) {
        for (const item of items) {
          const kind = String(item.instrumentType || "");
          if (kind !== "Stock") kinds.set(kind, (kinds.get(kind) || 0) + 1);
          const row = stockRow(item);
          if (row) addRow(rows, seen, row);
        }
      }
      if ((!items || items.length >= SPLIT_AT) && prefix.length < 6) {
        for (const ch of ALPHABET) {
          const next = prefix + ch;
          if (!donePrefixes.has(next)) pending.push(next);
        }
      }
      donePrefixes.add(prefix);
      inflight.delete(prefix);
      searched += 1;
      if (!sample && searched % 40 === 0) {
        fs.writeFileSync(PROGRESS, JSON.stringify({
          done: [...donePrefixes],
          pending: pending.slice(cursor).concat([...inflight]),
        }));
        fs.writeFileSync(OUTPUT, JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
        console.error(`${donePrefixes.size} prefixes, ${rows.filter((row) => row.type === "STOCK").length} shares`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(LANES, Math.max(pending.length, 1)) }, () => run()));
  if (!sample && cursor >= pending.length && fs.existsSync(PROGRESS)) fs.unlinkSync(PROGRESS);
  return kinds;
}

const html = await getText(HOME);
const key = html.match(/"API_KEY":"([0-9a-f]+)"/);
if (!key) throw new Error("trading center page had no API key");
apiKey = key[1];

const rows = [];
const seen = new Set();
// A stopped run is continued from the file already written. Shares already
// found are kept only when the prefix walk itself was saved. A sample
// run does not mix into that file's resume.
if (!FRESH && !sample) {
  const resumeShares = !ETFS_ONLY && (donePrefixes.size > 0 || Array.isArray(progress?.pending));
  for (const row of priorRows) {
    const share = row.type === "STOCK";
    if (share && !ETFS_ONLY && !resumeShares) continue;
    if (!share && STOCKS_ONLY) continue;
    addRow(rows, seen, row);
  }
}

let missedQuotes = 0;
let otherKinds = new Map();
if (!STOCKS_ONLY) missedQuotes = await loadEtfs(rows, seen);
if (!ETFS_ONLY) otherKinds = await loadStocks(rows, seen);

const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(OUTPUT, JSON.stringify(kept, null, 2));

if (!sample && !STOCKS_ONLY) {
  const etfIsins = new Set(kept.filter((row) => row.type !== "STOCK").map((row) => row.isin));
  if (etfIsins.size < 2700) throw new Error(`only ${etfIsins.size} ETFs`);
  const world = kept.filter((row) => row.isin === "IE00B4L5Y983");
  if (!world.some((row) => row.exchange === "XETR" && row.currency === "EUR" && row.ticker === "EUNL")) {
    throw new Error("IWDA had no Xetra euro line");
  }
  if (!world.some((row) => row.exchange === "XLON" && row.currency === "GBP" && row.ticker === "SWDA")) {
    throw new Error("IWDA had no London line");
  }
}
if (!sample && !ETFS_ONLY) {
  const santander = kept.filter((row) => row.isin === "ES0113900J37");
  if (!santander.some((row) => row.exchange === "XMCE" && row.currency === "EUR" && row.ticker === "SAN")) {
    throw new Error("Santander had no Madrid line");
  }
}

const shares = kept.filter((row) => row.type === "STOCK").length;
const funds = kept.length - shares;
const byPlace = new Map();
for (const row of kept) byPlace.set(row.exchange, (byPlace.get(row.exchange) || 0) + 1);
const skipped = [...otherKinds].map(([kind, count]) => `${count} ${kind || "blank"}`).join(", ");
console.error(
  `${kept.length} lines, ${shares} shares, ${funds} funds` +
    (missedQuotes ? `, ${missedQuotes} quotes missed` : "") +
    (skipped ? `, skipped ${skipped}` : "") +
    ` (${[...byPlace].map(([place, count]) => `${count} ${place}`).join(", ")})`
);
