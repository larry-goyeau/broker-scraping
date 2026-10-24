// What IDBI Capital Markets & Securities (India) sells in shares and ETFs,
// with no login. Its retail portal idbidirect.in links the company list
// as "Stocks" from the brokerage page: one server-rendered table of every
// NSE or BSE line it quotes, NSE by default and BSE through the DrpExchg
// postback (C-MOTS data; about 3,470 NSE and 5,280 BSE rows in October
// 2026, ETFs included). Each row links a company page whose info strip
// prints the BSE code, the NSE symbol and the ISIN.
//
//   https://www.idbidirect.in/Offering-Innerpage.aspx?Option=brokerage
//   https://www.idbidirect.in/Markets/Equity/CompanyList.aspx
//   https://www.idbidirect.in/Markets/CompanyInformation/Detailed-Quotes/<slug>
//
// The company pages are read six at a time and each answer is kept in
// idbicapital-cache.jsonl; an answer older than a week is asked again.
// The NSE ticker is the NSE symbol; the BSE ticker is the BSE trading
// symbol of that ISIN in the cash book (../../indianCash.mjs: NSE equity
// list and the Upstox instrument file), or else the BSE code. An INF ISIN
// is an ETF and every other line a STOCK; REITs and InvITs are units
// traded like shares.
//
// Some pages cannot be read as they stand, and are matched to the
// exchanges' own lists instead (NSE equity, SME Emerge and ETF lists, the
// BSE list of active scrips, the Upstox cash book):
//   - a page with no company on it (a name with "&" or "-", some ETFs);
//   - a page that prints another line's codes: in October 2026 eight
//     Aditya Birla Sun Life ETF pages all printed MOMENTUM, three Motilal
//     Oswal ETF pages MODEFENCE, the Shipping Corporation page SCILAL, a
//     partly paid page its fully paid share. A code printed by two pages
//     or more is not trusted for any of them;
//   - a partly paid share or a DVR, whose IN9 ISIN is no debt ISIN here.
// Such a page takes the line whose official name is its own (one ISIN
// only), or the symbol written for it in NAMED below, and is kept only
// when that ISIN is listed on the exchange today. A line whose ISIN is
// not on the exchange's lists any more takes the ISIN its NSE symbol or BSE
// code has today when both have the same issuer (a reissued ISIN).
//
// Left out: a BSE scrip that is not on the BSE list of active scrips or
// in the Upstox BSE book (suspended or delisted: it cannot be bought),
// an index (Nifty, Sensex, the G-Sec and bond indices), a
// delisted, merged or suspended line whose name the lists do not know, a
// partly paid line no longer traded, a debt ISIN, an iNAV line, a row
// whose page gives no ISIN, and an NSE row with no NSE symbol. Everything
// is in rupees.
//
//   https://nsearchives.nseindia.com/emerge/corporates/content/SME_EQUITY_L.csv
//   https://nsearchives.nseindia.com/content/equities/eq_etfseclist.csv
//   https://api.bseindia.com/BseIndiaAPI/api/ListofScripData/w?segment=Equity&status=Active
//
//   node brokers/idbicapital/idbicapital_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { cashBook, debtIsin, isInav, isinOf, parseCsv } from "../../indianCash.mjs";
import { resolveVenue } from "../../spreads/venues.mjs";
import fs from "node:fs";

const SITE = "https://www.idbidirect.in";
const LIST = `${SITE}/Markets/Equity/CompanyList.aspx`;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const CACHE = new URL("idbicapital-cache.jsonl", import.meta.url);
const WEEK = 7 * 24 * 3600 * 1000;
// About 85% of the counts on 2026-10-22 (NSE 3,469, BSE 5,275).
const FLOOR = { NSE: 2900, BSE: 4400 };
const VENUE = { NSE: { exchange: "NSE", mic: "XNSE" }, BSE: { exchange: "BSE", mic: "XBOM" } };
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const NSE_SME = "https://nsearchives.nseindia.com/emerge/corporates/content/SME_EQUITY_L.csv";
const NSE_ETFS = "https://nsearchives.nseindia.com/content/equities/eq_etfseclist.csv";
const BSE_ACTIVE = "https://api.bseindia.com/BseIndiaAPI/api/ListofScripData/w?Group=&Scripcode=&industry=&segment=Equity&status=Active";

// Pages that print no company, or another line's codes, and whose name is
// not the exchange's: the exchange symbol of the line they list (checked
// on 2026-10-22 against the NSE ETF list, the BSE scrip list and Upstox).
const NAMED = {
  "Aditya_Birla_Sun_Life_Crisil_10_Year_Gilt_ETF": "GSEC10ABSL",
  "Aditya_Birla_Sun_Life_Crisil_Liquid_Overnight_ETF": "ABSLLIQUID",
  "Angel_One_Nifty_Total_Market_ETF": "AONETOTAL",
  "Angel_One_Nifty_Total_Market_Momentum_Qual__50_ETF": "AONETMMQ50",
  "Bharat_Bond_ETF-April_2030": "EBBETF0430",
  "Bharat_Bond_ETF-April_2031": "EBBETF0431",
  "Bharat_Bond_ETF-April_2032": "BBETF0432",
  "Groww_Nifty_Smallcap_250_ETF": "GROWWSC250",
  "Groww_Nifty_Smallcap_250_Momentum_Quality_100_ETF": "SMALLGROWW",
  "ICICI_Prudential_BSE_Liquid_Rate_ETF": "LIQUIDIETF",
  "ICICI_Prudential_BSE_Liquid_Rate_ETF-Growth": "CASHIETF",
  "Kotak_NV_20_ETF-Dividend_Payout_Option": "NV20",
  "LIC_Nomura_MF_ETF-NIFTY_50-Growth_Plan": "LICNETFN50",
  "LIC_Nomura_MF_ETF-Nifty_100": "LICNFNHGP",
  "LIC_Nomura_MF_ETF-SENSEX": "LICNETFSEN",
  "LIC_Nomura_MF_G-Sec_Long_Term_ETF": "LICNETFGSC",
  "Mirae_ANfy200_Mom__30_Plus_8-13_yr_GSec_50_50_ETF": "HYBRIDETF",
  "Mirae_Asset_Nifty_1D_Rate_Liquid_ETF": "LIQUID",
  "Mirae_Asset_Nifty_1D_Rate_Liquid_ETF-Growth": "LIQUIDPLUS",
  "Mirae_Asset_Nifty_India_Infrastr__and_Logistics_ETF": "INFRA",
  "Mirae_Asset_Nifty_Smallcap_250_Momen_Quali__100ETF": "SMALLCAP",
  "Motilal_Oswal_5_Year_G-Sec_ETF": "MOGSEC",
  "Motilal_Oswal_Nifty_India_Manufacturing_ETF": "MOMGF",
  "Motilal_Oswal_Nifty_India_Tourism_ETF": "MOTOUR",
  "Nippon_India_CRISIL-IBX_FAR_Gilt_ETF": "FARBEES",
  "Nippon_India_ETF_Nifty_50_Value_20": "NV20BEES",
  "Nippon_India_ETF_Nifty_8-13_yr_G-Sec_LongTerm_Gilt": "LTGILTBEES",
  "Nippon_India_ETF_Nifty_India_Consumption": "CONSUMBEES",
  "SBI-ETF_10_Year_GILT": "SETF10GILT",
  "SBI-ETF_Quality": "SBIETFQLTY",
  "UTI-Gold_Exchange_Traded_Fund": "GOLDBETA",
  "Zerodha_Nifty_8-13_Yr_G-Sec_ETF": "LTGILTCASE",
  "Mirae_Asset_NYSE_FANG+_ETF": "MAFANG",
  "Property_Share_Investment_Trust-_Propshare_Platina": "PSPLATINA",
  "Property_Share_Investment_Trust-_Propshare_Titania": "PSTITANIA",
  "Property_Share_Investment_Trust-Propshare_Celestia": "PSCELESTIA",
  "Shipping_Corporation_of_India_Ltd": "SCI",
  "GACM_Technologies_Ltd-DVR": "GATECHDVR",
  "Jain_Irrigation_Systems_Ltd-DVR": "JISLDVREQS",
  "G-Tec_Janix_Education_Ltd": "GTECJAINX",
  "Sharma_East_India_Hosp_and_Medical_Research_Ltd": "SHARMEH",
};

const decode = (text) =>
  String(text || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

async function request(url, options = {}) {
  let last = "";
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const response = await fetch(url, { ...options, headers: { "User-Agent": UA, ...options.headers }, signal: AbortSignal.timeout(120_000) });
      if (response.ok) return response;
      last = `${url} answered ${response.status}`;
    } catch (error) {
      last = `${url}: ${error.message}`;
    }
    await pause(2_000 * (attempt + 1));
  }
  throw new Error(last);
}

function listRows(html) {
  return [...html.matchAll(/<a href="\/Markets\/CompanyInformation\/Detailed-Quotes\/([^"]+)" class="txtlink">([^<]*)<\/a>/g)].map(([, slug, name]) => ({ slug, name: decode(name) }));
}

// The NSE table, then the same page posted back with BSE selected.
async function lists() {
  const first = await request(LIST);
  const cookie = (first.headers.getSetCookie?.() || []).map((line) => line.split(";")[0]).join("; ");
  const html = await first.text();
  const hidden = (name) => html.match(new RegExp(`name="${name}"[^>]*value="([^"]*)"`))?.[1] ?? "";
  if (!/option selected="selected" value="NSE"/.test(html)) throw new Error("the company list did not open on NSE");
  const body = new URLSearchParams();
  for (const name of ["__VIEWSTATE", "__VIEWSTATEGENERATOR", "__EVENTVALIDATION", "__LASTFOCUS"]) body.set(name, hidden(name));
  body.set("__EVENTTARGET", "ctl00$ContentPlaceHolder1$DrpExchg");
  body.set("__EVENTARGUMENT", "");
  body.set("ctl00$ContentPlaceHolder1$DrpExchg", "BSE");
  const second = await (await request(LIST, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie, Referer: LIST }, body })).text();
  if (!/option selected="selected" value="BSE"/.test(second)) throw new Error("the BSE postback did not select BSE");
  return { NSE: listRows(html), BSE: listRows(second) };
}

// The info strip of a company page. A whole page with no company on it is
// an index row (Nifty 100, Sensex...): it is kept as such and not asked
// again. A company page without the strip is asked again.
function companyFacts(html) {
  if (!/companyname/.test(html) && /<\/html>/i.test(html)) return { bse: "", nse: "", isin: "", index: true };
  if (!/BSE Code:/.test(html)) return null;
  const field = (label) => decode(html.match(new RegExp(`<td>${label}</td><td>([^<]*)</td>`))?.[1] || "");
  return { bse: field("BSE Code:"), nse: field("NSE Symbol:").toUpperCase(), isin: field("ISIN Demat:").toUpperCase() };
}

async function company(slug) {
  const url = `${SITE}/Markets/CompanyInformation/Detailed-Quotes/${slug}`;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(90_000) });
      // The link of a name with "+" (Mirae_Asset_NYSE_FANG+_ETF) is a 404.
      if (response.status === 404) return { bse: "", nse: "", isin: "", index: true };
      if (response.ok) {
        const facts = companyFacts(await response.text());
        if (facts) return facts;
      }
    } catch {}
    await pause(2_000 * (attempt + 1));
  }
  return { bse: "", nse: "", isin: "", failed: true };
}

async function companies(slugs) {
  const out = new Map();
  if (fs.existsSync(CACHE)) {
    for (const line of fs.readFileSync(CACHE, "utf8").split("\n").filter(Boolean)) {
      try {
        const { at, slug, facts } = JSON.parse(line);
        if (Date.now() - at < WEEK && slug && facts && !facts.failed) out.set(slug, facts);
      } catch {}
    }
  }
  const todo = slugs.filter((slug) => !out.has(slug));
  console.error(`${slugs.length} company pages, ${todo.length} to read`);
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < todo.length) {
      const slug = todo[next++];
      const facts = await company(slug);
      out.set(slug, facts);
      if (!facts.failed) fs.appendFileSync(CACHE, `${JSON.stringify({ at: Date.now(), slug, facts })}\n`);
      done += 1;
      if (done % 500 === 0) console.error(`${done}/${todo.length}`);
      await pause(100);
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  return out;
}

const listed = await lists();
for (const exchange of Object.keys(listed)) {
  if (listed[exchange].length < FLOOR[exchange]) throw new Error(`${exchange} list has only ${listed[exchange].length} rows`);
}
const facts = await companies([...new Set([...listed.NSE, ...listed.BSE].map((row) => row.slug))]);

// The exchanges' own lists: the cash book (NSE equity list and Upstox),
// the NSE SME Emerge and ETF lists, and the BSE list of active scrips.
const book = await cashBook();
const csvOf = async (url) => parseCsv(await (await request(url, { headers: { Accept: "text/csv,*/*" } })).text());
const sme = await csvOf(NSE_SME);
const etfs = await csvOf(NSE_ETFS);
const active = JSON.parse(await (await request(BSE_ACTIVE, {
  headers: { Accept: "application/json, text/plain, */*", "Accept-Language": "en-US,en;q=0.9", Referer: "https://www.bseindia.com/", Origin: "https://www.bseindia.com", "sec-fetch-site": "same-site", "sec-fetch-mode": "cors", "sec-fetch-dest": "empty" },
})).text());
if (sme.length < 300 || !("ISIN_NUMBER" in sme[0])) throw new Error(`the NSE SME list has ${sme.length} lines`);
if (etfs.length < 250 || !("ISINNumber" in etfs[0])) throw new Error(`the NSE ETF list has ${etfs.length} lines`);
if (!Array.isArray(active) || active.length < 4000 || !("scrip_id" in active[0]) || !("ISIN_NUMBER" in active[0])) throw new Error(`the BSE active list has ${active?.length ?? "no"} scrips`);

const symbolOf = { NSE: new Map(), BSE: new Map() };
const isinOfSymbol = { NSE: new Map(), BSE: new Map() };
const setSymbol = (exchange, symbol, isin) => {
  const id = isinOf(isin);
  const code = String(symbol || "").trim().toUpperCase();
  if (!id || !code) return;
  if (!symbolOf[exchange].has(id)) symbolOf[exchange].set(id, code);
  if (!isinOfSymbol[exchange].has(code)) isinOfSymbol[exchange].set(code, id);
};
for (const [key, entry] of book) {
  const [exchange, symbol] = key.split("|");
  if (symbolOf[exchange]) setSymbol(exchange, symbol, entry.isin);
}
for (const line of sme) setSymbol("NSE", line.SYMBOL, line.ISIN_NUMBER);
for (const line of etfs) setSymbol("NSE", line.Symbol, line.ISINNumber);
const bseCode = new Map();
const bseByCode = new Map();
for (const scrip of active) {
  setSymbol("BSE", scrip.scrip_id, scrip.ISIN_NUMBER);
  const id = isinOf(scrip.ISIN_NUMBER);
  if (id && !bseCode.has(id)) bseCode.set(id, String(scrip.SCRIP_CD));
  if (id) bseByCode.set(String(scrip.SCRIP_CD), id);
}
// Listed today on the exchange.
const listedOn = (exchange, isin) => symbolOf[exchange].has(isin);

// Company name -> ISINs. "S&P", "Ltd", "ETF", "DVR", "Partly Paid" and
// the like are not part of the key; the kind of ISIN tells them apart.
const nameKey = (text) =>
  String(text || "")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\(merged\)/g, " ")
    .replace(/\bs\s*(?:&|and)\s*p\b/g, " ")
    .replace(/&/g, " and ")
    .replace(/\bg\s*-?\s*sec\b/g, "gsec")
    .replace(/\bpartly\s*-?\s*paid(?:\s*-?\s*up)?\b|\bppd\s*up\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|and|ltd|limited|co|company|corporation|corp|inc|india|exchange traded fund|etf|fund|mf|growth|plan|option|dvr|pp)\b/g, " ")
    .replace(/\s+/g, "");
const byName = new Map();
const addName = (name, isin) => {
  const key = nameKey(name);
  const id = isinOf(isin);
  if (!key || !id) return;
  if (!byName.has(key)) byName.set(key, new Set());
  byName.get(key).add(id);
};
for (const entry of book.values()) addName(entry.name, entry.isin);
for (const line of sme) addName(line.NAME_OF_COMPANY, line.ISIN_NUMBER);
// The "Underlying Asset" column is an index name for most ETFs (Nifty 50);
// only a fund's own name is a name.
for (const line of etfs) if (/\b(etf|bees|fund)\b/i.test(line["Underlying Asset"])) addName(line["Underlying Asset"], line.ISINNumber);
for (const scrip of active) {
  addName(scrip.Scrip_Name, scrip.ISIN_NUMBER);
  if (!String(scrip.ISIN_NUMBER).startsWith("INF")) addName(scrip.Issuer_Name, scrip.ISIN_NUMBER);
}

// A partly paid share or a DVR is an IN9 ISIN (but GACM's DVR is INE).
const variantOf = (slug) => (/partly_?paid/i.test(slug) ? "PP" : /[-_]DVR$/i.test(slug) ? "DVR" : "");
const kindOf = (slug) => (variantOf(slug) ? "IN9" : /ETF|BeES|Exchange_Traded/i.test(slug) ? "INF" : "INE");
// The page of a company whose name has "&" or "-" is empty on the site
// (Jammu_and_Kashmir_Bank_Ltd, Hi-Tech_Pipes_Ltd): such a row is matched
// on its full name (the link), when that gives one ISIN of its kind.
function byCompanyName(slug) {
  const found = [...(byName.get(nameKey(slug)) || [])].filter((isin) => isin.startsWith(kindOf(slug)));
  return found.length === 1 ? found[0] : "";
}
function bySymbol(symbol) {
  return isinOfSymbol.NSE.get(symbol) || isinOfSymbol.BSE.get(symbol) || "";
}

// A code printed by two pages or more belongs to one of them at most.
const printedBy = new Map();
for (const slug of new Set([...listed.NSE, ...listed.BSE].map((row) => row.slug))) {
  const isin = facts.get(slug)?.index ? "" : isinOf(facts.get(slug)?.isin);
  if (isin) printedBy.set(isin, (printedBy.get(isin) || 0) + 1);
}

const rows = [];
const seen = new Set();
const left = { bseClosed: 0, index: 0, byName: 0, bySymbol: 0, reissued: 0, foreign: 0, notListed: 0, noIsin: 0, debt: 0, inav: 0, noSymbol: 0, repeat: 0, failed: 0 };
const unmatched = [];
for (const exchange of ["NSE", "BSE"]) {
  for (const { slug, name } of listed[exchange]) {
    const fact = facts.get(slug);
    if (fact.failed) { left.failed += 1; continue; }
    const printed = fact.index ? "" : isinOf(fact.isin);
    const foreign = printed && printedBy.get(printed) > 1;
    let how = "page";
    let isin = printed;
    if (NAMED[slug]) {
      how = "symbol";
      isin = bySymbol(NAMED[slug]);
      if (!isin) throw new Error(`${slug}: ${NAMED[slug]} is on none of the exchange lists`);
    } else if (fact.index || foreign || (variantOf(slug) === "PP" && printed && !printed.startsWith("IN9"))) {
      how = "name";
      isin = byCompanyName(slug);
      if (!isin) {
        if (fact.index) left.index += 1;
        else left.foreign += 1;
        unmatched.push(`${exchange} ${slug}`);
        continue;
      }
    }
    if (!isin) { left.noIsin += 1; continue; }
    if (debtIsin(isin) && !isin.startsWith("IN9")) { left.debt += 1; continue; }
    // A page ISIN the exchange no longer lists, while the page's own NSE
    // symbol or BSE code is listed under another ISIN of the same issuer
    // (Galada Power after its reduction, ELMDIV printed with a 1 for an I).
    if (how === "page" && !listedOn(exchange, isin)) {
      const current = (exchange === "NSE" ? isinOfSymbol.NSE.get(fact.nse) : bseByCode.get(fact.bse)) || "";
      if (current && current !== isin && current.slice(0, 7) === isin.slice(0, 7)) { isin = current; left.reissued += 1; }
    }
    // A BSE scrip not on the BSE active list (suspended or delisted) cannot
    // be bought, whatever its page says.
    if (how === "page" && exchange === "BSE" && !isin.startsWith("IN9") && !listedOn(exchange, isin)) {
      left.bseClosed += 1;
      unmatched.push(`${exchange} ${slug} ${isin} not active on BSE`);
      continue;
    }
    if ((how !== "page" || isin.startsWith("IN9")) && !listedOn(exchange, isin)) {
      left.notListed += 1;
      unmatched.push(`${exchange} ${slug} ${isin} not listed`);
      continue;
    }
    const nse = how === "page" && !/NOT LISTED/i.test(fact.nse) ? fact.nse : "";
    const code = how === "page" ? fact.bse : bseCode.get(isin) || "";
    const ticker = exchange === "NSE" ? nse || symbolOf.NSE.get(isin) || "" : symbolOf.BSE.get(isin) || code;
    if (!ticker) { left.noSymbol += 1; continue; }
    if (isInav(ticker) || /\bi-?nav\b/i.test(name)) { left.inav += 1; continue; }
    const line = `${exchange}|${isin}`;
    if (seen.has(line)) { left.repeat += 1; continue; }
    seen.add(line);
    if (how === "name") left.byName += 1;
    if (how === "symbol") left.bySymbol += 1;
    const type = isin.startsWith("INF") ? "ETF" : "STOCK";
    rows.push({ query: ticker, ticker, name, exchange: VENUE[exchange].exchange, mic: VENUE[exchange].mic, currency: "INR", type, isin, raw: [ticker, name, exchange, code ? `BSE ${code}` : "", isin, type, how === "name" ? "(matched by name)" : how === "symbol" ? "(matched by symbol)" : ""].filter(Boolean).join(" ") });
  }
  const count = rows.filter((row) => row.exchange === exchange).length;
  if (count < FLOOR[exchange]) throw new Error(`${exchange}: only ${count} lines kept`);
}
if (left.failed > 50) throw new Error(`${left.failed} company pages never answered`);

rows.sort((a, b) => a.exchange.localeCompare(b.exchange) || a.ticker.localeCompare(b.ticker));
const kept = withoutObligations(rows);
// Every line must land on its own venue in the spread cache.
const stray = kept.filter((row) => resolveVenue(row).venue?.mic !== row.mic);
if (stray.length) throw new Error(`${stray.length} lines resolve to another venue, e.g. ${JSON.stringify(stray[0])}`);
fs.writeFileSync(new URL("idbicapital-parsed.json", import.meta.url), JSON.stringify(stampRows(kept), null, 2));
const tally = {};
for (const row of kept) tally[`${row.exchange} ${row.type}`] = (tally[`${row.exchange} ${row.type}`] || 0) + 1;
console.error(tally);
console.error(`${kept.length} listings; list rows NSE ${listed.NSE.length}, BSE ${listed.BSE.length}; ${left.byName} rows matched by name, ${left.bySymbol} by symbol, ${left.reissued} ISINs reissued; left out ${left.index} rows whose page names no company and whose name no list knows (indices, delisted or merged lines), ${left.foreign} rows whose page prints another line's codes, ${left.notListed} lines not listed today, ${left.bseClosed} BSE scrips not active on BSE (suspended or delisted), ${left.noIsin} without an ISIN, ${left.debt} debt ISINs, ${left.inav} iNAV, ${left.noSymbol} NSE rows without a symbol, ${left.repeat} repeats of a line, ${left.failed} pages that never answered`);
if (process.env.IDBI_UNMATCHED) fs.writeFileSync(process.env.IDBI_UNMATCHED, unmatched.join("\n") + "\n");
