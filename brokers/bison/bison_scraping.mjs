// What BISON (EUWAX AG, Börse Stuttgart group) sells as shares and ETPs,
// with no login. BISON is a crypto app that added securities in 2022:
//
//   https://bisonapp.com/aktien-etfs/
//   https://bisonapp.com/aktien-etfs/exchange-traded-commodities/
//   https://bisonapp.com/aktien-etfs/exchange-traded-notes/
//
// Place: TradeREBEL, and only TradeREBEL. EUWAX's "Grundsätze für die
// Übermittlung von Wertpapieraufträgen" (bisonapp.com/dokumente/wertpapiere/):
// "Die Sutor Bank führt an sie übermittelte Wertpapieraufträge
// ausschließlich am Handelsplatz TradeRebel aus", a venue "mit lediglich
// einem Liquiditätsgeber" (EUWAX itself). Sutor's Vertragsbedingungen for the
// WP-BISON service, section 7: "Aktuell ist der Handel im Rahmen des WP-BISON
// Service ausschließlich über den Handelsplatz Trade Rebel möglich."
//
// What it sells there. EUWAX's Sonderbedingungen define the securities as
// "die über das BISON-Onlineangebot handelbaren Aktien, Bezugsrechte und ETP
// (ETF, ETC und ETN)", offered "soweit wir diese für den Handel über das
// BISON-Onlineangebot freigeschaltet haben". BISON publishes no list of its
// shares or ETFs, and no page leaves out a segment, a country or an ETF
// family. The pool is the TradeREBEL book as ./tradeRebelBook.mjs reads it
// (ESMA FIRDS filings for MIC STUF / STUE, checked against TradeREBEL's own
// FactSet market data: active notation with a price in the last 14 days;
// suspended, delisted and never-quoted lines out). There are no US
// closed-end funds on TradeREBEL (none of TARGOBANK's FUND lines is in the
// book), so no FUND typing.
//
// How many (owner rule 2026-10-25: the N most popular). The product page
//   https://bisonapp.com/aktien-etfs/
// says "Investiere ab sofort in über 2.500 Aktien und ETFs" (also "Über
// 2.500 Wertpapiere"); BISON's only place is TradeREBEL, so this is the
// size of its offer there. It does not split shares from ETFs, so N =
// 2,500 shares and ETFs together ("über" is a floor). ETCs and ETNs are not
// in that number and follow BISON's own lists (below).
// Ranking: TradeREBEL's own traded value, from the same FactSet Frontgate
// feed the exchange's site uses (token from
// https://www.traderebel.de/api/mdg/settings, market 1114 "Stuttgart
// TradeREBEL"): each line's end-of-day series
// (/api/v2/prices/timeSeries/eod/list, field tradingValue, in euro) summed
// over the last four weeks (one page of up to 20 trading days). The
// notation of a share comes from the TradeREBEL share screener, that of an
// ETF from ./tradeRebel-notations.json (read only) or the cross-reference
// call. Ties: traded units, then the ISIN. The 2,500 lines with the most
// euros traded are kept; the rest of the shares and ETFs go.
//
// ETCs and ETNs: BISON does publish lists, and only those are kept.
//   ETC page: "Aktuell können die folgenden ETCs mit BISON gehandelt werden."
//   ETN page: "Aktuell können die folgenden ETNs mit BISON gehandelt werden."
// The other ETNs and ETCs of the TradeREBEL book (261 and 190 on 25 October
// 2026: crypto ETNs, the rest of the WisdomTree range...) are left out. A
// listed line takes BISON's name (the shared lists call EUWAX Gold Core
// "Boerse Stuttgart AG"). A listed ISIN with
// no live TradeREBEL filing (on 25 October 2026: WisdomTree DAX 3x Daily
// Short and Leveraged, Silver 3x Daily Short / Leveraged, Natural Gas 3x
// Daily Short / Leveraged, Brent Crude Oil 3x Daily Short, whose FIRDS
// records are gone) is not tradable and is left out too. EUWAX Gold II
// (DE000EWG2LD7) is filed as CFI EY, which the book does not type, so it is
// checked here on its own (TradeREBEL notation and a price in 14 days).
//
// Left out, as in every scraper: subscription rights ("Bezugsrechte",
// corporate-action lines), certificates, bonds and debt lines
// (withoutObligations).
//
// Remarks, not removals:
//   - No KID, no buy. Sutor's Vertragsbedingungen, section 6(2): the bank
//     must exclude PRIIPs "vom Kauf ..., wenn der Hersteller des Produktes
//     kein entsprechendes Basisinformationsblatt zur Verfügung stellt". A
//     US-domiciled ETP has none (on 25 October 2026 one line: iShares U.S.
//     Aerospace & Defense, US4642887602). It stays and carries
//     `nonEuResident`, as bank1saar and 1822direkt do.
//   - Clients: "natürliche Personen, die ihren ausschließlichen Wohnsitz und
//     gewöhnlichen Aufenthalt in Deutschland haben und ausschließlich
//     deutsche Staatsbürger sind" (EUWAX Sonderbedingungen 3.2); "Der Handel
//     mit Wertpapieren bei BISON ist ausschließlich in Deutschland möglich."
//
// Fees: https://bisonapp.com/gebuehren/ "Gebühr pro Trade (Handel) 1,99 Euro"
// ("eine feste Gebühr von 1,99 Euro pro Kauf oder Verkauf"); Sutor's Preis-
// und Leistungsverzeichnis (Feb 2026): Finanzkommissionsentgelt 1,30 Euro +
// Übermittlungsentgelt EUWAX 0,69 Euro = 1,99 Euro. Everything trades in EUR.
//
//   node brokers/bison/bison_scraping.mjs
//   node brokers/bison/bison_scraping.mjs --fresh   (re-read FIRDS and the notation cache)

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { tradeRebelBook, tradeRebelLines } from "./tradeRebelBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("bison-parsed.json", import.meta.url);
const DAY_CACHE = new URL("tradeRebelBook-cache.json", import.meta.url);
const FRESH = process.argv.includes("--fresh");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const LISTS = [
  ["ETC", "https://bisonapp.com/aktien-etfs/exchange-traded-commodities/"],
  ["ETN", "https://bisonapp.com/aktien-etfs/exchange-traded-notes/"],
];
const FRESH_DAYS = 14;
const ISIN = /\b[A-Z]{2}[A-Z0-9]{9}\d\b/g;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (m) => console.error(m);
const TOP = 2500; // "über 2.500 Aktien und ETFs"
const SITE = "https://www.traderebel.de";
const MARKET = 1114;
const NOTATIONS = new URL("tradeRebel-notations.json", import.meta.url);
const WINDOW_DAYS = 28;

function pageText(html) {
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&#8211;|&ndash;/g, "-")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

// BISON's ETC / ETN table: name line, then ISIN line, after "Das ETx-Angebot bei BISON".
async function bisonList(type, url) {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
  const lines = pageText(await res.text());
  const start = lines.findIndex((l) => new RegExp(`Das ${type}-Angebot bei BISON`, "i").test(l));
  if (start < 0) throw new Error(`${url}: no "Das ${type}-Angebot bei BISON" table`);
  const end = lines.findIndex((l, i) => i > start && /Häufig gestellte Fragen|Börsengehandelte Goldprodukte/i.test(l));
  const out = new Map();
  const table = lines.slice(start, end < 0 ? start + 200 : end);
  table.forEach((l, i) => {
    const isin = l.match(ISIN)?.[0];
    if (isin && l === isin) out.set(isin, table[i - 1] || isin);
  });
  if (out.size < 5) throw new Error(`${url}: only ${out.size} ${type} ISINs`);
  return out;
}

// ---- popularity: TradeREBEL's own traded value --------------------------------------
// TradeREBEL's FactSet Frontgate feed: the same connection as
// ./tradeRebelBook.mjs (which does not export it).
async function connect() {
  const settings = await fetch(`${SITE}/api/mdg/settings`, { headers: { "User-Agent": UA, Referer: `${SITE}/de/` }, signal: AbortSignal.timeout(30000) });
  if (!settings.ok) throw new Error(`${SITE}/api/mdg/settings ${settings.status}`);
  const host = settings.headers.get("frontgate-host");
  const token = settings.headers.get("frontgate-authentication-token");
  if (!host || !token) throw new Error("no Frontgate host or token in /api/mdg/settings");
  const ws = new WebSocket(`wss://${host}:443/ws`, { protocols: ["v2.ws-jsjson.mdgms.com"], headers: { Origin: SITE, "User-Agent": UA } });
  ws.binaryType = "arraybuffer";
  let job = 0;
  let closed = false;
  const waiting = new Map();
  const parts = new Map();
  let onAuth;
  const authed = new Promise((resolve, reject) => {
    onAuth = resolve;
    setTimeout(() => reject(new Error("no authentication answer")), 20000);
  });
  const failAll = (why) => {
    closed = true;
    for (const { reject } of waiting.values()) reject(new Error(why));
    waiting.clear();
  };
  ws.onclose = () => failAll("socket closed");
  ws.onmessage = (event) => {
    const msg = JSON.parse(typeof event.data === "string" ? event.data : Buffer.from(event.data).toString("utf8"));
    if (/Authentication.*Response/.test(msg.Message || "")) return onAuth(msg);
    if (/DisconnectionMessage/.test(msg.Message || "")) return failAll(`disconnected: ${msg.details}`);
    const id = Number(msg.header?.id_job ?? msg.id_job);
    if (!waiting.has(id)) return;
    const chunk = parts.get(id) || [];
    chunk.push(msg.body?.value ?? "");
    if (msg.header && (Number(msg.header.flags) & 8) === 8) return void parts.set(id, chunk);
    parts.delete(id);
    const { resolve, reject } = waiting.get(id);
    waiting.delete(id);
    if (!/HighLevelResponse$/.test(msg.Message || "")) return reject(new Error(String(msg.details || msg.Message).slice(0, 300)));
    try {
      const body = JSON.parse(chunk.join(""));
      if (body?.errors?.length) return reject(new Error(String(body.errors[0].details).slice(0, 300)));
      resolve(body);
    } catch (error) {
      reject(error);
    }
  };
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error("websocket error"));
  });
  ws.send(
    JSON.stringify({
      Message: "AuthenticationByTokenRequest",
      Version: 1,
      token: { value: { b64: token } },
      software: JSON.stringify({ userAgent: UA, platform: "frontgate-js-sdk", version: "7.2.2", package: "@fds/frontgate-js-sdk", mobile: false }),
      os: "frontgate-js-sdk",
      feature_flags_wanted: { value: 0 },
      maximum_idle_interval: 60000000,
      maximum_receivable_message_size: 1048576,
      flags: 0,
      cache_authentication_salt: { value: { b64: "" } },
      cache_authentication_encrypted_secret: { encrypted_secret: { b64: "" } },
    }),
  );
  await authed;
  const keep = setInterval(() => !closed && ws.send(JSON.stringify({ Message: "KeepAliveMessage", Version: 2 })), 25000);
  function request(apiPath, data, method = "POST", timeout = 30000) {
    if (closed) return Promise.reject(new Error("socket closed"));
    const id = ++job;
    const msg = {
      Message: "HighLevelRequest",
      Version: 3,
      header: {
        dataset: { id_dataset: 0 },
        id_job: id,
        flags_r2: 128,
        resend_counter: 0,
        timeout,
        authentication_identifiers: { id_application: -2, id_user: -2 },
        cache_key: { value: [] },
        previous_response_hash: { value: [] },
        tracing: { value: { value: [] } },
      },
      accept: "application/json",
      content_type: "application/json",
      body: method === "POST" ? { value: JSON.stringify(data) } : { value: [] },
      query: method === "POST" ? "" : new URLSearchParams(data).toString(),
      path: apiPath,
      method: { value: method === "POST" ? 2 : 1 },
    };
    return new Promise((resolve, reject) => {
      waiting.set(id, { resolve, reject });
      setTimeout(() => {
        if (!waiting.has(id)) return;
        waiting.delete(id);
        reject(new Error(`timeout ${apiPath}`));
      }, timeout + 5000);
      ws.send(JSON.stringify(msg));
    });
  }
  return {
    request,
    get closed() {
      return closed;
    },
    close() {
      clearInterval(keep);
      closed = true;
      ws.close();
    },
  };
}

function feed() {
  let session = null;
  return {
    async call(apiPath, data, method = "POST") {
      let last;
      for (let attempt = 0; attempt < 6; attempt++) {
        try {
          if (!session || session.closed) session = await connect();
          return await session.request(apiPath, data, method);
        } catch (error) {
          last = error;
          if (/No instrument found|no notation/i.test(error.message)) return { data: [] };
          if (/is not a valid|not an valid|missing|Invalid parameters/.test(error.message)) throw error;
          if (session && /socket|disconnect|timeout/.test(error.message)) {
            session.close();
            session = null;
          }
          await sleep(1500 * (attempt + 1));
        }
      }
      throw last;
    },
    close() {
      session?.close();
    },
  };
}

const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

// ISIN -> TradeREBEL notation id, for the share and ETF lines of the book.
async function notationIds(fg, isins) {
  const ids = new Map();
  const validation = {
    onlyActive: true,
    market: { selection: { restrict: { ids: [MARKET] } } },
    prices: { latest: { availableOnly: true, minimumDate: daysAgo(14) } },
  };
  for (let offset = 0, total = Infinity; offset < total; offset += 500) {
    const answer = await fg.call("/api/v2/stock/notation/screener/search", {
      data: { validation },
      meta: { attributes: ["id", "market.id", "instrument.isin"], sort: ["instrument.name"], pagination: { offset, limit: 500 } },
    });
    total = answer.meta?.pagination?.total ?? 0;
    for (const line of answer.data || []) {
      const isin = line.instrument?.isin;
      if (isin && Number(line.market?.id ?? MARKET) === MARKET && !ids.has(isin)) ids.set(isin, String(line.id));
    }
    if (!answer.data?.length) break;
    await sleep(300);
  }
  const cache = JSON.parse(fs.readFileSync(NOTATIONS, "utf8"));
  for (const isin of isins) if (!ids.has(isin) && cache[isin]?.active) ids.set(isin, cache[isin].id);
  for (const isin of isins.filter((i) => !ids.has(i))) {
    const answer = await fg.call("/api/v2/notation/crossReference/listByISIN", { data: { isin, filter: { markets: { ids: [MARKET] } } } });
    const n = (answer.data || []).find((x) => Number(x.market?.id) === MARKET);
    if (n) ids.set(isin, String(n.id));
    await sleep(150);
  }
  return ids;
}

// notation id -> { value: euros traded, units, days } over the last four weeks.
async function tradedValue(fg, ids) {
  const out = new Map();
  const start = daysAgo(WINDOW_DAYS);
  const end = daysAgo(0);
  const dates = new Set();
  for (let i = 0; i < ids.length; i += 8) {
    await Promise.all(
      ids.slice(i, i + 8).map(async (id) => {
        const answer = await fg.call("/api/v2/prices/timeSeries/eod/list", { data: { identifier: { value: id, type: "idNotation" }, range: { start, end } } });
        let value = 0;
        let units = 0;
        for (const p of answer.data?.prices || []) {
          value += Number(p.tradingValue) || 0;
          units += Number(p.tradingVolume) || 0;
          dates.add(p.date);
        }
        out.set(id, { value, units });
      }),
    );
    if (i % 800 === 0 && i) log(`  TradeREBEL traded value ${i}/${ids.length}`);
  }
  tradedValue.days = dates.size;
  return out;
}

const listed = new Map(); // ISIN -> { type, name }
for (const [type, url] of LISTS) {
  for (const [isin, name] of await bisonList(type, url)) listed.set(isin, { type, name });
  await sleep(1500);
}
log(`BISON lists: ${[...listed.values()].filter((x) => x.type === "ETC").length} ETCs, ${[...listed.values()].filter((x) => x.type === "ETN").length} ETNs`);

const book = await tradeRebelBook({ fresh: FRESH, log });
const inBook = new Set(book.map((r) => r.isin));
const rows = [];
const dropped = { ETN: 0, ETC: 0 };
for (const r of book) {
  if (r.type === "ETN" || r.type === "ETC") {
    if (!listed.has(r.isin)) {
      dropped[r.type]++;
      continue;
    }
  }
  rows.push(listed.has(r.isin) ? { ...r, name: listed.get(r.isin).name } : r);
}

// Listed ETPs the book does not carry: kept when TradeREBEL files them live
// and quotes them.
const firds = JSON.parse(fs.readFileSync(DAY_CACHE, "utf8")).firds.lines;
const missing = [...listed.keys()].filter((isin) => !inBook.has(isin));
const notFiled = missing.filter((isin) => !firds[isin]);
const filed = missing.filter((isin) => firds[isin]);
const oldest = new Date(Date.now() - FRESH_DAYS * 864e5).toISOString().slice(0, 10);
const extra = filed.length ? await tradeRebelLines(filed, { fresh: FRESH, log }) : new Map();
const stale = [];
for (const isin of filed) {
  const n = extra.get(isin);
  if (!n?.active || !n.last || n.last < oldest) {
    stale.push(isin);
    continue;
  }
  const { type, name } = listed.get(isin);
  const ticker = n.symbol || isin;
  rows.push({
    query: ticker,
    ticker,
    name,
    exchange: "TradeREBEL",
    mic: firds[isin].mic,
    currency: n.currency || "EUR",
    type,
    isin,
    wkn: "",
    raw: `${firds[isin].name} ${isin} ${ticker} | TradeREBEL ${n.currency || "EUR"}`,
  });
}

// No KID (PRIIPs): a US- or Canada-domiciled ETP cannot be bought.
for (const r of rows) {
  const country = r.isin.slice(0, 2);
  if (r.type !== "STOCK" && (country === "US" || country === "CA")) r.nonEuResident = true;
}
const whole = withoutObligations(rows);
const before = {};
for (const r of whole) before[r.type] = (before[r.type] || 0) + 1;
if ((before.STOCK || 0) < 2000) throw new Error(`only ${before.STOCK || 0} shares`);
if ((before.ETF || 0) < 2000) throw new Error(`only ${before.ETF || 0} ETFs`);

// Owner rule 2026-10-25: the 2,500 shares and ETFs with the most euros traded
// on TradeREBEL over four weeks; BISON's listed ETCs and ETNs all stay.
const pool = whole.filter((r) => r.type === "STOCK" || r.type === "ETF");
const fg = feed();
const ids = await notationIds(fg, pool.map((r) => r.isin));
const traded = await tradedValue(fg, [...new Set(ids.values())]);
fg.close();
const NONE = { value: 0, units: 0 };
const activity = (r) => traded.get(ids.get(r.isin)) || NONE;
pool.sort((a, b) => activity(b).value - activity(a).value || activity(b).units - activity(a).units || a.isin.localeCompare(b.isin));
const top = new Set(pool.slice(0, TOP));
const kept = stampRows(whole.filter((r) => !pool.includes(r) || top.has(r)));
const last = pool[Math.min(TOP, pool.length) - 1];
const withTrades = pool.filter((r) => activity(r).value > 0).length;
if (withTrades < TOP) log(`warning: only ${withTrades} shares and ETFs traded in four weeks; the cut falls among untraded lines`);

const count = {};
for (const r of kept) count[r.type] = (count[r.type] || 0) + 1;
if ((count.STOCK || 0) + (count.ETF || 0) !== Math.min(TOP, pool.length)) throw new Error(`kept ${count.STOCK} shares and ${count.ETF} ETFs`);
if ((count.ETN || 0) + (count.ETC || 0) < 10) throw new Error("fewer than 10 ETNs and ETCs");
for (const isin of ["DE0007164600", "US0378331005", "IE00B4L5Y983", "DE000EWG4CR2"]) {
  if (!kept.some((r) => r.isin === isin)) throw new Error(`${isin} missing`);
}
fs.writeFileSync(OUTPUT, JSON.stringify(kept, null, 2));

log(
  `${kept.length} lines (${Object.entries(count).map(([k, n]) => `${n} ${k}`).join(", ")}); ` +
    `not on BISON's lists: ${dropped.ETN} ETNs, ${dropped.ETC} ETCs; ` +
    `listed but not filed on TradeREBEL: ${notFiled.join(" ") || "none"}; listed, filed, not quoted: ${stale.join(" ") || "none"}; ` +
    `${rows.length - whole.length} dropped as debt; nonEuResident (no KID): ${kept.filter((r) => r.nonEuResident).length}`,
);
log(
  `whole place ${whole.length} -> ${kept.length} (owner rule: ${TOP} most traded shares and ETFs; ${pool.filter((r) => ids.has(r.isin)).length} of ${pool.length} notations found, ` +
    `${withTrades} traded over ${tradedValue.days} trading days since ${daysAgo(WINDOW_DAYS)})`,
);
log(`${TOP}th share/ETF: ${last.name} (${last.isin}, ${last.type}), EUR ${Math.round(activity(last).value).toLocaleString("en")} traded in four weeks, ` +
  `EUR ${Math.round(activity(last).value / Math.max(1, tradedValue.days)).toLocaleString("en")} a day`);
log(JSON.stringify(tradeRebelBook.stats));
process.exit(0);
