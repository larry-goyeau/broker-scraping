// The NEPSE share book, for the Nepal brokers whose site runs the same
// template as Siprabi (Kumari, Premier, Malla & Malla, Arya Tara). Their
// clients order through the exchange's TMS, so the book is every security
// the Nepal Stock Exchange lets trade today. The broker's own search list
// (/api/mkt/stocks/choices) prints no type, keeps matured debentures and
// merged banks, and misses recent listings, so the exchange's list is read
// instead, and the broker's list is fetched only as a check that both
// describe the same market. Same design as brokers/siprabi, whose scraper
// stays on its own.
//
// The exchange site signs its API calls in the browser, so a real Chrome
// opens it and the calls are made from inside the page. The company list
// gives the instrument type; promoter shares are only in the security
// list. The security record of each line gives the ISIN, the type, the
// status and whether trading is permitted. Kept: equity lines that are
// active and permitted to trade: ordinary shares, promoter shares (a
// separate line of the same company, on the same board) and perpetual
// preference shares, which are equity. Left out: suspended and delisted
// lines, lines not permitted to trade, debentures, and mutual funds, which
// are closed-end funds, not ETFs. Nepal lists no ETF. Everything trades in
// rupees. Also left out, though NEPSE still marks them active and
// permitted: lines with no ISIN (the record carries an exchange code such
// as N387PSDBLP instead), which are dead promoter lines of banks merged
// away or of suspended companies that never traded, and promoter lines
// whose company (the record's companyId) has no active, permitted public
// equity line left in the same security records.
//
// Promoter shares stay: they are listed and a client can order them on
// TMS (NEPSE on HIDCLP: "freely tradable through NOTS ... like other
// ordinary share", https://www.sharesansar.com/newsdetail/nepse-clarifies-that-promoter-shares-of-hydroelectricity-investment-and-development-company-hidclp-is-freely-traded-through-nots-2022-08-31).
// But the buyer of a bank's, financial institution's or insurer's
// promoter share is vetted by the regulator, which depends on the
// client, so writeNepseCatalogue puts a remark on those rows (by name:
// bank, bikas, laghubitta, bittiya, finance; insurance, beema):
//   - bank and financial institution: "Buyer needs to disclose source of
//     funds" and the transaction "must pass through scrutiny of NRB"
//     (https://www.sharesansar.com/newsdetail/why-the-huge-price-gap-between-ordinary-promoter-shares-of-nabil-and-nib-when-both-are-easily-tradable);
//     "a holder of 2% or less of a bank's paid-up capital no longer needs
//     NRB approval to buy or sell promoter shares", so more still does
//     (https://kharchapatra.com/blog/promoter-shares-vs-ordinary-shares-nepal);
//   - insurer: "To be eligible to purchase promoter shares, one must
//     qualify as per the Insurance Promoter Share Transaction Directive,
//     2077", issued by the Nepal Insurance Authority (Neco Insurance's
//     notice, https://nepsetrading.com/announcements/neco-insurance-notice-of-12-million-promoter-shares-sale?lang=en).
// Other promoter lines (HIDCLP, Citizen Investment Trust) carry none.
//
// The exchange crawl (about 500 signed calls) is kept in nepse-cache.json
// next to this file for 12 hours, so the four scrapers run back to back
// read NEPSE once.
//
//   https://nepalstock.com.np/company
//   https://nepalstock.com.np/api/nots/company/list
//   https://nepalstock.com.np/api/nots/security?nonDelisted=true
//   https://nepalstock.com.np/api/nots/security/<id>

import puppeteer from "puppeteer-core";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const NEPSE = "https://nepalstock.com.np";
export const EXCHANGE = "Nepal Stock Exchange";
const CACHE = new URL("nepse-cache.json", import.meta.url);
const CACHE_HOURS = 12;

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The broker's own search list: [id, symbol, name] triples.
export async function brokerSymbols(url, broker) {
  const response = await fetch(url, { headers: { "user-agent": UA } });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  const list = await response.json();
  if (!Array.isArray(list) || list.length < 400) throw new Error(`${broker} listed ${list?.length ?? 0} securities`);
  return new Set(list.map((item) => clean(item?.[1]).toUpperCase()).filter(Boolean));
}

// A signed header lives about a minute. Opening a security page makes the
// site sign a fresh one, and also shows the body its POST calls carry.
async function signedSession(page, securityId) {
  let header = "";
  let body = "";
  const watch = (request) => {
    if (/\/api\/nots\/security\/\d+$/.test(request.url())) {
      header = request.headers().authorization || "";
      body = request.postData() || "";
    }
  };
  page.on("request", watch);
  try {
    for (let attempt = 0; attempt < 4 && !(header && body); attempt += 1) {
      const opened = await page.goto(`${NEPSE}/company/detail/${securityId}`, { waitUntil: "networkidle2", timeout: 90_000 });
      if (!opened?.ok()) throw new Error(`NEPSE security page answered ${opened ? opened.status() : "nothing"}`);
      // The page can go quiet before it sends the signed call.
      for (let wait = 0; wait < 20 && !(header && body); wait += 1) await pause(500);
    }
  } finally {
    page.off("request", watch);
  }
  if (!header || !body) throw new Error("NEPSE security page made no signed call");
  return { header, body };
}

async function listsFromCompanyPage(page) {
  const wanted = {
    companies: /\/api\/nots\/company\/list$/,
    securities: /\/api\/nots\/security\?nonDelisted=true$/,
  };
  const got = {};
  const listen = async (response) => {
    for (const [key, pattern] of Object.entries(wanted)) {
      if (pattern.test(response.url()) && response.ok()) got[key] = await response.json().catch(() => null);
    }
  };
  page.on("response", listen);
  try {
    const opened = await page.goto(`${NEPSE}/company`, { waitUntil: "networkidle2", timeout: 90_000 });
    if (!opened?.ok()) throw new Error(`NEPSE company page answered ${opened ? opened.status() : "nothing"}`);
    for (let wait = 0; wait < 20 && !(got.companies && got.securities); wait += 1) await pause(500);
  } finally {
    page.off("response", listen);
  }
  if (!Array.isArray(got.companies) || got.companies.length < 500) throw new Error(`NEPSE company list has ${got.companies?.length ?? 0} lines`);
  if (!Array.isArray(got.securities) || got.securities.length < 450) throw new Error(`NEPSE security list has ${got.securities?.length ?? 0} lines`);
  return got;
}

async function securityRecords(page, ids) {
  let session = await signedSession(page, ids[0]);
  const records = new Map();
  let next = 0;
  let stalls = 0;
  while (records.size < ids.length && stalls < 5) {
    const before = records.size;
    const pending = ids.filter((id) => !records.has(id));
    const answers = await page.evaluate(
      async (pending, header, body) => {
        const out = [];
        let index = 0;
        let expired = false;
        // A header lives about a minute, so a round stops at 50 s.
        const stop = Date.now() + 50_000;
        async function worker() {
          while (index < pending.length && !expired && Date.now() < stop) {
            const id = pending[index++];
            // An expired header answers 401; a busy server answers 503 or
            // drops the connection. Each ends the round, which is retried
            // after a pause with a fresh header. A call that hangs is
            // dropped after 20 s the same way.
            try {
              const response = await fetch(`/api/nots/security/${id}`, {
                method: "POST",
                signal: AbortSignal.timeout(20_000),
                headers: { authorization: header, "content-type": "application/json", accept: "application/json, text/plain, */*" },
                body,
              });
              if (response.status === 401 || response.status === 429 || response.status >= 502) { expired = true; break; }
              out.push([id, response.status, await response.text()]);
            } catch {
              expired = true;
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 150));
          }
        }
        await Promise.all(Array.from({ length: 2 }, worker));
        return out;
      },
      pending, session.header, session.body,
    );
    for (const [id, status, text] of answers) {
      if (status !== 200) throw new Error(`NEPSE security ${id} answered ${status}: ${text.slice(0, 120)}`);
      const record = JSON.parse(text)?.security;
      if (!record) throw new Error(`NEPSE security ${id} answered no record: ${text.slice(0, 120)}`);
      records.set(id, record);
    }
    stalls = records.size === before ? stalls + 1 : 0;
    console.error(`NEPSE: ${records.size} of ${ids.length} security records`);
    if (records.size < ids.length) {
      await pause(2000 * (stalls + 1));
      session = await signedSession(page, ids[next++ % ids.length]);
    }
  }
  if (records.size < ids.length) throw new Error(`NEPSE gave ${records.size} of ${ids.length} security records`);
  return records;
}

function equityRows(companies, securities, records) {
  const typeOf = new Map(companies.map((line) => [clean(line.symbol).toUpperCase(), clean(line.instrumentType)]));
  const rows = [];
  const left = {};
  const seen = new Set();
  // Companies with an active, permitted public equity line of their own.
  const openCompanies = new Set();
  for (const line of securities) {
    const record = records.get(line.id);
    if (record?.isPromoter === "Y" || clean(record?.instrumentType?.description) !== "Equity") continue;
    if (record.activeStatus !== "A" || record.permittedToTrade !== "Y") continue;
    if (record.companyId?.id == null) throw new Error(`${record.symbol} record has no companyId`);
    openCompanies.add(record.companyId.id);
  }
  if (openCompanies.size < 250) throw new Error(`only ${openCompanies.size} NEPSE companies have an open public share`);
  for (const line of securities) {
    const record = records.get(line.id);
    if (!record || record.id !== line.id) throw new Error(`no NEPSE record for ${line.symbol}`);
    const ticker = clean(record.symbol).toUpperCase();
    const name = clean(record.securityName);
    const kind = clean(record.instrumentType?.description);
    const promoter = record.isPromoter === "Y";
    // A promoter line is not in the company list; every other line must agree with it.
    if (!promoter && typeOf.get(ticker) !== kind) throw new Error(`${ticker} is ${kind} in its record, ${typeOf.get(ticker)} in the company list`);
    // A line with no ISIN carries an exchange code such as N387PSDBLP.
    const code = clean(record.isin).toUpperCase();
    const noIsin = new RegExp(`^N\\d+${ticker}$`).test(code);
    const company = record.companyId?.id;
    if (promoter && company == null) throw new Error(`${ticker} record has no companyId`);
    const reason =
      kind !== "Equity" && kind !== "Preference Shares" ? kind
      : record.activeStatus !== "A" ? `status ${record.activeStatus}`
      : record.permittedToTrade !== "Y" ? "not permitted to trade"
      : noIsin ? "no ISIN (legacy line)"
      : promoter && !openCompanies.has(company) ? "promoter line of a company with no open public share"
      : "";
    if (reason) {
      left[reason] = (left[reason] || 0) + 1;
      continue;
    }
    const isin = code;
    if (!ticker || !name) throw new Error(`unreadable NEPSE line ${JSON.stringify(line)}`);
    if (!/^NP[A-Z0-9]{10}$/.test(isin)) throw new Error(`${ticker} has ISIN ${isin}`);
    if (seen.has(ticker) || seen.has(isin)) throw new Error(`repeated ${ticker} ${isin}`);
    seen.add(ticker);
    seen.add(isin);
    rows.push({
      query: ticker,
      ticker,
      name,
      exchange: EXCHANGE,
      currency: "NPR",
      type: "STOCK",
      isin,
      mic: "XNEP",
      raw: [ticker, name, EXCHANGE, isin, kind, promoter ? "promoter" : "public"].filter(Boolean).join(" "),
    });
  }
  return { rows, left };
}

function cached() {
  try {
    const kept = JSON.parse(fs.readFileSync(CACHE, "utf8"));
    if (Date.now() - Date.parse(kept.fetchedAt) < CACHE_HOURS * 3600_000 && Array.isArray(kept.rows)) return kept;
  } catch {
    // no cache, or an unreadable one: crawl again
  }
  return null;
}

// Every NEPSE equity line open to trade, sorted by ticker.
export async function nepseShares() {
  const kept = cached();
  if (kept) return { rows: kept.rows, left: kept.left, fetchedAt: kept.fetchedAt, fromCache: true };
  // The site answers HTTP/2 headless clients with a protocol error.
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--disable-gpu", "--disable-http2"], protocolTimeout: 300_000 });
  let result;
  try {
    const page = await browser.newPage();
    await page.setUserAgent(UA);
    // The page signs the body of a security call with the day; on a clock
    // that is not Nepal's, the day differs around midnight there and NEPSE
    // answers [] to every security call, the page's own included.
    await page.emulateTimezone("Asia/Kathmandu");
    const { companies, securities } = await listsFromCompanyPage(page);
    const records = await securityRecords(page, securities.map((line) => line.id));
    result = equityRows(companies, securities, records);
  } finally {
    await browser.close();
  }
  if (result.rows.length < 350) throw new Error(`only ${result.rows.length} NEPSE shares are open to trade`);
  result.rows.sort((a, b) => a.ticker.localeCompare(b.ticker));
  const fetchedAt = new Date().toISOString();
  fs.writeFileSync(CACHE, JSON.stringify({ fetchedAt, ...result }));
  return { ...result, fetchedAt, fromCache: false };
}

// The remark of a promoter row whose buyer the regulator vets (header).
const INSURER = /\b(insurance|insurace|reinsurance|beema)\b/i;
const BFI = /\b(bank|bikas|bikash|laghu ?bitta|lagubitta|bittiya|bittya|finance|microfinance)\b/i;
export function promoterRemark(row) {
  if (!String(row.raw || "").endsWith(" promoter")) return "";
  if (INSURER.test(row.name)) return "Insurer promoter share: the buyer must qualify under the Nepal Insurance Authority's promoter share directive (2077).";
  if (BFI.test(row.name)) return "Bank or financial institution promoter share: source-of-funds disclosure and NRB scrutiny; NRB approval above 2% of paid-up capital.";
  return "";
}

const promoterCount = (rows) => rows.filter((row) => String(row.raw || "").endsWith(" promoter")).length;

// Writes <folder>-parsed.json for one broker: the NEPSE book, held to the
// broker's own list. The broker's list misses about a third of the
// promoter lines, so only the public shares are held to it.
export async function writeNepseCatalogue({ broker, listUrl, out }) {
  const { rows, left, fromCache } = await nepseShares();
  const known = await brokerSymbols(listUrl, broker);
  const publicRows = rows.filter((row) => row.raw.endsWith(" public"));
  const unknown = publicRows.filter((row) => !known.has(row.ticker));
  if (unknown.length > publicRows.length * 0.1) throw new Error(`${unknown.length} NEPSE shares are not in the list of ${broker}: ${unknown.map((row) => row.ticker).join(" ")}`);
  const stamped = stampRows(withoutObligations(rows.map((row) => ({ ...row }))));
  let remarked = 0;
  for (const row of stamped) {
    const remark = promoterRemark(row);
    if (!remark) continue;
    row.remark = remark;
    remarked += 1;
  }
  if (promoterCount(stamped) - remarked > 10) throw new Error(`${promoterCount(stamped) - remarked} promoter lines are neither a bank nor an insurer`);
  fs.writeFileSync(out, JSON.stringify(stamped, null, 2));
  const promoters = rows.length - publicRows.length;
  const leftOut = Object.entries(left).map(([reason, count]) => `${count} ${reason}`).join(", ");
  console.error(
    `${stamped.length} listings (${stamped.length} STOCK, ${promoters} of them promoter shares) on ${EXCHANGE}` +
      `${fromCache ? " (NEPSE read from nepse-cache.json)" : ""}; ${remarked} promoter shares remarked (bank or insurer); left out ${leftOut}; ` +
      `${unknown.length} public shares not in the search list of ${broker}${unknown.length ? `: ${unknown.map((row) => row.ticker).join(" ")}` : ""}`,
  );
  return stamped;
}
