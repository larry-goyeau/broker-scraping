// The book of the Zagreb Stock Exchange (Zagrebačka burza, MIC XZAG), with
// no login, for the brokers whose whole catalogue is this exchange (Agram
// Brokeri in ./agrambrokeri). Every ZSE line trades in euro.
//
// zseListings() gives the shares and ETFs listed on ZSE's regulated market
// (Prime, Official and Regular segments). The list is the exchange's own
// securities register, the file behind its "Securities" page: symbol,
// ISIN, name, segment, trading model, class, type, listing and delisting
// dates of every line ever listed.
//
//   https://zse.hr/en/securities/26
//   https://rest.zse.hr/web/<public web key>/securities/XZAG/json
//
// Kept: class EQTY (ordinary and preference shares) and class ETF, with no
// delisting date or one still to come. Out: bonds, bills and municipal
// bonds (DEBT), turbo and index certificates (STRP), subscription rights
// (RGHT), and every delisted line. An issuer whose name says it is in
// liquidation ("u likvidaciji") or in bankruptcy ("u stečaju") is left out
// too, even when the exchange still lists it.
//
// Suspended lines stay out. The exchange keeps its suspensions on its
// disclosure site (EHO, "Obustave"): each decision is a temporary
// suspension with an end time ("Privremena suspenzija"), an open-ended one
// ("Suspenzija", "Na snazi do -"), or the lifting of one ("Ukidanje
// suspenzije"). The ISIN is on each decision's own page; those pages do
// not change, so their ISINs are kept in zse-suspension-isins.json next to
// this file and only new decisions are opened. For each ISIN the latest
// decision wins. A line the exchange's price list shows trading on its
// order book after the start of that decision is not suspended either
// (several ETF suspensions of 2023-2024 were lifted with no "Ukidanje"
// notice).
//
//   https://eho.zse.hr/obustave             (list, /obustave/list/<n>)
//   https://eho.zse.hr/obustave/view/<id>   (ISIN of the decision)
//
// Never-traded lines stay out: a line with no order-book trade in the
// exchange's price list ("-" as last trade date) is checked in its trading
// history since 2010, and dropped when it has no trade in a trading model
// other than OTC (block and OTC reports are not order-book trades).
//
//   https://zse.hr/json/TradingPriceList?...&mic=XZAG   (the "Price List" page)
//   https://rest.zse.hr/web/<key>/security-history/XZAG/<ISIN>/<from>/<to>/json
//
// The Progress Market (ZSE's MTF, MIC XZAP, https://progress.market) is not
// a regulated-market listing and gets no row, unless the broker's own pages
// say it trades there: zseListings({ progress: true }) adds its shares, with
// the same suspension and never-traded rules (its price list is not served,
// so every Progress line is checked in its trading history).
//
// Test: node -e 'import("./brokers/agrambrokeri/zseBook.mjs").then(async (m) => { const r = await m.zseListings(); console.log(r.rows.length, r.leftOut) })'

import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
export const ZSE = { exchange: "Zagreb Stock Exchange", mic: "XZAG", currency: "EUR" };
const PROGRESS_MIC = "XZAP";
const SEGMENTS = "RP,RO,RR,TJDD,UT,TZIF,RGHT,DMTF,FMTF,SS,MF,MA,MX,TEST";
const PRICE_LIST = `https://zse.hr/json/TradingPriceList?lng=EN&market_segment_ids=${SEGMENTS}&type=ALL&model=ALL&date=&only_traded=0&mic=XZAG`;
// The public key of ZSE's own web pages; the price list names the current one.
const REST_FALLBACK = "https://rest.zse.hr/web/Bvt9fe2peQ7pwpyYqODM/";
const EHO = "https://eho.zse.hr";
const CACHE = new URL("zse-suspension-isins.json", import.meta.url);
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
const PAUSE = 400;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(url, { json = false, missing = false } = {}) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
      if (response.ok) {
        const body = await response.text();
        await sleep(PAUSE);
        return json ? JSON.parse(body) : body;
      }
      if (missing && response.status === 404) {
        const body = await response.text();
        await sleep(PAUSE);
        if (/No data for Security/i.test(body)) return body;
      }
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await sleep(1000 * (attempt + 1));
  }
  throw new Error(last);
}

const decode = (value) =>
  String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&ndash;/g, "–")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

// "21.05.2025. 11:54:11" -> "2025-05-21T11:54:11" (Zagreb time, compared as text)
function stamp(value) {
  const m = String(value || "").match(/(\d{2})\.(\d{2})\.(\d{4})\.?(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return "";
  return `${m[3]}-${m[2]}-${m[1]}T${m[4] || "00"}:${m[5] || "00"}:${m[6] || "00"}`;
}

function zagrebNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Zagreb", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date()).map((p) => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

function readCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE, "utf8"));
  } catch {
    return {};
  }
}

// Every suspension decision on EHO, newest first, with its ISIN.
async function suspensionDecisions() {
  const decisions = [];
  for (let page = 1; page < 100; page += 1) {
    const html = await get(page === 1 ? `${EHO}/obustave` : `${EHO}/obustave/list/${page}`);
    const found = [...html.matchAll(/<tr><td><p class="mb-1">([\s\S]*?)<\/tr>/g)];
    for (const [, body] of found) {
      const id = body.match(/\/obustave\/view\/(\d+)/)?.[1];
      const kind = decode(body.match(/<span class="text-muted">([\s\S]*?)<\/span>/)?.[1]).replace(/^–\s*/, "");
      const published = stamp(body.match(/<\/i>\s*([\d. :]+)\s*<span/)?.[1]);
      const title = decode(body.match(/<h4[^>]*>([\s\S]*?)<\/h4>/)?.[1]);
      const cells = [...body.matchAll(/<\/td><td>([\s\S]*?)(?=<\/td>|$)/g)].map((cell) => decode(cell[1]));
      if (!id || !kind || !published) throw new Error(`unreadable EHO suspension line ${decode(body)}`);
      decisions.push({ id, kind, published, title, from: stamp(cells[0]), to: stamp(cells[1]) });
    }
    if (!found.length || !html.includes(`/obustave/list/${page + 1}"`)) break;
  }
  if (decisions.length < 100) throw new Error(`EHO listed only ${decisions.length} suspension decisions`);

  const cache = readCache();
  let opened = 0;
  for (const decision of decisions) {
    if (!cache[decision.id]) {
      const html = await get(`${EHO}/obustave/view/${decision.id}`);
      const text = decode(html);
      const isin = text.match(/Identifikator instrumenta\s+([A-Z]{2}[A-Z0-9]{9}\d)/)?.[1];
      if (!isin) throw new Error(`no ISIN on ${EHO}/obustave/view/${decision.id}`);
      cache[decision.id] = isin;
      opened += 1;
    }
    decision.isin = cache[decision.id];
  }
  if (opened) fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1) + "\n");
  return decisions;
}

// ISIN -> the decision that keeps the line suspended now, for lines whose
// latest decision is a suspension still in force.
function suspendedNow(decisions) {
  const now = zagrebNow();
  const latest = new Map();
  for (const decision of decisions) {
    const known = latest.get(decision.isin);
    if (!known || decision.published > known.published || (decision.published === known.published && Number(decision.id) > Number(known.id))) {
      latest.set(decision.isin, decision);
    }
  }
  const suspended = new Map();
  for (const [isin, decision] of latest) {
    if (/^Ukidanje/i.test(decision.kind)) continue;
    if (!/suspenzija/i.test(decision.kind)) throw new Error(`unread EHO decision kind ${decision.kind}`);
    if (decision.to && decision.to <= now) continue;
    suspended.set(isin, decision);
  }
  return suspended;
}

// "15:00:58" (traded on the price-list day) or "20.10.2026." or "-"
function lastTrade(row, day) {
  const value = String(row.prev_traded_date || "").trim();
  if (row.IsTraded || /^\d{2}:\d{2}/.test(value)) return day;
  const m = value.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

// The last order-book trade (any model but OTC) in the line's history, or "".
async function lastBookTrade(rest, mic, isin, today) {
  const url = `${rest}security-history/${mic}/${isin}/2010-01-01/${today}/json`;
  const response = await get(url, { missing: true });
  if (/^No data for Security/i.test(response.trim())) return "";
  const history = JSON.parse(response).history || [];
  return history
    .filter((day) => day.trading_model_id && day.trading_model_id !== "OTC" && Number(day.num_trades || 0) > 0)
    .map((day) => day.date)
    .sort()
    .pop() || "";
}

function typeOf(line) {
  if (line.security_class === "EQTY") return "STOCK";
  if (line.security_class === "ETF") return "ETF";
  return null;
}

function row(line, type, mic, note) {
  return {
    query: line.symbol,
    ticker: line.symbol,
    name: decode(line.name),
    exchange: ZSE.exchange,
    mic,
    currency: ZSE.currency,
    type,
    isin: line.isin,
    raw: [line.symbol, line.isin, decode(line.name), line.security_type, `segment ${line.segment}`, `model ${line.model}`, `listed ${line.segment_listing_date}`, note]
      .filter(Boolean)
      .join(" | "),
  };
}

export async function zseListings({ progress = false } = {}) {
  const leftOut = [];
  const priceList = await get(PRICE_LIST, { json: true });
  const rest = String(priceList.RestApi || REST_FALLBACK).replace(/\/?$/, "/");
  const day = priceList.market_data_date;
  const today = zagrebNow().slice(0, 10);
  const traded = new Map();
  for (const segment of priceList.priceList || []) {
    for (const line of segment.tradingPriceList?.rows || []) traded.set(line.isin, lastTrade(line, day));
  }
  if (traded.size < 60) throw new Error(`the ZSE price list of ${day} had ${traded.size} lines`);

  const suspended = suspendedNow(await suspensionDecisions());

  const books = [[ZSE.mic, await get(`${rest}securities/${ZSE.mic}/json`, { json: true })]];
  if (progress) books.push([PROGRESS_MIC, await get(`${rest}securities/${PROGRESS_MIC}/json`, { json: true })]);

  const rows = [];
  const seen = new Set();
  let listed = 0;
  for (const [mic, book] of books) {
    const lines = book.securities || [];
    if (mic === ZSE.mic && lines.length < 500) throw new Error(`the ZSE register had ${lines.length} lines`);
    for (const line of lines) {
      if (line.segment_delisting_date && line.segment_delisting_date <= today) continue;
      const type = typeOf(line);
      if (!type) continue;
      listed += 1;
      const tag = `${mic === ZSE.mic ? "" : `${mic} `}${line.symbol} ${line.isin}`;
      if (!ISIN.test(line.isin || "")) throw new Error(`unreadable ZSE line ${JSON.stringify(line)}`);
      if (/u\s+likvidaciji|u\s+ste[cč]aju/i.test(line.name)) {
        leftOut.push(`${tag} in liquidation or bankruptcy (${decode(line.name)})`);
        continue;
      }
      let last = mic === ZSE.mic ? traded.get(line.isin) ?? "" : "";
      if (!last) last = await lastBookTrade(rest, mic, line.isin, today);
      if (!last) {
        leftOut.push(`${tag} never traded on the order book`);
        continue;
      }
      const suspension = suspended.get(line.isin);
      if (suspension && last < suspension.from.slice(0, 10)) {
        leftOut.push(`${tag} suspended since ${suspension.from.slice(0, 10)} (${suspension.title})`);
        continue;
      }
      if (seen.has(line.isin)) continue;
      seen.add(line.isin);
      rows.push(row(line, type, mic, mic === PROGRESS_MIC ? "Progress Market" : ""));
    }
  }

  if (!rows.some((r) => r.ticker === "HT") || !rows.some((r) => r.type === "ETF")) {
    throw new Error("the ZSE list lost HT or every ETF");
  }
  rows.sort((left, right) => left.type.localeCompare(right.type) || left.ticker.localeCompare(right.ticker));
  return { rows, leftOut, listed, priceListDay: day, suspendedIsins: [...suspended.keys()] };
}
