// The whole German place, as the exchanges list it: every share, ETF, ETN
// and ETC that can be traded today on the German venues a broker routes to,
// one row per venue (and per trading currency on Xetra). Shared by the
// German banks whose catalogue is "Germany" (Volksbanken, Sparkassen,
// 1822direkt...): each scraper calls germanyBook() with the venues its own
// pages name, then applies its own exceptions.
//
// Sources
//   Börse Xetra (XETR) and Börse Frankfurt (XFRA): the Frankfurter
//   Wertpapierbörse's own lists of tradable instruments, one CSV per venue,
//   rebuilt every trading day:
//     https://www.cashmarket.deutsche-boerse.com/cash-en/trading/Tradable-Instruments-Xetra
//       -> t7-xetr-allTradableInstruments.csv
//     https://www.cashmarket.deutsche-boerse.com/cash-en/trading/Tradable-Instruments-Xetra/boersefrankfurt
//       -> t7-xfra-BF-allTradableInstruments.csv
//   Kept: Instrument Type CS (shares, ADRs, REITs), ETF, ETN, ETC. Left out:
//   BOND, WAR (warrants), OTHER and FUN (Frankfurt's open-ended investment
//   funds, which trade there but are not exchange-traded funds).
//   Tradegate (XGAT, with its regulated segment XGRM): Tradegate publishes no
//   instrument file, so its lines are the ones Tradegate Exchange reports to
//   ESMA's FIRDS register (the MiFIR reference data every EU venue files):
//     https://registers.esma.europa.eu/solr/esma_registers_firds/select
//   Latest record per line, status not "Terminated", no termination date
//   passed. CFI E* (shares, except EY structured participation products)
//   gives STOCK, CE* gives ETF. ETNs and ETCs are debt in the CFI scheme; a
//   Tradegate line is ETN or ETC when the Deutsche Börse lists type the same
//   ISIN so.
//
// What is left out
//   - Instrument Status other than Active: "Inactive" (trading stopped) and
//     "PendingDeletion" (being delisted) in the Deutsche Börse files.
//   - A Last Trading Date already passed, and a First Trading Date still to
//     come (never traded yet).
//   - Suspended lines. Deutsche Börse publishes every MiFID II suspension,
//     lifting and removal of FWB (Xetra and Frankfurt):
//       https://www.cashmarket.deutsche-boerse.com/cash-en/Stay-Informed/current-regulatory-topics/mifid-ii-releases
//     The list goes back to March 2021. When the latest event of an ISIN is a
//     suspension, its detail page gives the venues (XETR, XFRA) and the
//     "Effective to" time: most suspensions last minutes or days and are never
//     followed by a "lifting" entry. A suspension with no end, or an end still
//     to come, drops the line on the venues it names; on Tradegate when its
//     reason is the home market ("entsprechend Handhabung am Referenzmarkt"),
//     which Tradegate follows too. Removals are not used: the venue files drop
//     a removed line themselves, and the list does not say which venue a
//     removal was on. Events and details are cached in fwb-suspensions.json
//     next to this file; a call reads only the pages newer than the cache.
//   - Börse Berlin: its floor (XONTRO) closed on 1 January 2026.
//   - The regional floors (Stuttgart, München, gettex, Hamburg, Hannover,
//     Düsseldorf/Quotrix) and LS Exchange are not read here: they publish no
//     instrument file, and their FIRDS records are too large for the register's
//     search to answer reliably (gettex alone has about 200,000 equity records).
//
// Row: { query, ticker, name, exchange, mic, currency, type, isin, wkn, raw }
//   ticker / query: the Deutsche Börse short code (Mnemonic), which every German
//   venue shares; the ISIN when the line has none. name: the full name from
//   assets/stocks.csv or assets/etfs.csv for that ISIN, else the exchange's
//   name. currency: the line's trading currency (Xetra has USD, GBP, CHF...
//   lines; Frankfurt and Tradegate trade in euro only). exchange names are the
//   ones broker-list.json and spreads/venues.mjs use.
//
// Usage
//   import { germanyBook } from "../1822direkt/germanyBook.mjs";
//   const rows = await germanyBook({ venues: ["Xetra", "Frankfurt", "Tradegate"] });
//
//   node brokers/1822direkt/germanyBook.mjs                       counts, Xetra + Frankfurt
//   node brokers/1822direkt/germanyBook.mjs --venues=Xetra,Frankfurt,Tradegate
//   node brokers/1822direkt/germanyBook.mjs --fresh               ignore the day cache

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const DAY_CACHE = path.join(HERE, "germanyBook-cache.json");
const SUSPENSIONS = path.join(HERE, "fwb-suspensions.json");

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const DB = "https://www.cashmarket.deutsche-boerse.com";
const FIRDS = "https://registers.esma.europa.eu/solr/esma_registers_firds/select";
const SUSPENSION_LIST = `${DB}/cash-en/Stay-Informed/current-regulatory-topics/mifid-ii-releases/4086638!suspension-list`;
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

export const VENUES = {
  XETR: {
    exchange: "Börse Xetra",
    mic: "XETR",
    page: `${DB}/cash-en/trading/Tradable-Instruments-Xetra`,
    file: /href="([^"]*t7-xetr-[A-Za-z-]*allTradableInstruments\.csv)"/,
    least: 4000,
  },
  XFRA: {
    exchange: "Börse Frankfurt",
    mic: "XFRA",
    page: `${DB}/cash-en/trading/Tradable-Instruments-Xetra/boersefrankfurt`,
    file: /href="([^"]*t7-xfra-[A-Za-z-]*allTradableInstruments\.csv)"/,
    least: 10000,
  },
  XGAT: { exchange: "Tradegate", mic: "XGAT", firds: ["XGAT", "XGRM"], least: 5000 },
};

const ALIASES = {
  xetra: "XETR", xetr: "XETR", borsexetra: "XETR", boersexetra: "XETR",
  frankfurt: "XFRA", xfra: "XFRA", borsefrankfurt: "XFRA", boersefrankfurt: "XFRA", fwb: "XFRA",
  tradegate: "XGAT", xgat: "XGAT", tradegateexchange: "XGAT",
};

const TYPES = { CS: "STOCK", ETF: "ETF", ETN: "ETN", ETC: "ETC" };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const loose = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[^a-z]/g, "");
const berlinDay = (date = new Date()) => date.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });

async function get(url, { timeout = 30000, tries = 3, json = false } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA, accept: "*/*" }, signal: AbortSignal.timeout(timeout) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return json ? await res.json() : await res.text();
    } catch (error) {
      if (attempt >= tries) throw new Error(`${url}: ${error.message}`);
      await sleep(3000 * attempt);
    }
  }
}

function csvCells(line) {
  return [...line.matchAll(/("([^"]|"")*"|[^;]*)(;|$)/g)].map((m) => m[1].replace(/^"|"$/g, "").replace(/""/g, '"').trim()).slice(0, -1);
}

// ---- Deutsche Börse lists ---------------------------------------------------

async function deutscheBorseLines(venue, today) {
  const page = await get(venue.page);
  const link = page.match(venue.file)?.[1];
  if (!link) throw new Error(`${venue.page} no longer links its allTradableInstruments.csv`);
  const lines = (await get(new URL(link, venue.page).href, { timeout: 180000 })).split(/\r?\n/);
  const at = lines.findIndex((line) => line.startsWith("Product Status;"));
  if (at < 0) throw new Error(`${venue.mic}: header row not found`);
  const header = csvCells(lines[at]);
  const col = Object.fromEntries(
    ["Instrument Status", "Instrument", "ISIN", "WKN", "Mnemonic", "Instrument Type", "Currency", "Settlement Currency", "First Trading Date", "Last Trading Date"].map((name) => [name, header.indexOf(name)])
  );
  const missing = Object.entries(col).filter(([, index]) => index < 0).map(([name]) => name);
  if (missing.length) throw new Error(`${venue.mic}: columns missing (${missing.join(", ")})`);
  const out = [];
  const dropped = { status: 0, lastTradingDay: 0, notYetTrading: 0 };
  for (const line of lines.slice(at + 1)) {
    const c = csvCells(line);
    const type = TYPES[c[col["Instrument Type"]]];
    const isin = c[col.ISIN];
    if (!type || !ISIN.test(isin || "")) continue;
    if (c[col["Instrument Status"]] !== "Active") { dropped.status++; continue; }
    const last = c[col["Last Trading Date"]];
    if (last && last < today) { dropped.lastTradingDay++; continue; }
    const first = c[col["First Trading Date"]];
    if (first && first > today) { dropped.notYetTrading++; continue; }
    // Xetra trades some lines in USD, GBP...; Frankfurt's "Currency" column is
    // the share's own currency, the trading and settlement currency there is EUR.
    const currency = venue.mic === "XETR" ? c[col.Currency] : c[col["Settlement Currency"]];
    out.push({
      isin,
      wkn: c[col.WKN].replace(/^000/, ""),
      mnemonic: c[col.Mnemonic],
      exchangeName: c[col.Instrument].replace(/\s+/g, " "),
      type,
      currency,
      lastTradingDate: last || "",
    });
  }
  if (out.length < venue.least) throw new Error(`${venue.mic}: only ${out.length} share and ETP lines`);
  return { lines: out, dropped, source: new URL(link, venue.page).href };
}

// ---- Tradegate through FIRDS ------------------------------------------------

// Pages of 500 by offset, unsorted. A sorted query (sort=id with cursorMark,
// or sort=isin) runs past the register's 20-second gateway limit and answers
// 504 (seen 2026-10-25); the unsorted pages answer in 2-5 s. Offset paging
// could skip or repeat a line if the index moved mid-read, so the pages are
// de-duplicated on ISIN + MIC and the total must reach numFound.
async function firdsPages(query, fl) {
  const rows = 500;
  const seen = new Map();
  let found = Infinity;
  for (let start = 0; start < found; start += rows) {
    const url = `${FIRDS}?q=${encodeURIComponent(query)}&fq=latest_received_flag:1&fq=-status:TERM&fl=${fl}&wt=json&rows=${rows}&start=${start}`;
    const answer = await get(url, { timeout: 60000, tries: 4, json: true });
    found = answer.response.numFound;
    for (const doc of answer.response.docs) seen.set(`${doc.isin}|${doc.mic}`, doc);
    if (!answer.response.docs.length) break;
    await sleep(500);
  }
  if (seen.size < found * 0.99) throw new Error(`FIRDS paging read ${seen.size} of ${found} lines`);
  return [...seen.values()];
}

async function tradegateLines(venue, today, etp) {
  const mics = venue.firds.map((m) => `mic:${m}`).join(" OR ");
  const fl = "isin,mic,gnr_full_name,gnr_cfi_code,mrkt_trdng_trmination_date";
  const docs = await firdsPages(`(${mics}) AND (gnr_cfi_code:E* OR gnr_cfi_code:CE*)`, fl);
  // ETNs and ETCs are debt (CFI D*) and cannot be asked for as a class without
  // pulling every bond; they are asked for by the ISINs Deutsche Börse types so.
  const etpIsins = [...etp.keys()];
  for (let i = 0; i < etpIsins.length; i += 150) {
    const batch = etpIsins.slice(i, i + 150).join(" OR ");
    docs.push(...(await firdsPages(`(${mics}) AND isin:(${batch})`, fl)));
    await sleep(1000);
  }
  const out = new Map();
  for (const doc of docs) {
    const cfi = String(doc.gnr_cfi_code || "");
    const end = String(doc.mrkt_trdng_trmination_date || "").slice(0, 10);
    if (!ISIN.test(doc.isin || "") || (end && end < today)) continue;
    let type = "";
    if (etp.has(doc.isin)) type = etp.get(doc.isin);
    else if (cfi.startsWith("CE")) type = "ETF";
    else if (cfi.startsWith("E") && !cfi.startsWith("EY")) type = "STOCK";
    if (!type || out.has(doc.isin)) continue;
    out.set(doc.isin, { isin: doc.isin, wkn: "", mnemonic: "", exchangeName: String(doc.gnr_full_name || "").trim(), type, currency: "EUR", lastTradingDate: end });
  }
  if (out.size < venue.least) throw new Error(`Tradegate: FIRDS answered only ${out.size} lines`);
  return { lines: [...out.values()], dropped: {}, source: FIRDS };
}

// ---- FWB suspensions ----------------------------------------------------------

function parseSuspensionPage(html) {
  const events = [];
  for (const block of html.split('class="teasable-search-result-link').slice(1)) {
    const href = block.match(/href="([^"]*suspension-view[^"]*)"/)?.[1]?.replace(/&amp;/g, "&");
    const ts = Number(href?.match(/ts=(\d+)/)?.[1]);
    const isin = href?.match(/instrument=([A-Z0-9]{12})/)?.[1];
    const action = block.match(/search-result-tagline">\s*([^<]+?)\s*</)?.[1];
    if (ts && isin && action) events.push({ ts, isin, action, href });
  }
  return events;
}

const textOf = (html) =>
  html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, "|").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s*\|[\s|]*/g, " | ");

// The detail of one suspension: until when, on which FWB venues, and why.
// The list only says "suspension"; most are a few minutes or days long and are
// never followed by a "lifting" entry, their end is the "Effective to" field.
async function suspensionDetail(isin, ts, href) {
  if (!href) {
    const found = parseSuspensionPage(await get(`${SUSPENSION_LIST}?query=${isin}&hitsPerPage=50&sort=sDate%20desc`));
    href = found.find((e) => e.isin === isin && e.ts === ts)?.href;
    await sleep(400);
    if (!href) return null;
  }
  const text = textOf(await get(new URL(href, DB).href));
  const field = (label) => text.match(new RegExp(`${label}: \\| ([^|]*?) \\|`))?.[1]?.trim() || "";
  const to = field("Effective to");
  return {
    to: /^\d{4}-\d\d-\d\dT/.test(to) ? to : "",
    venues: field("Trading venue\\(s\\)").split(/[,\s]+/).filter(Boolean),
    reason: field("Reasons for the action"),
  };
}

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

// ISIN -> [action, ts] of its latest event. A missing cache means one full read
// of the list (about 2,500 pages of 50, an hour with the pauses); after that a
// call reads only the new pages.
export async function fwbSuspensions({ log = () => {} } = {}) {
  const cache = readJson(SUSPENSIONS);
  const known = cache?.complete ? cache : { complete: false, newest: cache?.newest || 0, latest: cache?.latest || {} };
  const latest = known.latest;
  let newest = known.newest;
  let reachedKnown = false;
  // An interrupted first read starts again a few pages before where it stopped
  // (new events push the older ones down the list).
  const start = known.complete ? 0 : Math.max(0, (cache?.page || 0) - 5);
  for (let page = start; ; page++) {
    const html = await get(`${SUSPENSION_LIST}?pageNum=${page}&hitsPerPage=50&sort=sDate%20desc`, { timeout: 30000, tries: 4 });
    const events = parseSuspensionPage(html);
    if (!events.length) break;
    for (const { ts, isin, action, href } of events) {
      if (ts > newest) newest = ts;
      const prev = latest[isin];
      if (!prev || ts > prev[1]) latest[isin] = [action, ts, href];
    }
    if (page % 100 === 99) {
      log(`  FWB suspensions: page ${page + 1}`);
      if (!known.complete) writeJson(SUSPENSIONS, { complete: false, page, newest, latest, details: cache?.details || {} });
    }
    if (known.complete && Math.min(...events.map((e) => e.ts)) <= known.newest) { reachedKnown = true; break; }
    await sleep(400);
  }
  if (known.complete && !reachedKnown) log("  FWB suspensions: the cache was older than the whole list");
  const data = { complete: true, newest, updated: new Date().toISOString(), latest, details: cache?.details || {} };
  writeJson(SUSPENSIONS, data);
  return data;
}

// ISIN -> { venues, reason, to } for the ISINs asked whose latest FWB event is
// a suspension still in force ("Effective to" empty or still to come).
// Removals are not used: the venue files drop a removed line themselves, and a
// removal on one FWB venue (the list does not say which) leaves the other.
export async function suspendedNow(isins, { log = () => {} } = {}) {
  const data = await fwbSuspensions({ log });
  const now = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Berlin" }).replace(" ", "T");
  const out = new Map();
  let fetched = 0;
  for (const isin of isins) {
    const [action, ts, href] = data.latest[isin] || [];
    if (action !== "suspension") continue;
    const key = `${isin}|${ts}`;
    if (!data.details[key]) {
      data.details[key] = (await suspensionDetail(isin, ts, href)) || { to: "", venues: [], reason: "detail not found" };
      if (++fetched % 50 === 0) {
        log(`  FWB suspension details: ${fetched}`);
        writeJson(SUSPENSIONS, data);
      }
      await sleep(400);
    }
    const detail = data.details[key];
    if (detail.reason === "detail not found") continue;
    if (!detail.to || detail.to > now) out.set(isin, detail);
  }
  if (fetched) writeJson(SUSPENSIONS, data);
  return out;
}

// ---- names --------------------------------------------------------------------

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

// ---- entry point -------------------------------------------------------------

export function venueCode(name) {
  const code = ALIASES[loose(name)];
  if (!code) throw new Error(`germanyBook: unknown venue "${name}" (known: Xetra, Frankfurt, Tradegate)`);
  return code;
}

export async function germanyBook({ venues = ["Xetra", "Frankfurt"], fresh = false, log = () => {} } = {}) {
  const wanted = [...new Set(venues.map(venueCode))];
  const today = berlinDay();
  const cached = !fresh ? readJson(DAY_CACHE) : null;
  const day = cached?.day === today ? cached : { day: today, venues: {} };

  // The Deutsche Börse lists are always read: Tradegate takes its ETN/ETC
  // typing and the short codes from them.
  for (const code of ["XETR", "XFRA", ...wanted.filter((c) => c === "XGAT")]) {
    if (day.venues[code]) continue;
    log(`  reading ${VENUES[code].exchange}`);
    if (code === "XGAT") {
      const etp = new Map();
      for (const c of ["XETR", "XFRA"]) for (const l of day.venues[c].lines) if (l.type === "ETN" || l.type === "ETC") etp.set(l.isin, l.type);
      day.venues[code] = await tradegateLines(VENUES[code], today, etp);
    } else {
      day.venues[code] = await deutscheBorseLines(VENUES[code], today);
    }
    writeJson(DAY_CACHE, day);
    await sleep(1000);
  }

  const isins = new Set(wanted.flatMap((code) => day.venues[code].lines.map((l) => l.isin)));
  const suspensions = await suspendedNow(isins, { log });
  const names = assetNames();
  const shortCode = new Map();
  for (const c of ["XETR", "XFRA"]) for (const l of day.venues[c].lines) if (l.mnemonic && !shortCode.has(l.isin)) shortCode.set(l.isin, { mnemonic: l.mnemonic, wkn: l.wkn });

  const rows = [];
  const seen = new Set();
  const stats = {};
  for (const code of wanted) {
    const venue = VENUES[code];
    const s = (stats[venue.exchange] = { kept: 0, suspended: 0, ...day.venues[code].dropped });
    for (const line of day.venues[code].lines) {
      // An FWB suspension holds on the venues it names. Tradegate follows one
      // that copies the home market ("entsprechend Handhabung am Referenzmarkt").
      const suspension = suspensions.get(line.isin);
      if (suspension && (suspension.venues.includes(venue.mic) || (code === "XGAT" && /Referenzmarkt/i.test(suspension.reason)))) {
        s.suspended++;
        continue;
      }
      const key = `${line.isin}|${venue.mic}|${line.currency}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const known = shortCode.get(line.isin);
      const ticker = line.mnemonic || known?.mnemonic || line.isin;
      const wkn = line.wkn || known?.wkn || "";
      s.kept++;
      rows.push({
        query: ticker,
        ticker,
        name: names.get(line.isin) || line.exchangeName,
        exchange: venue.exchange,
        mic: venue.mic,
        currency: line.currency,
        type: line.type,
        isin: line.isin,
        wkn,
        raw: `${line.exchangeName} ${line.isin}${wkn ? ` ${wkn}` : ""} ${ticker} | ${venue.exchange} ${line.currency}`,
      });
    }
  }
  germanyBook.stats = stats;
  return rows;
}

// ---- CLI ----------------------------------------------------------------------

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
  const venues = (arg("venues") || "Xetra,Frankfurt").split(",").map((v) => v.trim()).filter(Boolean);
  const rows = await germanyBook({ venues, fresh: process.argv.includes("--fresh"), log: (m) => console.error(m) });
  const count = {};
  for (const r of rows) {
    const k = `${r.exchange} ${r.currency}`;
    count[k] ??= {};
    count[k][r.type] = (count[k][r.type] || 0) + 1;
  }
  console.log(JSON.stringify({ rows: rows.length, byVenue: count, stats: germanyBook.stats }, null, 2));
}
