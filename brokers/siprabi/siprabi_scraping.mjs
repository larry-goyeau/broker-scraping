// What Siprabi Securities sells in shares, with no login. Siprabi is
// NEPSE broker no. 22. Its clients order through the exchange's TMS, so
// the book is every security the Nepal Stock Exchange lets trade today.
// Siprabi's own search list (/api/mkt/stocks/choices) prints no type, keeps
// matured debentures and merged banks, and misses recent listings, so the
// exchange's list is read instead. Siprabi's list is still fetched as a
// check that both describe the same market.
//
// The exchange site signs its API calls in the browser, so a real Chrome
// opens it and the calls are made from inside the page. The company list
// gives the instrument type; promoter shares are only in the security
// list. The security record of each line gives the ISIN, the type, the
// status and whether trading is permitted. Kept: equity lines that are
// active and permitted to trade. They are ordinary shares, promoter shares
// (a separate line of the same company, on the same board) and perpetual
// preference shares, which are equity. Left out: suspended
// and delisted lines, lines not permitted to trade, debentures, and mutual
// funds, which are closed-end funds, not ETFs. Nepal lists no ETF.
// Everything trades in rupees. Also left out, though NEPSE still marks
// them active and permitted: lines with no ISIN (the record carries an
// exchange code such as N387PSDBLP instead), which are dead promoter lines
// of banks merged away or of suspended companies that never traded, and
// promoter lines whose company (the record's companyId) has no active,
// permitted public equity line left in the same security records.
//
//   https://www.siprabi.com/pages/services/brokerage   (equity tariff)
//   https://www.siprabi.com/api/mkt/stocks/choices
//   https://nepalstock.com.np/company
//   https://nepalstock.com.np/api/nots/company/list
//   https://nepalstock.com.np/api/nots/security?nonDelisted=true
//   https://nepalstock.com.np/api/nots/security/<id>
//
//   node brokers/siprabi/siprabi_scraping.mjs

import puppeteer from "puppeteer-core";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const NEPSE = "https://nepalstock.com.np";
const SIPRABI = "https://www.siprabi.com/api/mkt/stocks/choices";
const EXCHANGE = "Nepal Stock Exchange";

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

async function siprabiSymbols() {
  const response = await fetch(SIPRABI, { headers: { "user-agent": UA } });
  if (!response.ok) throw new Error(`${SIPRABI} answered ${response.status}`);
  const list = await response.json();
  if (!Array.isArray(list) || list.length < 400) throw new Error(`Siprabi listed ${list?.length ?? 0} securities`);
  return new Set(list.map((item) => clean(item?.[1]).toUpperCase()).filter(Boolean));
}

// The site answers HTTP/2 headless clients with a protocol error.
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--disable-gpu", "--disable-http2"] });

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
      for (let wait = 0; wait < 20 && !(header && body); wait += 1) await new Promise((resolve) => setTimeout(resolve, 500));
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
    for (let wait = 0; wait < 20 && !(got.companies && got.securities); wait += 1) await new Promise((resolve) => setTimeout(resolve, 500));
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
        async function worker() {
          while (index < pending.length && !expired) {
            const id = pending[index++];
            // An expired header answers 401; a busy server answers 503 or
            // drops the connection. Each ends the round, which is retried
            // after a pause with a fresh header.
            try {
              const response = await fetch(`/api/nots/security/${id}`, {
                method: "POST",
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
      records.set(id, JSON.parse(text)?.security);
    }
    stalls = records.size === before ? stalls + 1 : 0;
    if (records.size < ids.length) {
      await new Promise((resolve) => setTimeout(resolve, 2000 * (stalls + 1)));
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

let result;
try {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  const { companies, securities } = await listsFromCompanyPage(page);
  const records = await securityRecords(page, securities.map((line) => line.id));
  result = equityRows(companies, securities, records);
} finally {
  await browser.close();
}

const { rows, left } = result;
if (rows.length < 350) throw new Error(`only ${rows.length} NEPSE shares are open to trade`);
// Siprabi's list misses about a third of the promoter lines, so only the
// public shares are held to it.
const broker = await siprabiSymbols();
const publicRows = rows.filter((row) => row.raw.endsWith(" public"));
const unknown = publicRows.filter((row) => !broker.has(row.ticker));
if (unknown.length > publicRows.length * 0.1) throw new Error(`${unknown.length} NEPSE shares are not in Siprabi's list: ${unknown.map((row) => row.ticker).join(" ")}`);

rows.sort((a, b) => a.ticker.localeCompare(b.ticker));
fs.writeFileSync(new URL("siprabi-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
const promoters = rows.length - publicRows.length;
const leftOut = Object.entries(left).map(([reason, count]) => `${count} ${reason}`).join(", ");
console.error(`${rows.length} listings (${rows.length} STOCK, ${promoters} of them promoter shares) on ${EXCHANGE}; left out ${leftOut}; ${unknown.length} public shares not in Siprabi's search list`);
