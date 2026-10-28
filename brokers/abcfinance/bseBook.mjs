// The Bulgarian Stock Exchange book, for the Bulgarian brokers whose
// catalogue is the whole exchange (ABC Finance, IP Favorit). Every share
// and exchange-traded fund unit listed on the BSE in Sofia, read from the
// exchange's own open data feed, minus the lines that cannot be bought
// today. Same feed as ../ugmarket, whose scraper stays on its own.
//
// Lists (POST https://www.bse-sofia.bg/en/dashboard/dispatcher/):
//   instrumentbysegment  every table of the Main Market (Premium, Standard,
//                        EuroBridge, Special Purpose Vehicles, Exchange
//                        Traded Products ...) and of the BaSE alternative
//                        market, with code, name and CFI
//                        https://www.bse-sofia.bg/en/listed-instruments
//   beamcompany          the "beam Equities" table of the SME growth market
//                        BEAM (same T7 system, same trading rules)
//                        https://www.bse-sofia.bg/en/beam-company
//   mtfintcompany        MTF BSE International (foreign shares, ETFs, ETCs
//                        and ETNs on the BSE's own book under their Xetra
//                        codes), read only when asked: { international: true }
//                        https://www.bse-sofia.bg/en/mtf-international-company
//   profilmarketinfo     each code's issue card: ISIN, security type,
//                        trading currency
//   profilhistory        each code's daily history over the last year
//                        (the issuer profile chart), with the volume
//
// Kept: shares (CFI ES.., EP..: REITs/SPVs and preference shares too) as
// STOCK, and fund units of the Exchange Traded Products segment (CFI CE..,
// CI..: the Expat index ETFs, Expat Gold, the listed national investment
// funds, which trade on the book like an ETF) as ETF. Left out: bonds,
// government securities, compensatory instruments, warrants (CFI RW.., on
// the ETP segment), rights.
//
// Removed, with the reason in `dropped`:
//   in liquidation   the BSE name says "/in liquidation/", "/in bankruptcy/"
//                    or "/in insolvency/".
//   suspended        the BSE's "Trading Suspensions & Removals" notices of
//                    the last 400 days (news subjects 15 "Suspension from
//                    trading of registered financial instruments" and 16
//                    "Delisting of financial instruments"): the latest
//                    notice for the line's ISIN is a Suspension still in
//                    force (no end, or an end not reached), and the line has
//                    not traded since it began. A Lifting notice, or a trade
//                    after the start, ends it.
//                    https://www.bse-sofia.bg/en/news (subject 15)
//   delisted         the latest notice is a Removal already in force while
//                    the list still shows the line.
//   no trade         no trading day with volume in the year of history the
//                    BSE prints. This catches the suspensions older than the
//                    notices read, dormant lines and new lines never traded
//                    (as ../comafi/byma.mjs drops BYMA lines with no trade in
//                    its two years of history). { keepIdle: true } keeps them.
// BSE International lines are kept as listed (Tradegate quotes the book as
// market maker); only their type and currency come from the issue card.
//
// Currency: the line's trading currency (EUR for every line since the euro
// replaced the lev on 1 January 2026). Place: "Bulgarian Stock Exchange",
// XBUL, for Main Market, BaSE and BEAM lines (one exchange, one T7 book);
// "BSE International", XBUL, for the MTF lines, as in ../ugmarket and
// ../benchmark.
//
// The crawl (about 60 feed calls and up to 200 notices) is kept for 12
// hours in the system temp folder, so the scrapers run back to back read
// the BSE once; notices already read are kept for later runs.
//
//   import { writeBseCatalogue } from "../abcfinance/bseBook.mjs";
//   await writeBseCatalogue(import.meta.url, "<folder>-parsed.json");

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const SITE = "https://www.bse-sofia.bg";
const DISPATCHER = `${SITE}/en/dashboard/dispatcher/`;
const NEWS = `${SITE}/en/Content/news/`;
const NOTICE = `${SITE}/en/get/news/id/`;
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
const CACHE = path.join(os.tmpdir(), "bse-book-cache.json");
const CACHE_HOURS = 12;
const NOTICE_DAYS = 400;
// News subjects: 15 suspensions, 16 delistings.
const SUBJECTS = [15, 16];
// Security type on a BSE International issue card -> our type.
const MTF_TYPES = { shares: "STOCK", units: "ETF", "exchange traded commodities": "ETC", "exchange traded notes": "ETN" };
const LIQUIDATION = /\/\s*in (liquidation|bankruptcy|insolvency)\s*\//i;

export const EXCHANGE = "Bulgarian Stock Exchange";
export const INTERNATIONAL = "BSE International";
export const MIC = "XBUL";

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
// "AGH#link:issuer-profile/AGH/" -> "AGH"
const label = (value) => clean(String(value ?? "").split("#link:")[0]);
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

async function request(url, options = {}) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: { "User-Agent": UA, "X-Requested-With": "XMLHttpRequest", ...(options.headers || {}) },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return await response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await pause(1500 * (attempt + 1));
  }
  throw new Error(last);
}

// One POST to the BSE's data feed with several streams: [[key, params]].
async function dispatch(streams) {
  const body = new URLSearchParams();
  const ids = [];
  streams.forEach(([key, parameters], index) => {
    const id = String(index + 1);
    ids.push(id);
    for (const [name, value] of Object.entries(parameters)) body.set(`${key}_${id}[parameters][${name}]`, value);
    body.set(`${key}_${id}[frequency]`, "0");
  });
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const text = await request(DISPATCHER, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
      body,
    });
    try {
      const payload = JSON.parse(text);
      if (ids.every((id) => payload?.[id]?.result)) return ids.map((id) => payload[id].result);
      last = `the BSE feed answered ${Object.keys(payload || {}).length} of ${ids.length} streams`;
    } catch {
      last = "the BSE feed answered no JSON";
    }
    await pause(1500 * (attempt + 1));
  }
  throw new Error(last);
}

function tableRows(table) {
  const names = table.names || [];
  return (table.data || []).map((line) => Object.fromEntries(names.map((name, index) => [name, line[index]])));
}

// "21.04.2026 14:46:50" -> ms
function bgTime(text) {
  const match = clean(text).match(/^(\d{2})\.(\d{2})\.(\d{4})(?: (\d{2}):(\d{2}):(\d{2}))?/);
  if (!match) return NaN;
  const [, day, month, year, hour = "00", minute = "00", second = "00"] = match;
  return Date.parse(`${year}-${month}-${day}T${hour}:${minute}:${second}+02:00`);
}

// A "Trading Suspensions & Removals" notice as { action, isin, from, to, at }.
function structured(notice) {
  const text = String(notice.TEXT || "");
  if (!/Trading Suspensions\s*&\s*Removals/i.test(text)) return null;
  const fields = {};
  for (const line of text.split(/\r?\n/)) {
    const [key, ...rest] = line.split("\t");
    if (key && rest.length) fields[clean(key).toLowerCase()] = clean(rest.join(" "));
  }
  const isin = clean(fields["instrument identifier"]).toUpperCase();
  const action = clean(fields["action type"]).toLowerCase();
  if (!ISIN.test(isin) || !action) return null;
  const time = (value) => (clean(value) ? Date.parse(clean(value).replace(".Z", "Z")) : NaN);
  return {
    action,
    isin,
    reason: clean(fields["reasons for the action"]),
    from: time(fields["effective from"]),
    to: time(fields["effective to"]),
    at: time(fields["date and time of the publication / communication"]) || bgTime(notice.NOLABEL_DATE),
    code: clean(notice.SECNUM).toUpperCase(),
  };
}

function readCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE, "utf8"));
  } catch {
    return {};
  }
}

// The notice list of one subject over the window: [{ id, company, date }].
async function noticeList(subject, from, to) {
  const found = new Map();
  let pages = 1;
  for (let sheet = 1; sheet <= pages; sheet += 1) {
    const html = await request(`${NEWS}?from=${from}&to=${to}&subject=${subject}&code=&key=&sheet=${sheet}`);
    const all = html.match(/class="all-pages">(\d+)/);
    if (!all) throw new Error(`no page count on the BSE news list, subject ${subject}`);
    pages = Number(all[1]);
    for (const match of html.matchAll(/href="\/news\/id\/(\d+)"[^>]*>[^<]*<\/a>\s*<div>([^<]*)<\/div>\s*<div class="newsTime">([^<]*)/g)) {
      found.set(match[1], { id: match[1], company: clean(match[2]), date: clean(match[3]) });
    }
    await pause(500);
  }
  return [...found.values()];
}

async function crawl() {
  const cache = readCache();
  if (cache.at && Date.now() - cache.at < CACHE_HOURS * 3_600_000 && cache.lists) return cache;
  const notices = cache.notices || {};

  const [segments] = await dispatch([["instrumentbysegment", { language: "en" }]]);
  await pause(400);
  const [beam] = await dispatch([["beamcompany", { language: "en", segment: "trades" }]]);
  await pause(400);
  const [international] = await dispatch([["mtfintcompany", { language: "en", segment: "trades" }]]);
  await pause(400);

  const lists = [];
  for (const table of [...(segments.tables || []), ...(beam.tables || [])]) {
    const segment = clean(table.table_name).replace(/^beam /i, "BEAM ");
    for (const line of tableRows(table)) {
      lists.push({ code: label(line.code).toUpperCase(), name: label(line.name), isin: clean(line.isin).toUpperCase(), cfi: clean(line.cfi).toUpperCase(), currency: clean(line.currency).toUpperCase(), segment, international: false });
    }
  }
  for (const table of international.tables || []) {
    for (const line of tableRows(table)) {
      lists.push({ code: label(line.code).toUpperCase(), name: label(line.name), isin: clean(line.isin).toUpperCase(), cfi: clean(line.cfi).toUpperCase(), currency: "", segment: clean(table.table_name), international: true });
    }
  }

  // Issue cards: every equity or fund line (all BSE International lines).
  const wanted = lists.filter((line) => line.international || /^(E[SP]|C[EI])/.test(line.cfi)).map((line) => line.code);
  const cards = {};
  for (let start = 0; start < wanted.length; start += 20) {
    const batch = wanted.slice(start, start + 20);
    const results = await dispatch(batch.map((code) => ["profilmarketinfo", { language: "en", code }]));
    batch.forEach((code, index) => {
      cards[code] = Object.fromEntries((results[index].data || []).map(([title, text]) => [clean(title), clean(text)]));
    });
    await pause(400);
  }

  // A year of daily history for each domestic equity or fund line.
  const domestic = lists.filter((line) => !line.international && /^(E[SP]|C[EI])/.test(line.cfi)).map((line) => line.code);
  const histories = {};
  for (let start = 0; start < domestic.length; start += 10) {
    const batch = domestic.slice(start, start + 10);
    const results = await dispatch(batch.map((code) => ["profilhistory", { code: code.toLowerCase() }]));
    batch.forEach((code, index) => {
      const names = results[index].names || [];
      const volume = names.indexOf("volume");
      const data = results[index].data || [];
      if (volume < 0 || !data.length) {
        histories[code] = null;
        return;
      }
      const traded = data.filter((point) => Number(point[volume]) > 0).map((point) => point[0] * 1000);
      histories[code] = { first: data[0][0] * 1000, last: data[data.length - 1][0] * 1000, days: traded.length, lastTrade: traded.length ? Math.max(...traded) : 0 };
    });
    await pause(400);
  }

  // Suspension and delisting notices of the window. The government
  // securities of the Ministry of Finance are not read.
  const to = isoDay(Date.now());
  const from = isoDay(Date.now() - NOTICE_DAYS * 86_400_000);
  for (const subject of SUBJECTS) {
    for (const item of await noticeList(subject, from, to)) {
      if (notices[item.id] || /^Ministry of Finance$/i.test(item.company)) continue;
      const text = await request(`${NOTICE}${item.id}`, { headers: { Accept: "application/json; charset=utf-8" } });
      try {
        const body = JSON.parse(text);
        notices[item.id] = { TEXT: body.TEXT, SUBJECT_ID: body.SUBJECT_ID, SECNUM: body.SECNUM, NOLABEL_DATE: body.NOLABEL_DATE };
      } catch {
        throw new Error(`notice ${item.id} is not JSON`);
      }
      await pause(400);
    }
  }

  const book = { at: Date.now(), lists, cards, histories, notices };
  try {
    fs.writeFileSync(CACHE, JSON.stringify(book));
  } catch {}
  return book;
}

// The BSE book as catalogue rows, plus the lines left out with a reason.
// { international: true } adds the MTF BSE International lines;
// { keepIdle: true } keeps the lines with no trade in the last year.
export async function bseBook({ international = false, keepIdle = false } = {}) {
  const { lists, cards, histories, notices } = await crawl();
  const now = Date.now();

  // Latest structured notice per ISIN.
  const latest = new Map();
  for (const notice of Object.values(notices)) {
    const entry = structured(notice);
    if (!entry) continue;
    const before = latest.get(entry.isin);
    if (!before || entry.at > before.at) latest.set(entry.isin, entry);
  }

  const rows = [];
  const dropped = [];
  const seen = new Set();
  for (const line of lists) {
    if (line.international && !international) continue;
    const card = cards[line.code];
    const kind = clean(card?.["Security Type"]).toLowerCase();
    let type = "";
    let currency = line.currency;
    if (line.international) {
      if (!card) throw new Error(`no issue card for ${line.code}`);
      type = MTF_TYPES[kind] || "";
      currency = clean(card["Trading currency"]).toUpperCase();
      if (!type) {
        dropped.push({ ticker: line.code, isin: line.isin, name: line.name, reason: kind || "no type" });
        continue;
      }
    } else {
      if (/^E[SP]/.test(line.cfi)) type = "STOCK";
      else if (/^C[EI]/.test(line.cfi)) type = "ETF";
      else continue; // bonds, government securities, compensatory instruments, warrants
      if (card && kind && !/^(shares|units|preferred shares|preference shares)$/.test(kind)) {
        dropped.push({ ticker: line.code, isin: line.isin, name: line.name, reason: kind });
        continue;
      }
      if (card?.["Trading currency"] && clean(card["Trading currency"]).toUpperCase() !== currency) {
        throw new Error(`${line.code} is ${currency} in the list and ${card["Trading currency"]} on its card`);
      }
    }
    const fromCard = clean(card?.["ISIN Code"]).toUpperCase();
    const isin = ISIN.test(line.isin) ? line.isin : fromCard;
    if (ISIN.test(line.isin) && ISIN.test(fromCard) && fromCard !== line.isin) throw new Error(`${line.code} has two ISINs`);
    const key = `${line.international ? "intl" : "main"}|${line.code}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const leave = (reason) => dropped.push({ ticker: line.code, isin, name: line.name, reason });

    if (!line.international) {
      if (LIQUIDATION.test(line.name)) {
        leave(line.name.match(LIQUIDATION)[0].replace(/\//g, "").trim());
        continue;
      }
      const history = histories[line.code];
      const notice = ISIN.test(isin) ? latest.get(isin) : null;
      if (notice?.action === "removal" && notice.from <= now) {
        leave(`delisted ${isoDay(notice.from)} (${notice.reason})`);
        continue;
      }
      if (notice?.action === "suspension" && !(notice.to > 0 && notice.to <= now)) {
        const tradedSince = history?.lastTrade && history.lastTrade >= notice.from - 86_400_000;
        if (!tradedSince) {
          leave(`suspended since ${isoDay(notice.from)} (${notice.reason})`);
          continue;
        }
      }
      if (history && history.days === 0 && !keepIdle) {
        leave(`no trade from ${isoDay(history.first)} to ${isoDay(history.last)}`);
        continue;
      }
    }

    rows.push({
      query: line.code,
      ticker: line.code,
      name: line.name,
      exchange: line.international ? INTERNATIONAL : EXCHANGE,
      mic: MIC,
      currency: currency || "EUR",
      type,
      isin: ISIN.test(isin) ? isin : "",
      raw: [line.code, line.name, line.segment, line.cfi, kind, currency].filter(Boolean).join(" | "),
    });
  }

  for (const [ticker, type, isin] of [
    ["AGH", "STOCK", "BG1100085072"],
    ["BSE", "STOCK", "BG1100016978"],
    ["BGX", "ETF", "BG9000011163"],
  ]) {
    const found = rows.find((row) => row.ticker === ticker && row.exchange === EXCHANGE);
    if (!found || found.type !== type || found.isin !== isin) throw new Error(`${ticker} was ${JSON.stringify(found)}`);
  }
  if (!rows.some((row) => /^BEAM/.test(row.raw.split(" | ")[2] || ""))) throw new Error("no BEAM equities");
  if (rows.some((row) => row.ticker === "ADVE")) throw new Error("ADVE is in liquidation and was kept");
  const shares = rows.filter((row) => row.exchange === EXCHANGE && row.type === "STOCK").length;
  if (shares < 120) throw new Error(`only ${shares} BSE shares`);
  if (international && rows.filter((row) => row.exchange === INTERNATIONAL).length < 200) throw new Error("BSE International is short");
  const blank = rows.filter((row) => !row.isin).map((row) => row.ticker);
  if (blank.length) throw new Error(`no ISIN for ${blank.join(" ")}`);
  if (rows.some((row) => row.currency !== "EUR")) throw new Error(`a line is not in EUR: ${rows.filter((row) => row.currency !== "EUR").map((row) => `${row.ticker} ${row.currency}`).join(", ")}`);

  rows.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.type.localeCompare(right.type) || left.ticker.localeCompare(right.ticker));
  return { rows, dropped };
}

// Writes <file> next to the calling scraper (`here` is its import.meta.url)
// and prints the counts. `types` keeps only those row types.
export async function writeBseCatalogue(here, file, { international = false, keepIdle = false, types = ["STOCK", "ETF", "ETN", "ETC"] } = {}) {
  const { rows, dropped } = await bseBook({ international, keepIdle });
  const kept = stampRows(withoutObligations(rows.filter((row) => types.includes(row.type))));
  fs.writeFileSync(new URL(file, here), JSON.stringify(kept, null, 2));
  const counts = {};
  for (const row of kept) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
  console.error(counts);
  console.error(`${kept.length} rows; left out ${dropped.length}: ${dropped.map((line) => `${line.ticker} ${line.reason}`).join("; ") || "none"}`);
  return kept;
}
