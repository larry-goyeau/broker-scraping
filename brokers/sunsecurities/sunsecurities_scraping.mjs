// What Sun Securities (Kathmandu, NEPSE broker) sells in shares, with no
// login. The broker trades "ordinary and promoter shares of all
// NEPSE-listed companies", debentures and listed mutual fund units. Its
// clients order through the exchange's TMS, so the book is every security
// the Nepal Stock Exchange lets trade today.
//
// Sun's own security list (the search box and the sitemap) is stale: it
// keeps promoter lines of banks merged years ago (ACEDPO, ACE Development
// Bank, gone since 2015) and companies absorbed since, and it misses recent
// promoter listings. So the exchange's list is read, and Sun's list, its
// sitemap and its live board are only checks that both describe the same
// market.
//
// The exchange site signs its API calls in the browser, so a real Chrome
// opens it and the calls are made from inside the page. The company list
// gives the instrument type; promoter shares are only in the security
// list. The security record of each line gives the ISIN, the type, the
// status and whether trading is permitted. Kept: equity lines that are
// active and permitted to trade: ordinary shares, promoter shares (a
// separate line of the same company) and perpetual preference shares.
// Left out: suspended and delisted lines, lines not permitted to trade,
// debentures (bonds), and mutual funds, which are closed-end funds, not
// ETFs. Nepal lists no ETF. Everything trades in rupees on the one
// exchange. A few promoter lines have no ISIN yet and are written without
// one.
//
//   https://sunsecurities.com/services/securities-trading
//   https://sunsecurities.com/fees   (SEBON commission schedule)
//   https://sunsecurities.com/api/stocks/search
//   https://sunsecurities.com/sitemap.xml
//   https://sunsecurities.com/market/live
//   https://nepalstock.com.np/company
//   https://nepalstock.com.np/api/nots/company/list
//   https://nepalstock.com.np/api/nots/security?nonDelisted=true
//   https://nepalstock.com.np/api/nots/security/<id>
//
//   node brokers/sunsecurities/sunsecurities_scraping.mjs

import puppeteer from "puppeteer-core";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const SUN = "https://sunsecurities.com";
const NEPSE = "https://nepalstock.com.np";
const EXCHANGE = "Nepal Stock Exchange";

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

async function getText(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "user-agent": UA } });
      if (response.ok) return await response.text();
      last = `${url} answered ${response.status}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  throw new Error(last || url);
}

async function sunLists() {
  const list = JSON.parse(await getText(`${SUN}/api/stocks/search`));
  if (!Array.isArray(list) || list.length < 500) throw new Error(`Sun's security list has ${list?.length ?? 0} lines`);
  const listed = new Set(list.map((line) => clean(line.symbol).toUpperCase()).filter(Boolean));
  const sitemap = new Set(
    [...(await getText(`${SUN}/sitemap.xml`)).matchAll(/<loc>https:\/\/sunsecurities\.com\/company\/([^<\/]+)<\/loc>/g)].map((m) =>
      decodeURIComponent(m[1]).toUpperCase(),
    ),
  );
  const differ = [...[...listed].filter((symbol) => !sitemap.has(symbol)), ...[...sitemap].filter((symbol) => !listed.has(symbol))];
  if (differ.length) throw new Error(`Sun's list and sitemap differ: ${differ.join(" ")}`);
  const board = [...(await getText(`${SUN}/market/live`)).matchAll(/class="live-row[^"]*" data-sym="([^"]+)"/g)].map((m) => m[1].toUpperCase());
  if (board.length < 100) throw new Error(`Sun's live board shows ${board.length} symbols`);
  return { listed, board };
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
  for (const line of securities) {
    const record = records.get(line.id);
    if (!record || record.id !== line.id) throw new Error(`no NEPSE record for ${line.symbol}`);
    const ticker = clean(record.symbol).toUpperCase();
    const name = clean(record.securityName);
    const kind = clean(record.instrumentType?.description);
    const promoter = record.isPromoter === "Y";
    // A promoter line is not in the company list; every other line must agree with it.
    if (!promoter && typeOf.get(ticker) !== kind) throw new Error(`${ticker} is ${kind} in its record, ${typeOf.get(ticker)} in the company list`);
    const reason =
      kind !== "Equity" && kind !== "Preference Shares" ? kind
      : record.activeStatus !== "A" ? `status ${record.activeStatus}`
      : record.permittedToTrade !== "Y" ? "not permitted to trade"
      : "";
    if (reason) {
      left[reason] = (left[reason] || 0) + 1;
      continue;
    }
    // A line with no ISIN yet carries an exchange code such as N387PSDBLP.
    const code = clean(record.isin).toUpperCase();
    const isin = new RegExp(`^N\\d+${ticker}$`).test(code) ? "" : code;
    if (!ticker || !name) throw new Error(`unreadable NEPSE line ${JSON.stringify(line)}`);
    if (isin && !/^NP[A-Z0-9]{10}$/.test(isin)) throw new Error(`${ticker} has ISIN ${isin}`);
    if (seen.has(ticker) || (isin && seen.has(isin))) throw new Error(`repeated ${ticker} ${isin}`);
    seen.add(ticker);
    if (isin) seen.add(isin);
    rows.push({
      query: ticker,
      ticker,
      name,
      exchange: EXCHANGE,
      currency: "NPR",
      type: "STOCK",
      ...(isin ? { isin } : {}),
      mic: "XNEP",
      raw: [ticker, name, EXCHANGE, isin, kind, promoter ? "promoter" : "public"].filter(Boolean).join(" "),
    });
  }
  return { rows, left, symbols: new Set(securities.map((line) => clean(line.symbol).toUpperCase())) };
}

const sun = await sunLists();

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

const { rows, left, symbols } = result;
if (rows.length < 350) throw new Error(`only ${rows.length} NEPSE shares are open to trade`);
// Whatever traded on Sun's board today must be a live NEPSE line.
const offBoard = sun.board.filter((symbol) => !symbols.has(symbol));
if (offBoard.length) throw new Error(`on Sun's live board but not a NEPSE line: ${offBoard.join(" ")}`);
// Sun's list misses some new promoter lines, so only the public shares
// are held to it.
const publicRows = rows.filter((row) => row.raw.endsWith(" public"));
const unknown = publicRows.filter((row) => !sun.listed.has(row.ticker));
if (unknown.length > publicRows.length * 0.1) throw new Error(`${unknown.length} NEPSE shares are not in Sun's list: ${unknown.map((row) => row.ticker).join(" ")}`);
const stale = [...sun.listed].filter((symbol) => !symbols.has(symbol)).length;

rows.sort((a, b) => a.ticker.localeCompare(b.ticker));
const written = stampRows(withoutObligations(rows));
if (written.length !== rows.length) throw new Error(`${rows.length - written.length} shares were taken for bonds`);
fs.writeFileSync(new URL("sunsecurities-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
const promoters = rows.length - publicRows.length;
const leftOut = Object.entries(left).map(([reason, count]) => `${count} ${reason}`).join(", ");
console.error(`${written.length} listings (${written.length} STOCK, ${promoters} of them promoter shares) on ${EXCHANGE}; left out ${leftOut}; ${unknown.length} public shares not in Sun's list, ${stale} of Sun's symbols no longer on NEPSE`);
