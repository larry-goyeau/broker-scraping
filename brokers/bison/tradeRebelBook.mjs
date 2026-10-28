// The TradeREBEL book: every share, ETF, ETN and ETC that can be traded
// today on TradeREBEL, for the brokers whose one place is "TradeREBEL"
// (BISON). TradeREBEL is a trading venue of the Baden-Württembergische
// Wertpapierbörse (Börse Stuttgart), "ein voll regulierter, börslicher
// Handelsplatz der Gruppe Börse Stuttgart" where "Aktien, Anleihen,
// Genussscheine, ETPs und Fonds" trade from 7:30 to 22:00, quote-driven
// ("fortlaufende Preisanfrage"):
//   https://www.traderebel.de/de/   https://www.traderebel.de/de/handeln/
// It publishes no instrument file; it is read from two public sources.
//
// 1. The lines: ESMA's FIRDS register, where the exchange files every
//    instrument admitted on each of its segments.
//      https://registers.esma.europa.eu/solr/esma_registers_firds/select
//    TradeREBEL is Börse Stuttgart's "technical platform 3": MIC STUF
//    (Freiverkehr) and STUE (regulated market) in ISO 10383. The filings
//    start on 14 December 2022, TradeREBEL's first day, and match it: on
//    25 October 2026 every one of the 2,870 shares TARGOBANK's FactSet
//    screener shows on TradeREBEL (market 1114) is filed there. Latest
//    record per line, status not "Terminated", trading termination date
//    not passed, trading start date not still to come.
//    Kept: CFI E* (shares, depositary receipts, preference shares; EY,
//    structured participation products, is left out) as STOCK; CFI CE*
//    as ETF; any other line only when Deutsche Börse's tradable-instrument
//    lists (read through ../1822direkt/germanyBook.mjs) type its ISIN ETF,
//    ETN or ETC: the ETN / ETC lines (filed as D*, some as E*) and a few
//    ETFs filed as CI. Those lists' ETN / ETC type always wins.
//    Left out: bonds and certificates (D*), open-ended funds (CI, CF, CM,
//    and the open-ended real estate funds in CB) and the H*/R*/S* classes.
//    A share line of the screener below that FIRDS files as CB (REITs:
//    Equinix, Hamborner REIT) or CI (BDCs: Ares Capital) stays STOCK.
// 2. What trades today: TradeREBEL's own market data, the FactSet
//    Frontgate feed its site uses (token from
//    https://www.traderebel.de/api/mdg/settings, market id 1114
//    "Stuttgart TradeREBEL").
//    - Shares: the share screener restricted to market 1114, active
//      notations with a price in the last 14 days and, when there is a
//      previous price, one in the last 10 days (the same validation as
//      TARGOBANK's site, which runs on the same feed). A FIRDS share with
//      no such notation is dropped (suspended, delisted at home, never
//      quoted); a screener line not yet in FIRDS (FIRDS runs a few days
//      behind new admissions) is kept, typed from FactSet. A line quoted
//      in percent (participation certificates) is not a share and goes.
//    - ETF / ETN / ETC: the screener has no ETP side on this feed, so each
//      ISIN's TradeREBEL notation is looked up (notation/crossReference/
//      listByISIN, cached in tradeRebel-notations.json, one call per new
//      ISIN) and its latest price read in batches (prices/list). No active
//      notation, or no price in the last 14 days: dropped.
//    - Suspensions: Börse Stuttgart publishes TradeREBEL's suspensions at
//        https://www.boerse-stuttgart.de/de-de/fuer-geschaeftspartner/reports/handelsaussetzungen-und-ausschluesse/
//      but that page sits behind a Cloudflare challenge and is not read.
//      A suspended line stops being quoted, which the 14-day price rule
//      catches after two weeks; inside that window a line is also dropped
//      when Deutsche Börse's MiFID II suspension list holds a suspension
//      still in force whose reason is the home market ("entsprechend
//      Handhabung am Referenzmarkt"), which every German venue follows
//      (suspendedNow() of ../1822direkt/germanyBook.mjs, its cache).
//
// Row: { query, ticker, name, exchange, mic, currency, type, isin, wkn, raw }
//   exchange "TradeREBEL" (the place name in broker-list.json); mic the
//   FIRDS segment, STUF or STUE (null for a line FIRDS does not carry yet).
//   Not XSTU: that is the Börse Stuttgart floor, a different book.
//   ticker / query: the TradeREBEL symbol, else the Deutsche Börse short
//   code, else the ISIN. currency: the notation's trading currency (all
//   EUR on 25 October 2026). name: assets/stocks.csv or etfs.csv for the
//   ISIN, else FactSet's, else FIRDS's. type STOCK, ETF, ETN or ETC. US
//   closed-end funds on the share screener are not told apart from shares
//   here (FIRDS files them CI like the BDCs); a scraper that wants them as
//   FUND applies targobankde_scraping.mjs's rule.
//
// Usage
//   import { tradeRebelBook } from "../bison/tradeRebelBook.mjs";
//   const rows = await tradeRebelBook({ log: (m) => console.error(m) });
//   const lines = await tradeRebelLines(["DE000EWG2LD7"]);   // notation + latest price date
//
//   node brokers/bison/tradeRebelBook.mjs            counts by type
//   node brokers/bison/tradeRebelBook.mjs --fresh    ignore the day cache and the notation cache

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { germanyBook, suspendedNow } from "../1822direkt/germanyBook.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const DAY_CACHE = path.join(HERE, "tradeRebelBook-cache.json");
const NOTATIONS = path.join(HERE, "tradeRebel-notations.json");

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const SITE = "https://www.traderebel.de";
const FIRDS = "https://registers.esma.europa.eu/solr/esma_registers_firds/select";
const SEGMENTS = ["STUF", "STUE"];
const MARKET = 1114;
const FRESH_DAYS = 14;
const PREVIOUS_DAYS = 10;
const PAGE = 500;
const IN_FLIGHT = 4;
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
// FactSet value-unit ids met on the screener.
const UNITS = { 63: "EUR" };
const LEAST = { firds: 15000, shares: 2000, etps: 2000 };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const berlinDay = (date = new Date()) => date.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
}

async function getJson(url, { timeout = 180000, tries = 4 } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(timeout) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      if (attempt >= tries) throw new Error(`${url}: ${error.message}`);
      await sleep(3000 * attempt);
    }
  }
}

// ---- FIRDS: the lines the exchange files for TradeREBEL ---------------------------

async function firdsLines(today, log) {
  const fl = "isin,mic,gnr_full_name,gnr_cfi_code,mrkt_trdng_start_date,mrkt_trdng_trmination_date";
  const query = SEGMENTS.map((m) => `mic:${m}`).join(" OR ");
  const docs = [];
  let cursor = "*";
  for (;;) {
    const url = `${FIRDS}?q=${encodeURIComponent(query)}&fq=latest_received_flag:1&fq=-status:TERM&fl=${fl}&wt=json&rows=2000&sort=id%20asc&cursorMark=${encodeURIComponent(cursor)}`;
    const answer = await getJson(url);
    docs.push(...answer.response.docs);
    log(`  FIRDS ${docs.length} of ${answer.response.numFound}`);
    if (!answer.nextCursorMark || answer.nextCursorMark === cursor) break;
    cursor = answer.nextCursorMark;
    await sleep(1000);
  }
  if (docs.length < LEAST.firds) throw new Error(`FIRDS answered only ${docs.length} TradeREBEL records`);
  const lines = {};
  const dropped = { terminated: 0, notYetTrading: 0 };
  for (const doc of docs) {
    if (!ISIN.test(doc.isin || "")) continue;
    const end = String(doc.mrkt_trdng_trmination_date || "").slice(0, 10);
    if (end && end < today) { dropped.terminated++; continue; }
    const start = String(doc.mrkt_trdng_start_date || "").slice(0, 10);
    if (start && start > today) { dropped.notYetTrading++; continue; }
    // A title moved between the two segments can carry both records; the
    // regulated market (STUE) wins.
    if (lines[doc.isin] && lines[doc.isin].mic === "STUE") continue;
    lines[doc.isin] = { mic: doc.mic, cfi: String(doc.gnr_cfi_code || ""), name: clean(doc.gnr_full_name) };
  }
  return { lines, dropped };
}

// ---- TradeREBEL's FactSet Frontgate feed ---------------------------------------------

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

// Every share notation on TradeREBEL with a recent price, paged by name; a
// second pass in the other order fills lines that moved between pages.
async function tradeRebelShares(fg, log) {
  const validation = {
    onlyActive: true,
    market: { selection: { restrict: { ids: [MARKET] } } },
    prices: {
      latest: { availableOnly: true, minimumDate: daysAgo(FRESH_DAYS) },
      previous: { availableOnly: false, minimumDate: daysAgo(PREVIOUS_DAYS) },
    },
  };
  const attributes = ["id", "symbol", "valueUnit.id", "valueUnit.code", "market.id", "instrument.isin", "instrument.name", "instrument.nsin.wkn"];
  const byId = new Map();
  let total = null;
  for (const sort of ["instrument.name", "-instrument.name"]) {
    for (let offset = 0; ; offset += PAGE) {
      const answer = await fg.call("/api/v2/stock/notation/screener/search", { data: { validation }, meta: { attributes, sort: [sort], pagination: { offset, limit: PAGE } } });
      total = answer.meta?.pagination?.total ?? total;
      for (const line of answer.data || []) byId.set(String(line.id), line);
      if (!answer.data?.length || offset + PAGE >= total) break;
      await sleep(300);
    }
    if (total == null || byId.size >= total) break;
  }
  log(`  TradeREBEL share screener: ${byId.size} of ${total}`);
  if (byId.size < LEAST.shares) throw new Error(`TradeREBEL share screener answered only ${byId.size} lines`);
  return [...byId.values()].filter((line) => Number(line.market?.id ?? MARKET) === MARKET);
}

// ISIN -> its TradeREBEL notation { id, symbol, currency, active } or null.
// Notation ids do not change, so the answers are kept across runs.
async function tradeRebelNotations(fg, isins, { fresh, log }) {
  const cache = (!fresh && readJson(NOTATIONS)) || {};
  const todo = isins.filter((isin) => !(isin in cache));
  log(`  TradeREBEL notations: ${isins.length - todo.length} cached, ${todo.length} to look up`);
  for (let start = 0; start < todo.length; start += IN_FLIGHT) {
    const batch = todo.slice(start, start + IN_FLIGHT);
    const answers = await Promise.all(
      batch.map((isin) =>
        fg
          .call("/api/v2/notation/crossReference/listByISIN", { data: { isin, filter: { markets: { ids: [MARKET] } } } })
          .catch((error) => ({ error: error.message })),
      ),
    );
    batch.forEach((isin, i) => {
      if (answers[i].error) return log(`  ${isin}: ${answers[i].error}`);
      const n = (answers[i].data || []).find((x) => Number(x.market?.id) === MARKET);
      cache[isin] = n ? { id: String(n.id), symbol: clean(n.symbol), currency: n.valueUnit?.isoCode || "", active: n.active !== false } : null;
    });
    if ((start / IN_FLIGHT) % 100 === 99) {
      log(`  TradeREBEL notations ${start + batch.length}/${todo.length}`);
      writeJson(NOTATIONS, cache);
    }
    await sleep(150);
  }
  writeJson(NOTATIONS, cache);
  return cache;
}

// idNotation -> date (YYYY-MM-DD) of its latest price.
async function latestPrices(fg, ids, log) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const answer = await fg.call("/api/v2/prices/list", { identifiers: batch.join(","), identifierType: "idNotation", quality: "DLY" }, "GET");
    for (const p of answer.data || []) out.set(String(p.idNotation), String(p.latest?.time || "").slice(0, 10));
    await sleep(300);
  }
  log(`  TradeREBEL prices: ${out.size} of ${ids.length} notations answered`);
  return out;
}

// ISIN -> { id, symbol, currency, active, last } for chosen ISINs: their
// TradeREBEL notation (cached as above) and the date of its latest price.
// For a line the book does not type as a share or ETP (BISON's EUWAX Gold
// II, filed as EY). null when TradeREBEL has no notation for the ISIN.
export async function tradeRebelLines(isins, { fresh = false, log = () => {} } = {}) {
  const fg = feed();
  try {
    const notations = await tradeRebelNotations(fg, isins, { fresh, log });
    const ids = isins.map((isin) => notations[isin]).filter((n) => n?.active).map((n) => n.id);
    const prices = ids.length ? await latestPrices(fg, ids, log) : new Map();
    return new Map(isins.map((isin) => [isin, notations[isin] ? { ...notations[isin], last: prices.get(notations[isin].id) || "" } : null]));
  } finally {
    fg.close();
  }
}

// ---- names --------------------------------------------------------------------------

function assetNames() {
  const names = new Map();
  for (const file of ["assets/etfs.csv", "assets/stocks.csv"]) {
    const text = fs.readFileSync(path.join(ROOT, file), "utf8");
    for (const line of text.split(/\r?\n/).slice(1)) {
      const cells = [...line.matchAll(/("([^"]|"")*"|[^,]*)(,|$)/g)].map((m) => m[1].replace(/^"|"$/g, "").replace(/""/g, '"')).slice(0, -1);
      const [, , isin, name] = cells;
      if (ISIN.test(isin || "") && name && !names.has(isin)) names.set(isin, name.trim());
    }
  }
  return names;
}

// ---- entry point -----------------------------------------------------------------------

export async function tradeRebelBook({ fresh = false, log = () => {} } = {}) {
  const today = berlinDay();
  const cached = !fresh ? readJson(DAY_CACHE) : null;
  let firds = cached?.day === today ? cached.firds : null;
  if (!firds) {
    log("  reading FIRDS (STUF, STUE)");
    firds = await firdsLines(today, log);
    writeJson(DAY_CACHE, { day: today, firds });
  }

  // Deutsche Börse's lists: ETN / ETC typing and the short codes.
  log("  reading the Deutsche Börse lists (germanyBook)");
  const db = await germanyBook({ venues: ["Xetra", "Frankfurt"], log });
  const dbType = new Map();
  const dbCode = new Map();
  for (const r of db) {
    if (r.type !== "STOCK" && (!dbType.has(r.isin) || r.type !== "ETF")) dbType.set(r.isin, r.type);
    if (!dbCode.has(r.isin) && r.ticker !== r.isin) dbCode.set(r.isin, { mnemonic: r.ticker, wkn: r.wkn || "" });
  }

  const stats = {
    firds: Object.keys(firds.lines).length,
    firdsDropped: firds.dropped,
    shares: { kept: 0, notInFirds: 0, notShareInFirds: 0, noRecentPrice: 0, suspended: 0, notIsoCurrency: 0 },
    etps: { kept: 0, noNotation: 0, inactive: 0, noRecentPrice: 0, suspended: 0 },
  };
  const names = assetNames();
  const fg = feed();
  const candidates = [];
  try {
    // Shares: the screener's live lines, typed from FIRDS.
    const shareLines = await tradeRebelShares(fg, log);
    const liveShares = new Set();
    for (const line of shareLines) {
      const isin = clean(line.instrument?.isin);
      if (!ISIN.test(isin) || liveShares.has(isin)) continue;
      liveShares.add(isin);
      // The screener names the unit ("Euro"); FactSet unit 63 is EUR.
      const currency = UNITS[line.valueUnit?.id] || (/^[A-Z]{3}$/.test(line.valueUnit?.code || "") ? line.valueUnit.code : "");
      // Quoted in percent: participation certificates, not a share price.
      if (!currency) { stats.shares.notIsoCurrency++; continue; }
      const f = firds.lines[isin];
      let type = "STOCK";
      // FIRDS files REITs as CB and BDCs (Ares Capital, Main Street) as CI:
      // both are listed companies and stay STOCK. Debt (D*: Genussscheine,
      // notes) and EY structured products are not shares, unless Deutsche
      // Börse types the ISIN ETN or ETC.
      const known = dbType.get(isin);
      if (known === "ETN" || known === "ETC") type = known;
      else if (f) {
        if (f.cfi.startsWith("CE")) type = dbType.get(isin) || "ETF";
        else if (f.cfi.startsWith("D") || f.cfi.startsWith("EY")) { stats.shares.notShareInFirds++; continue; }
      } else stats.shares.notInFirds++;
      candidates.push({ isin, type, mic: f?.mic || null, symbol: clean(line.symbol), wkn: clean(line.instrument?.nsin?.wkn), feedName: clean(line.instrument?.name), firdsName: f?.name || "", currency, group: "shares" });
    }
    for (const [isin, f] of Object.entries(firds.lines)) {
      if (f.cfi.startsWith("E") && !f.cfi.startsWith("EY") && !liveShares.has(isin)) stats.shares.noRecentPrice++;
    }

    // ETF / ETN / ETC: FIRDS lines, checked one by one on the feed.
    const etps = [];
    for (const [isin, f] of Object.entries(firds.lines)) {
      if (liveShares.has(isin)) continue;
      // Deutsche Börse's typing wins: it catches the ETFs FIRDS files as CI
      // (Amundi MSCI World (2x) Leveraged, FR0014010HV4) and the ETN / ETC
      // debt lines.
      const known = dbType.get(isin);
      let type = "";
      // FIRDS files some ETNs and ETCs as E* (21Shares, WisdomTree).
      if (known === "ETN" || known === "ETC") type = known;
      else if (known === "ETF" && f.cfi.startsWith("C")) type = known;
      else if (f.cfi.startsWith("CE")) type = "ETF";
      if (type) etps.push({ isin, type, f });
    }
    const notations = await tradeRebelNotations(fg, etps.map((e) => e.isin), { fresh, log });
    const ids = etps.map((e) => notations[e.isin]).filter((n) => n?.active).map((n) => n.id);
    const prices = await latestPrices(fg, ids, log);
    const oldest = daysAgo(FRESH_DAYS);
    let live = 0;
    for (const { isin, type, f } of etps) {
      const n = notations[isin];
      if (!n) { stats.etps.noNotation++; continue; }
      if (!n.active) { stats.etps.inactive++; continue; }
      const last = prices.get(n.id) || "";
      if (!last || last < oldest) { stats.etps.noRecentPrice++; continue; }
      live++;
      candidates.push({ isin, type, mic: f.mic, symbol: n.symbol, wkn: "", feedName: "", firdsName: f.name, currency: n.currency || "EUR", group: "etps" });
    }
    if (live < LEAST.etps) throw new Error(`only ${live} live ETPs on TradeREBEL`);
  } finally {
    fg.close();
  }

  // Suspensions in force on the home market (Deutsche Börse's MiFID II list).
  const suspensions = await suspendedNow(new Set(candidates.map((c) => c.isin)), { log });
  const rows = [];
  for (const c of candidates) {
    const s = suspensions.get(c.isin);
    if (s && /Referenzmarkt/i.test(s.reason || "")) { stats[c.group].suspended++; continue; }
    stats[c.group].kept++;
    const code = dbCode.get(c.isin);
    const ticker = c.symbol || code?.mnemonic || c.isin;
    const wkn = c.wkn || code?.wkn || "";
    const exchangeName = c.feedName || c.firdsName;
    rows.push({
      query: ticker,
      ticker,
      name: names.get(c.isin) || exchangeName || c.isin,
      exchange: "TradeREBEL",
      mic: c.mic,
      currency: c.currency,
      type: c.type,
      isin: c.isin,
      wkn,
      raw: `${exchangeName} ${c.isin}${wkn ? ` ${wkn}` : ""} ${ticker} | TradeREBEL ${c.currency}`,
    });
  }
  tradeRebelBook.stats = stats;
  return rows;
}

// ---- CLI ------------------------------------------------------------------------------

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rows = await tradeRebelBook({ fresh: process.argv.includes("--fresh"), log: (m) => console.error(m) });
  const byType = {};
  const byCurrency = {};
  const byMic = {};
  for (const r of rows) {
    byType[r.type] = (byType[r.type] || 0) + 1;
    byCurrency[r.currency] = (byCurrency[r.currency] || 0) + 1;
    byMic[r.mic] = (byMic[r.mic] || 0) + 1;
  }
  console.log(JSON.stringify({ rows: rows.length, byType, byCurrency, byMic, stats: tradeRebelBook.stats }, null, 2));
}
