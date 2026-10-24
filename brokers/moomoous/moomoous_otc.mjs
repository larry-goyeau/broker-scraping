// OTC Markets reader for moomoous_scraping.mjs (the rules it serves are in
// that file's header).
//
// The tier of every OTC line comes from OTC Markets' own stock screener,
// read market by market from its JSON endpoint:
//   https://www.otcmarkets.com/research/stock-screener
//   https://www.otcmarkets.com/research/stock-screener/api?market=1&sortField=symbol&sortOrder=asc&page=0&pageSize=100
// Market codes, as the endpoint itself labels its lines (22 October 2026):
// 1 OTCQX (668 lines: 2 OTCQX U.S. 166 + 6 OTCQX International 502),
// 10 OTCQB (1,163), 20 OTCID (1,283; the former Pink Current), 21 Pink
// Limited (9,190), 30 Grey (1,966), 40 Expert Market (3,729); 18,099 lines
// in all. Each line
// carries its security type, country and Caveat Emptor flag, no CUSIP.
// otcmarkets.com answers plain HTTP clients with a "Temporarily
// Unavailable" page, so the screener is read from a headless Chrome
// (puppeteer-core), as brokers/ibkrus/ibkr_exchange_lists.mjs does, one
// page every PAGE_GAP ms, and kept in otc-screener-cache.json for
// SCREENER_DAYS days.
//
// The CUSIP of a line is on OTC Markets' company profile (the JSON behind
// the security page www.otcmarkets.com/stock/<symbol>/security):
//   https://backend.otcmarkets.com/otcapi/company/profile/full/NSRGY?symbol=NSRGY
//     "securities":[{"symbol":"NSRGY","cusip":"641069406",...}]
// It is read only for a line the shared lists leave without an ISIN, one
// call every PROFILE_GAP ms, and kept in otc-profile-cache.json (a CUSIP
// does not move; an empty answer is asked again after PROFILE_DAYS days).

import { createRequire } from "node:module";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SCREENER = "https://www.otcmarkets.com/research/stock-screener";
const PROFILE = "https://backend.otcmarkets.com/otcapi/company/profile/full/";
const INSIDE = "https://backend.otcmarkets.com/otcapi/stock/trade/inside/";
// The screener market each line files under (its marketId) -> tier. Market
// 1 is the OTCQX group: its lines carry 2 (OTCQX U.S.) or 6 (OTCQX
// International).
export const OTC_TIERS = { 1: "OTCQX", 2: "OTCQX", 6: "OTCQX", 10: "OTCQB", 20: "OTCID", 21: "Pink Limited", 30: "Grey", 40: "Expert Market" };
const PAGE_SIZE = 100;
const PAGE_GAP = 1500;
const PROFILE_GAP = 1500;
const SCREENER_DAYS = 3;
const PROFILE_DAYS = 14;

const SCREENER_CACHE = new URL("otc-screener-cache.json", import.meta.url);
const PROFILE_CACHE = new URL("otc-profile-cache.json", import.meta.url);
const HOME_CACHE = new URL("otc-home-cache.json", import.meta.url);
const SIZE_CACHE = new URL("otc-size-cache.json", import.meta.url);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function readJson(url) {
  try {
    return fs.existsSync(url) ? JSON.parse(fs.readFileSync(url, "utf8")) : {};
  } catch {
    return {};
  }
}

function writeJson(url, value) {
  const temporary = new URL(`${url.pathname.split("/").pop()}.tmp`, url);
  fs.writeFileSync(temporary, JSON.stringify(value));
  fs.renameSync(temporary, url);
}

async function withScreenerPage(task) {
  const require = createRequire(import.meta.url);
  let module;
  try {
    module = await import(require.resolve("puppeteer-core"));
  } catch {
    module = await import("puppeteer-core");
  }
  const puppeteer = module.default || module;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--disable-gpu"] });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(UA);
    await page.goto(SCREENER, { waitUntil: "domcontentloaded", timeout: 90_000 });
    return await task(async (url) => {
      const [status, text] = await page.evaluate(async (target) => {
        const response = await fetch(target);
        return [response.status, await response.text()];
      }, url);
      if (status !== 200) throw new Error(`${url} answered ${status}`);
      // The inside quote of a line with no quote at all answers 200 with
      // nothing (AAKAY).
      if (!text.trim()) return {};
      let body = JSON.parse(text);
      if (typeof body === "string") body = JSON.parse(body);
      return body;
    });
  } finally {
    await browser.close();
  }
}

const slim = (stock) => ({
  symbol: stock.symbol,
  name: stock.securityName,
  marketId: stock.marketId,
  market: stock.market,
  type: stock.securityType,
  country: stock.country,
  caveatEmptor: Boolean(stock.caveatEmptor),
  price: stock.price ?? null,
});

// Lines of the asked markets, read market by market, every page kept as it
// arrives so an interrupted walk resumes where it stopped.
export async function otcScreener(markets, { live = false } = {}) {
  const cache = readJson(SCREENER_CACHE);
  if (live) for (const market of markets) delete cache[market];
  const fresh = (entry) => entry?.done && Date.now() - Date.parse(entry.at) < SCREENER_DAYS * 86400_000;
  // A walk cut short less than a day ago resumes from its saved pages.
  const resumable = (entry) => entry && !entry.done && Date.now() - Date.parse(entry.at) < 86400_000;
  const missing = markets.filter((market) => !fresh(cache[market]));
  if (missing.length) {
    let last = "";
    for (let attempt = 0; attempt < 3 && missing.some((market) => !fresh(cache[market])); attempt += 1) {
      try {
        await withScreenerPage(async (get) => {
          for (const market of missing) {
            if (fresh(cache[market])) continue;
            const entry = resumable(cache[market]) ? cache[market] : { at: new Date().toISOString(), done: false, count: null, pages: {} };
            cache[market] = entry;
            for (let number = 0; number < 400; number += 1) {
              if (entry.pages[number]) {
                if (entry.pages[number].length < PAGE_SIZE) break;
                continue;
              }
              const body = await get(`/research/stock-screener/api?market=${market}&sortField=symbol&sortOrder=asc&page=${number}&pageSize=${PAGE_SIZE}`);
              entry.count ??= body.count;
              const stocks = (body.stocks || []).map(slim);
              for (const stock of stocks) {
                if (!OTC_TIERS[stock.marketId] || OTC_TIERS[stock.marketId] !== OTC_TIERS[market]) throw new Error(`OTC Markets market ${market} page ${number} holds ${stock.symbol} of market ${stock.marketId}`);
              }
              entry.pages[number] = stocks;
              writeJson(SCREENER_CACHE, cache);
              if (stocks.length < PAGE_SIZE) break;
              await sleep(PAGE_GAP);
            }
            const symbols = new Set(Object.values(entry.pages).flat().map((stock) => stock.symbol));
            // The count runs a few symbols ahead of the pages while the list
            // moves: up to 0.5% short is accepted.
            if (!entry.count || symbols.size > entry.count || symbols.size < entry.count * 0.995) {
              delete cache[market];
              writeJson(SCREENER_CACHE, cache);
              throw new Error(`OTC Markets market ${market}: announced ${entry.count}, read ${symbols.size}`);
            }
            entry.done = true;
            entry.at = new Date().toISOString();
            writeJson(SCREENER_CACHE, cache);
            await sleep(PAGE_GAP);
          }
        });
        last = "";
      } catch (error) {
        last = String(error.message || error);
        console.error(`OTC Markets screener: ${last}`);
        await sleep(10_000 * (attempt + 1));
      }
    }
    if (last) throw new Error(`the OTC Markets screener could not be read: ${last}`);
  }
  const out = {};
  for (const market of markets) {
    const entry = cache[market];
    const stocks = new Map();
    for (const stock of Object.values(entry.pages).flat()) stocks.set(stock.symbol, stock);
    out[market] = { at: entry.at, count: entry.count, stocks: [...stocks.values()] };
  }
  return out;
}

// Company profiles of the asked symbols, read one every PROFILE_GAP ms into
// the cache file, what keep() takes of each kept (an unknown symbol, 404,
// is kept as keep({})). An interrupted walk keeps what it read.
async function readProfiles(file, label, symbols, stale, keep, gap = PROFILE_GAP, base = PROFILE) {
  const cache = readJson(file);
  const wanted = [...new Set(symbols)].filter((symbol) => stale(cache[symbol]));
  if (wanted.length) {
    console.error(`OTC Markets ${label}: ${wanted.length} to read, about ${Math.ceil((wanted.length * gap) / 60_000)} min`);
    let failures = 0;
    let refused = 0;
    for (let start = 0; start < wanted.length && failures < 3; ) {
      try {
        await withScreenerPage(async (get) => {
          for (; start < wanted.length; start += 1) {
            const symbol = wanted[start];
            let body;
            const target = `${base}${encodeURIComponent(symbol)}?symbol=${encodeURIComponent(symbol)}`;
            try {
              body = await get(target);
              refused = 0;
            } catch (error) {
              if (/answered (404|400)/.test(error.message)) body = {};
              // A line OTC Markets keeps its data from (an Expert Market
              // line, APLIF) answers 403, kept as empty; five in a row is a
              // block, not five such lines.
              else if (/answered 403/.test(error.message) && refused < 4) {
                refused += 1;
                body = {};
              } else if (/answered 500/.test(error.message)) {
                // A profile the back end cannot build (BGLAF): asked once
                // more, then kept as empty, to be asked again another day.
                await sleep(PROFILE_GAP * 4);
                body = await get(target).catch((again) => {
                  if (/answered (404|400|500)/.test(again.message)) return {};
                  throw again;
                });
              } else throw error;
            }
            cache[symbol] = { at: new Date().toISOString(), ...keep(symbol, body) };
            if (start % 25 === 0) writeJson(file, cache);
            if (start % 250 === 0) console.error(`OTC Markets ${label}: ${start} of ${wanted.length}`);
            await sleep(gap);
          }
        });
      } catch (error) {
        failures += 1;
        console.error(`OTC Markets ${label}: ${error.message || error}; ${wanted.length - start} left`);
        writeJson(file, cache);
        await sleep(60_000 * failures);
      }
    }
    writeJson(file, cache);
  }
  return new Map(symbols.filter((symbol) => cache[symbol]).map((symbol) => [symbol, cache[symbol]]));
}

// symbol -> { cusip, issuerCountry, className } from the company profile,
// for the asked symbols only.
export function otcProfiles(symbols) {
  const stale = (entry) => !entry || (!entry.cusip && Date.now() - Date.parse(entry.at) > PROFILE_DAYS * 86400_000);
  return readProfiles(PROFILE_CACHE, "profiles", symbols, stale, (symbol, body) => {
    const security = (body.securities || []).find((item) => item.symbol === symbol);
    return {
      cusip: security?.cusip ? String(security.cusip).trim().toUpperCase() : "",
      issuerCountry: body.countryId || body.countryCode || "",
      className: security?.className || "",
    };
  });
}

// symbol -> the home listing OTC Markets gives on the same company profile,
// for a line still without an ISIN (otcIsinsFromHome below uses it):
//   "securities":[{"symbol":"AAHIF","cusip":"J02571107","issueName":"ASAHI CO LTD ORD",
//     "foreignExchangeName":"Tokyo Stock Exchange","foreignExchangeSymbol":"3333",
//     "foreignExchangeCountry":"JPN","foreignExchangeTier":"Prime Market",...}],
//   "name":"Asahi Co., Ltd.","countryId":"JP","incorporationInformation":[{"countryOfIncorporation":"JP"}],
//   "reportingStandard":"International Reporting: Tokyo Stock Exchange"
// The profile prints no ISIN (no field of it names one, 22 October 2026);
// a field whose name holds "isin" would be kept as isin. Kept in
// otc-home-cache.json; read again after HOME_DAYS days (PROFILE_DAYS for
// an empty answer).
const HOME_DAYS = 60;
export function otcHomes(symbols) {
  const stale = (entry) => !entry || Date.now() - Date.parse(entry.at) > (entry.found ? HOME_DAYS : PROFILE_DAYS) * 86400_000;
  return readProfiles(HOME_CACHE, "home listings", symbols, stale, (symbol, body) => {
    const security = (body.securities || []).find((item) => item.symbol === symbol);
    if (!security) return { found: false };
    let isin = "";
    for (const source of [security, body]) {
      for (const [key, value] of Object.entries(source)) {
        if (/isin/i.test(key) && /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(String(value).trim())) isin = String(value).trim();
      }
    }
    return {
      found: true,
      company: String(body.name || "").trim(),
      country: body.countryId || body.countryCode || "",
      incorporated: (body.incorporationInformation || []).map((item) => item.countryOfIncorporation).filter(Boolean),
      reporting: body.reportingStandard || "",
      issueName: security.issueName || "",
      className: security.className || "",
      typeName: security.typeName || "",
      cusip: security.cusip ? String(security.cusip).trim().toUpperCase() : "",
      isAdr: Boolean(security.isAdr || security.isGdr),
      homeExchange: security.foreignExchangeName || "",
      homeSymbol: security.foreignExchangeSymbol ? String(security.foreignExchangeSymbol).trim() : "",
      homeCountry: security.foreignExchangeCountry || "",
      homeTier: security.foreignExchangeTier || "",
      isin,
    };
  });
}

// symbol -> how big and how traded the line is, for the cut to moomoo's
// approved OTC list (moomoous_scraping.mjs, otcBestKnown): OTC Markets'
// inside quote, the small JSON behind the quote box of the security page:
//   https://backend.otcmarkets.com/otcapi/stock/trade/inside/NSRGY?symbol=NSRGY
//     {"lastSale":103.53,...,"thirtyDaysAvgVol":490156.2,"marketCap":259919337600,
//      "sharesOutstanding":2576520000,"adr":true}
// marketCap is the company's (OTC Markets' "estimatedMarketCap" of the
// profile, the same figure: RHHBY 332,227,849,576 on both, 22 October
// 2026), so an ADR and the ordinary line of one company rank alike;
// thirtyDaysAvgVol is in shares. Read one every SIZE_GAP ms, kept in
// otc-size-cache.json and read again after SIZE_DAYS days (PROFILE_DAYS
// for an empty answer: a line with no quote, AAKAY).
const SIZE_GAP = 700;
const SIZE_DAYS = 30;
export function otcSizes(symbols) {
  const stale = (entry) => !entry || Date.now() - Date.parse(entry.at) > (entry.marketCap || entry.avgVolume ? SIZE_DAYS : PROFILE_DAYS) * 86400_000;
  const number = (value) => (Number.isFinite(Number(value)) && value !== null && value !== "" ? Number(value) : null);
  return readProfiles(SIZE_CACHE, "inside quotes", symbols, stale, (symbol, body) => ({
    marketCap: number(body.marketCap),
    avgVolume: number(body.thirtyDaysAvgVol),
    lastSale: number(body.lastSale),
    lastTrade: body.lastTradeTime > 86400_000 ? new Date(body.lastTradeTime).toISOString().slice(0, 10) : "",
  }), SIZE_GAP, INSIDE);
}

// ISIN check digit (ISO 6166): letters to numbers, Luhn from the right.
export function isinFromCusip(country, cusip) {
  const body = `${country}${cusip}`.toUpperCase();
  if (!/^[A-Z]{2}[A-Z0-9]{9}$/.test(body)) return "";
  const digits = [...body].map((char) => (/\d/.test(char) ? char : String(char.charCodeAt(0) - 55))).join("");
  let sum = 0;
  for (let i = digits.length - 1, double = true; i >= 0; i -= 1, double = !double) {
    let value = Number(digits[i]);
    if (double) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
  }
  return `${body}${(10 - (sum % 10)) % 10}`;
}

// ---- ISINs of lines with no usable CUSIP ---------------------------------
//
// A foreign ordinary share quoted on OTC Markets (an F-share: AAHIF "ASAHI
// CO LTD ORD", AALBF "AALBERTS INDUS NV ORD") is the share of its home
// listing, so it carries that listing's ISIN; its CUSIP is a CINS
// (J02571107), which makes no ISIN. otcIsinsFromHome() gives such a line
// (and any other OTC line still without an ISIN) the home ISIN, only when
// it is certain:
//
// 1. Home listing. The line's company profile (otcHomes above) names the
//    home exchange and ticker ("foreignExchangeName":"Tokyo Stock
//    Exchange","foreignExchangeSymbol":"3333"). HOME_PLACES turns the
//    exchange into the places of assets/stocks.csv and assets/etfs.csv, the
//    ticker is looked up there (with its share-class separator written as
//    the lists write it: "ADDT.B" is OMXSTO:ADDT_B, HKEX drops leading
//    zeros) and taken when every hit gives one and the same ISIN, the list
//    name agrees with OTC Markets' issue or company name (namesAgree), the
//    list line is not a preferred share, right, warrant or NVDR the OTC
//    line is not, nor of another share class ("CARLSBERG AS SHS A" is not
//    CARL.B) or currency line ("BH MACRO LTD USD" is not "BH Macro Ltd
//    GBP"), and the ISIN's country is the issuer's country, its
//    country of incorporation, the home exchange's country or an offshore
//    domicile (OFFSHORE). Not for an ADR or GDR: its ISIN is its own. A
//    Thai ordinary line (local or foreign board?), a Shanghai or Shenzhen
//    hit (A or H share?) and an ETF (which share class?) need 2 as well.
// 2. Other catalogues. The ISIN every other brokers/*/*-parsed.json row
//    on OTC Markets (mic OTCM, or the OTC Markets labels of OTC_LABELS in
//    USD) gives for the same symbol, when they all give one ISIN, a name
//    agrees (the other row's or the lists' name for that ISIN) and its
//    country is plausible as above.
//    When 1 and 2 both answer and differ, the line is left without an ISIN
//    (counted as a conflict). A home-listing hit whose name does not agree
//    is still taken when 2 gives the same ISIN: two sources agree.
// 3. Name. A line with no home ticker, or whose home ticker is in no list,
//    takes the ISIN of the one list line, on the places of its country
//    (COUNTRY_PLACES; the home exchange's places when there is one), whose
//    name equals OTC Markets' company name word for word once legal forms
//    are dropped (exactName), when exactly one ISIN has that name there,
//    no other OTC line has the same name, and the ISIN's country is the
//    issuer's country or its OTC Markets country of incorporation. Several
//    "Asahi" companies on the Tokyo list: no ISIN.
// Last, an ISIN that would land on two OTC lines (or on a line other than
// the OTC line that already has it) is given to neither.

const COUNTRIES = [
  ["AR", "ARG", "Argentina"], ["AT", "AUT", "Austria"], ["AU", "AUS", "Australia"], ["BE", "BEL", "Belgium"],
  ["BM", "BMU", "Bermuda"], ["BR", "BRA", "Brazil"], ["BS", "BHS", "Bahamas"], ["CA", "CAN", "Canada"],
  ["CH", "CHE", "Switzerland"], ["CL", "CHL", "Chile"], ["CN", "CHN", "China"], ["CO", "COL", "Colombia"],
  ["CY", "CYP", "Cyprus"], ["CZ", "CZE", "Czech Republic"], ["DE", "DEU", "Germany"], ["DK", "DNK", "Denmark"],
  ["EG", "EGY", "Egypt"], ["ES", "ESP", "Spain"], ["FI", "FIN", "Finland"], ["FO", "FRO", "Faeroe Islands"],
  ["FR", "FRA", "France"], ["GB", "GBR", "United Kingdom"], ["GG", "GGY", "Guernsey"], ["GI", "GIB", "Gibraltar"],
  ["GR", "GRC", "Greece"], ["HK", "HKG", "Hong Kong"], ["HU", "HUN", "Hungary"], ["ID", "IDN", "Indonesia"],
  ["IE", "IRL", "Ireland"], ["IL", "ISR", "Israel"], ["IM", "IMN", "Isle of Man"], ["IN", "IND", "India"],
  ["IS", "ISL", "Iceland"], ["IT", "ITA", "Italy"], ["JE", "JEY", "Jersey"], ["JP", "JPN", "Japan"],
  ["KR", "KOR", "South Korea"], ["KY", "CYM", "Cayman Islands"], ["KZ", "KAZ", "Kazakhstan"], ["LI", "LIE", "Liechtenstein"],
  ["LT", "LTU", "Lithuania"], ["LU", "LUX", "Luxembourg"], ["MA", "MAR", "Morocco"], ["MH", "MHL", "Marshall Islands"],
  ["MN", "MNG", "Mongolia"], ["MO", "MAC", "Macau"], ["MT", "MLT", "Malta"], ["MU", "MUS", "Mauritius"],
  ["MX", "MEX", "Mexico"], ["MY", "MYS", "Malaysia"], ["NG", "NGA", "Nigeria"], ["NL", "NLD", "The Netherlands"],
  ["NO", "NOR", "Norway"], ["NZ", "NZL", "New Zealand"], ["PA", "PAN", "Panama"], ["PE", "PER", "Peru"],
  ["PG", "PNG", "Papua New Guinea"], ["PH", "PHL", "Philippines"], ["PK", "PAK", "Pakistan"], ["PL", "POL", "Poland"],
  ["PT", "PRT", "Portugal"], ["QA", "QAT", "Qatar"], ["RU", "RUS", "Russia"], ["SA", "SAU", "Saudi Arabia"],
  ["SE", "SWE", "Sweden"], ["SG", "SGP", "Singapore"], ["TH", "THA", "Thailand"], ["TR", "TUR", "Turkey"],
  ["TW", "TWN", "Taiwan"], ["US", "USA", "USA"], ["VG", "VGB", "British Virgin Islands"], ["VN", "VNM", "Vietnam"],
  ["ZA", "ZAF", "South Africa"], ["AE", "ARE", "United Arab Emirates"], ["KE", "KEN", "Kenya"], ["BG", "BGR", "Bulgaria"],
  ["CW", "CUW", "Curacao"], ["RO", "ROU", "Romania"], ["SI", "SVN", "Slovenia"], ["HR", "HRV", "Croatia"],
  ["EE", "EST", "Estonia"], ["LV", "LVA", "Latvia"], ["UY", "URY", "Uruguay"], ["PR", "PRI", "Puerto Rico"],
];
const COUNTRY_CODE = new Map();
for (const [two, three, name] of COUNTRIES) {
  COUNTRY_CODE.set(two, two);
  COUNTRY_CODE.set(three, two);
  COUNTRY_CODE.set(name.toUpperCase(), two);
}
COUNTRY_CODE.set("NETHERLANDS", "NL");
const countryCode = (value) => COUNTRY_CODE.get(String(value || "").trim().toUpperCase()) || "";

// Domiciles a listed company often has away from its home market (a Hong
// Kong listing of a Cayman company, an ASX listing of a Jersey one).
const OFFSHORE = new Set(["KY", "BM", "VG", "JE", "GG", "IM", "PA", "MH", "MU", "CW", "BS", "LI", "CY", "LU", "GI"]);

// OTC Markets' home exchange name -> places of the shared lists.
const HOME_PLACES = [
  [/^Tokyo Stock Exchange|^Nagoya|^Fukuoka|^Sapporo/i, ["TSE"]],
  [/^LSE\b|London Stock Exchange/i, ["LSE"]],
  [/^Aquis/i, ["AQUIS"]],
  [/^ASX\b|Australian Securities Exchange/i, ["ASX"]],
  [/^Hong Kong/i, ["HKEX"]],
  [/^Singapore/i, ["SGX", "SGX-ST"]],
  [/^Euronext (Paris|Amsterdam|Brussels|Lisbon|Dublin|Growth|Access)|^Irish Stock Exchange/i, ["EURONEXT"]],
  [/^Euronext Oslo|^Oslo/i, ["OSL"]],
  [/^Euronext Milan|^Borsa Italiana/i, ["MIL"]],
  [/Xetra|^Frankfurt|^Deutsche B/i, ["XETR", "FWB"]],
  [/^SIX\b|Swiss Exchange/i, ["SIX"]],
  [/^BX Swiss/i, ["BX"]],
  [/Stockholm/i, ["OMXSTO", "NGM"]],
  [/Nordic Growth Market|^NGM/i, ["NGM"]],
  [/Helsinki/i, ["OMXHEX"]],
  [/Copenhagen/i, ["OMXCOP"]],
  [/Iceland/i, ["OMXICE"]],
  [/^BME\b|Spanish Stock Exchange|^Madrid|^Bolsa de Madrid/i, ["BME"]],
  [/^Vienna|^Wiener/i, ["VIE"]],
  [/^Warsaw/i, ["GPW", "NEWCONNECT"]],
  [/^Athens/i, ["ATHEX"]],
  [/^Borsa Istanbul|^Istanbul/i, ["BIST"]],
  [/^Tel Aviv/i, ["TASE"]],
  [/^Johannesburg|^JSE\b/i, ["JSE"]],
  [/^Toronto Stock Exchange|^TSX$/i, ["TSX"]],
  [/^TSX Venture|^TSXV/i, ["TSXV"]],
  [/^Canadian Securities Exchange|^CSE$/i, ["CSE"]],
  [/^NEO|^Cboe Canada/i, ["NEO"]],
  [/^Philippine/i, ["PSE"]],
  [/Thailand/i, ["SET"]],
  [/^Bursa Malaysia|Malaysia/i, ["MYX"]],
  [/^Indonesia/i, ["IDX"]],
  [/^Korea/i, ["KRX"]],
  [/^Taiwan Stock Exchange/i, ["TWSE"]],
  [/^Taipei Exchange|GreTai/i, ["TPEX"]],
  [/^NZX|New Zealand/i, ["NZX"]],
  [/^Mexican|^Bolsa Mexicana|^BIVA/i, ["BMV", "BIVA"]],
  [/^Shanghai/i, ["SSE"]],
  [/^Shenzhen/i, ["SZSE"]],
  [/^Bombay|^BSE\b/i, ["BSE"]],
  [/^National Stock Exchange of India|^NSE India/i, ["NSE"]],
  [/^B3\b|Bovespa|Brasil/i, ["BMFBOVESPA"]],
  [/^Buenos Aires|^Bolsas y Mercados Argentinos|^BYMA/i, ["BCBA"]],
  [/^Santiago/i, ["BCS"]],
  [/^Lima/i, ["BVL"]],
  [/^Colombia/i, ["BVC"]],
  [/^Prague/i, ["PSECZ"]],
  [/^Budapest/i, ["BET"]],
  [/^Luxembourg/i, ["LUXSE"]],
  [/^Cyprus/i, ["CSECY"]],
  [/^Qatar/i, ["QSE"]],
  [/^Saudi|^Tadawul/i, ["TADAWUL"]],
  [/^Abu Dhabi/i, ["ADX"]],
  [/^Dubai/i, ["DFM"]],
  [/^Egypt/i, ["EGX"]],
  [/^Nigeria/i, ["NSENG"]],
  [/^Nairobi/i, ["NSEKE"]],
  [/^Karachi|^Pakistan/i, ["PSX"]],
  [/^Ho Chi Minh/i, ["HOSE"]],
  [/^Hanoi/i, ["HNX", "UPCOM"]],
  [/^Casablanca/i, ["CSEMA"]],
];
const homePlaces = (exchange) => (HOME_PLACES.find(([test]) => test.test(exchange || "")) || [null, []])[1];

// Country -> places, for the name match (3).
const COUNTRY_PLACES = {
  JP: ["TSE"], GB: ["LSE", "AQUIS"], AU: ["ASX"], HK: ["HKEX"], CN: ["HKEX", "SSE", "SZSE"], SG: ["SGX", "SGX-ST"],
  FR: ["EURONEXT"], NL: ["EURONEXT"], BE: ["EURONEXT"], PT: ["EURONEXT"], IE: ["EURONEXT", "LSE"], NO: ["OSL"],
  IT: ["MIL"], DE: ["XETR"], CH: ["SIX", "BX"], SE: ["OMXSTO", "NGM"], FI: ["OMXHEX"], DK: ["OMXCOP"], IS: ["OMXICE"],
  ES: ["BME"], AT: ["VIE"], PL: ["GPW", "NEWCONNECT"], GR: ["ATHEX"], TR: ["BIST"], IL: ["TASE"], ZA: ["JSE"],
  CA: ["TSX", "TSXV", "CSE"], PH: ["PSE"], MY: ["MYX"], ID: ["IDX"], KR: ["KRX"], TW: ["TWSE", "TPEX"],
  NZ: ["NZX"], MX: ["BMV", "BIVA"], IN: ["NSE", "BSE"], BR: ["BMFBOVESPA"], AR: ["BCBA"], CL: ["BCS"], PE: ["BVL"],
  CO: ["BVC"], CZ: ["PSECZ"], HU: ["BET"], LU: ["LUXSE"], CY: ["CSECY"], QA: ["QSE"], SA: ["TADAWUL"], EG: ["EGX"],
  NG: ["NSENG"], KE: ["NSEKE"], PK: ["PSX"], VN: ["HOSE", "HNX", "UPCOM"], MA: ["CSEMA"],
};

// ---- names ----
const LEGAL = new Set(("LTD LIMITED LTEE INC INCORPORATED CORP CORPORATION CO COS COMPANY COMPANIES PLC NV AG SE SA SAS SPA AB ASA AS " +
  "OYJ ABP BHD BERHAD TBK PT PCL PUBLIC KK KABUSHIKI KAISHA GMBH KGAA HLDGS HLDG HOLDINGS HOLDING GROUP GRP THE OF ORD " +
  "ORDINARY SHS SH SHARES SHARE NEW REG REGISTERED BEARER NPV SAB CV DE DEL LA LE ET AND Y E CLASS CL SER SERIES " +
  "UNSP UNSPONSORED SPONSORED ADR ADRS NAMEN AKT AKTIE INH AKTIENGESELLSCHAFT SOCIETE ANONYME ANONIM SIRKETI TAS " +
  "SPOLKA AKCYJNA OY NL VOTING NON PAR VALUE FPO STAPLED SECURITIES SECURITY UNITS UNIT REIT TRUST TR FUND SICAV ETF UCITS LLC LP").split(" "));
// Words that alone do not tell two companies apart.
const GENERIC = new Set(("CHINA JAPAN ASIA ASIAN PACIFIC GLOBAL INTERNATIONAL INTL NATIONAL AMERICAN AMERICA EUROPE EUROPEAN FIRST " +
  "GOLD MINING MINES MINERALS RESOURCES ENERGY BANK FINANCIAL FINANCE CAPITAL INVESTMENT INVESTMENTS TECHNOLOGY TECHNOLOGIES " +
  "INDUSTRIES INDUSTRIAL HONG KONG SINGAPORE AUSTRALIA AUSTRALIAN UNITED NIPPON KOREA THAI DEVELOPMENT PROPERTIES PROPERTY " +
  "REAL ESTATE OIL GAS METALS POWER SYSTEMS SERVICES TRADING ENTERPRISES VENTURES PHARMACEUTICAL PHARMA HEALTH MEDICAL " +
  "LAND WORLD UK BRITISH CANADA CANADIAN INDIA INDIAN EXPLORATION").split(" "));
const CLASS_WORDS = /\b(PREF|PREFS|PREFERENCE|PREFERRED|PRF|PFD|PRD|VORZUG\w*|NON[- ]?VOTING|NON[- ]?VTG|N\/VTG|NVDR|RIGHTS?|WARRANTS?|WTS?|CONV(ERTIBLE)?|DEBENTURES?|NOTES?|BONDS?|PARTLY PAID|CONTINGENT VALUE)\b/;

// The share class a name or ticker states ("SHS A", "CL B", "Class B",
// "CARL.B", "ADDT_B") and its currency line ("BH MACRO LTD USD" / "BH Macro
// Ltd GBP"): a home hit of another class or currency is not the line.
function shareClass(name) {
  const text = ` ${String(name || "").toUpperCase().replace(/[^A-Z0-9]+/g, " ")} `;
  const found = text.match(/ (?:CL|CLASS|SER|SERIES|SHS|SH|SHARES|AK|AKTIE) ([A-H]) /) || text.match(/ ([A-H]) (?:SHS|SHARES|SH) /) || text.match(/ (?:ORD )?([A-H]) (?:NEW |ORD )?$/);
  return found ? found[1] : "";
}
const tickerClass = (ticker) => (String(ticker || "").toUpperCase().match(/[._ /-]([A-H])$/) || [])[1] || "";
const CURRENCY_WORD = / (USD|GBP|EUR|GBX|JPY|CHF|SEK|NOK|DKK|AUD|CAD|HKD|SGD|ZAR)$/;
const nameCurrency = (name) => (` ${String(name || "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim()}`.match(CURRENCY_WORD) || [])[1] || "";

const tokens = (name) => String(name || "")
  .normalize("NFKD").replace(/[̀-ͯ]/g, "").toUpperCase()
  .replace(/&/g, " AND ").replace(/[.'’]/g, "").replace(/[^A-Z0-9]+/g, " ")
  .trim().split(" ").filter((word) => word.length > 1 && !LEGAL.has(word));

function subsequence(short, long) {
  let at = 0;
  for (const char of long) if (char === short[at]) at += 1;
  return at === short.length;
}
// One word of an OTC name (abbreviated: "INDUS", "SMALLR", "INVSTMENT",
// "TECHS", or cut at the 25th character) and one of a list name.
function wordsAgree(a, b) {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length < 2 || short[0] !== long[0]) return false;
  if (short.length === 2) return long.length <= 5 && subsequence(short, long);
  return long.startsWith(short) || (subsequence(short, long) && short.length >= long.length * 0.3);
}
// Every word of the shorter name finds its word in the other (one may miss
// when it has three or more), the first words agree, and at least one
// matched word is not generic.
export function namesAgree(otcName, listName) {
  const a = tokens(otcName);
  const b = tokens(listName);
  if (!a.length || !b.length) return false;
  if (a.join(" ") === b.join(" ")) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (!wordsAgree(a[0], b[0]) && !(a[0] + (a[1] || "") === b[0] || b[0] + (b[1] || "") === a[0])) return false;
  const matched = short.filter((word) => long.some((other) => wordsAgree(word, other)));
  if (short.length - matched.length > (short.length >= 3 ? 1 : 0)) return false;
  return matched.some((word) => !GENERIC.has(word));
}
// The name match (3) drops legal forms only: "Asahi Co., Ltd." and "Asahi
// Holdings, Inc." stay two names.
const LEGAL_FORMS = new Set(("LTD LIMITED LTEE INC INCORPORATED CORP CORPORATION CO COMPANY PLC NV AG SE SA SAS SPA AB ASA AS " +
  "OYJ ABP BHD BERHAD TBK PT PCL PUBLIC KK GMBH KGAA SAB CV DE THE AND LLC LP").split(" "));
const exactName = (name) => String(name || "")
  .normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
  .replace(/&/g, " AND ").replace(/[.'’]/g, "").replace(/[^A-Z0-9]+/g, " ")
  .trim().split(" ").filter((word) => word && !LEGAL_FORMS.has(word)).join(" ");

// ---- the lists ----
let lists = null;
function loadLists() {
  if (lists) return lists;
  const byPlace = new Map();
  const byIsin = new Map();
  for (const file of ["../../assets/etfs.csv", "../../assets/stocks.csv"]) {
    const url = new URL(file, import.meta.url);
    if (!fs.existsSync(url)) continue;
    for (const line of fs.readFileSync(url, "utf8").split(/\r?\n/)) {
      if (!line.trim() || /^ticker\s*,/i.test(line)) continue;
      const columns = line.split(",");
      const ticker = String(columns[0] || "").split(":").pop().trim().toUpperCase();
      const place = String(columns[1] || "").trim().toUpperCase();
      const isin = String(columns[2] || "").trim().toUpperCase();
      const name = columns.slice(3).join(",").replace(/^"|"$/g, "").trim();
      if (!ticker || !place || !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) continue;
      const book = byPlace.get(place) || byPlace.set(place, { tickers: new Map(), names: new Map() }).get(place);
      (book.tickers.get(ticker) || book.tickers.set(ticker, []).get(ticker)).push({ isin, name, place, ticker });
      const key = exactName(name);
      if (key) (book.names.get(key) || book.names.set(key, []).get(key)).push({ isin, name, place, ticker });
      (byIsin.get(isin) || byIsin.set(isin, []).get(isin)).push({ isin, name, place, ticker });
    }
  }
  lists = { byPlace, byIsin };
  return lists;
}

// The ways the lists may write a home ticker ("ADDT.B", "AD.UN", "0700").
function tickerForms(symbol, place) {
  const text = String(symbol || "").trim().toUpperCase();
  if (!text) return [];
  const forms = new Set([text]);
  if (/[.\s/_-]/.test(text)) for (const join of ["_", ".", "-", "/", " "]) forms.add(text.replace(/[.\s/_-]+/g, join));
  if (/^\d+$/.test(text) && ["HKEX", "TSE"].includes(place)) forms.add(text.replace(/^0+/, "") || "0");
  if (/^\d+$/.test(text) && ["SSE", "SZSE", "KRX", "TWSE", "TPEX"].includes(place)) forms.add(text.padStart(6, "0"));
  return [...forms];
}

function validIsin(isin) {
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin) && isinFromCusip(isin.slice(0, 2), isin.slice(2, 11)) === isin;
}

// OTC Markets rows of the other catalogues: mic OTCM, or one of these
// exchange labels, in USD (the "OTC" of swissquote in AUD or of a German
// broker is another market; NOTC is Oslo's).
const OTC_LABELS = new Set(["OTC MARKETS", "OTC", "PINK", "USOTC", "OOTC", "OOTC (OTHER OTC)", "OTCM", "CDI OTCM", "OTC PINK LIMITED", "FINRA OTC BULLETIN BOARD"]);
function otherCatalogues(self) {
  const said = new Map();
  const root = new URL("../", import.meta.url);
  for (const folder of fs.readdirSync(root)) {
    if (folder === self) continue;
    const file = new URL(`${folder}/${folder}-parsed.json`, root);
    if (!fs.existsSync(file)) continue;
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    for (const row of Array.isArray(parsed) ? parsed : parsed?.rows || []) {
      if (!row || typeof row !== "object") continue;
      const label = String(row.exchange || "").trim().toUpperCase();
      if (row.mic !== "OTCM" && !OTC_LABELS.has(label)) continue;
      if (row.currency && row.currency !== "USD") continue;
      const isin = String(row.isin || "").trim().toUpperCase();
      if (!validIsin(isin)) continue;
      const ticker = String(row.ticker || "").trim().toUpperCase();
      if (!/^[A-Z]{1,6}$/.test(ticker)) continue;
      const entry = said.get(ticker) || said.set(ticker, new Map()).get(ticker);
      const seen = entry.get(isin) || entry.set(isin, { folders: new Set(), names: new Set() }).get(isin);
      seen.folders.add(folder);
      if (row.name) seen.names.add(String(row.name));
    }
  }
  return said;
}

// rows: the catalogue's rows; open: the OTC rows to fill; stockOf(symbol):
// the screener line; homes: otcHomes(). Fills row.isin, returns counts and
// the lines left out with the reason.
export function otcIsinsFromHome(rows, open, stockOf, homes, self = "moomoous") {
  const { byPlace, byIsin } = loadLists();
  const said = otherCatalogues(self);
  const counts = { home: 0, homeAndCatalogues: 0, catalogues: 0, name: 0 };
  const doubtful = [];
  const renamed = [];
  const assigned = [];
  const chosen = new Map();

  const listHas = (isin) => byIsin.get(isin) || [];
  const namesOf = (row, home) => [row.name, home?.issueName, home?.company].filter(Boolean);
  const anyAgrees = (names, other) => names.some((name) => namesAgree(name, other));

  for (const row of open) {
    const home = homes.get(row.ticker);
    const stock = stockOf(row.ticker);
    const names = namesOf(row, home);
    const adr = Boolean(home?.isAdr) || /\b(ADRs?|GDRs?|Depositary|New York Registry)\b/i.test(`${stock?.type || ""} ${home?.className || ""} ${home?.typeName || ""}`)
      || /\b(S\/GDR|GDRS?|ADRS?|ADS|SPON(SORED)? DR|UNSP(ONSORED)? DR)\b/i.test(`${row.name} ${home?.issueName || ""}`);
    const etf = /^(ETFs|Structured Product)$/.test(stock?.type || "") || row.type === "ETF" || /\bETF\b/i.test(home?.typeName || "");
    const otcClass = CLASS_WORDS.test(`${row.name} ${home?.issueName || ""} ${home?.className || ""} ${stock?.type || ""}`.toUpperCase());
    const nvdr = /\b(NVDR|N\/?VTG|NON[- ]?VTG|NON[- ]?VOTING)\b/i.test(`${row.name} ${home?.issueName || ""}`);
    const countries = new Set([home?.country, ...(home?.incorporated || []), countryCode(home?.homeCountry), countryCode(stock?.country)].map((code) => countryCode(code)).filter(Boolean));
    // An ADR's ISIN is the depositary's (US); any other line's is its
    // issuer's, of a country OTC Markets gives or an offshore domicile.
    // OTC Markets files many Hong Kong and Macau companies under China.
    if (countries.has("CN")) for (const code of ["HK", "MO"]) countries.add(code);
    const plausible = (isin) => (adr ? isin.startsWith("US") : !countries.size || countries.has(isin.slice(0, 2)) || OFFSHORE.has(isin.slice(0, 2)));

    // 1. home listing
    let fromHome = null;
    let homeNote = "";
    const places = homePlaces(home?.homeExchange);
    let tickerFound = false;
    if (home?.homeSymbol && places.length && !adr) {
      const hits = [];
      for (const place of places) {
        const book = byPlace.get(place);
        if (!book) continue;
        // A Thai NVDR line is the ".R" line of its home ticker.
        const symbol = place === "SET" && nvdr && !/\.R$/i.test(home.homeSymbol) ? `${home.homeSymbol}.R` : home.homeSymbol;
        for (const form of tickerForms(symbol, place)) hits.push(...(book.tickers.get(form) || []));
      }
      tickerFound = hits.length > 0;
      const isins = [...new Set(hits.map((hit) => hit.isin))];
      if (isins.length === 1) {
        const isin = isins[0];
        const listNames = hits.map((hit) => hit.name);
        // A preferred or non-voting OTC line needs a home line that says so
        // too, and an ordinary one a home line that does not.
        const classMismatch = otcClass !== listNames.some((name) => CLASS_WORDS.test(name.toUpperCase()));
        const ownClass = shareClass(row.name) || shareClass(home.issueName);
        const homeClass = tickerClass(home.homeSymbol) || hits.map((hit) => shareClass(hit.name) || tickerClass(hit.ticker)).find(Boolean) || "";
        const ownCurrency = nameCurrency(row.name) || nameCurrency(home.issueName);
        const homeCurrency = hits.map((hit) => nameCurrency(hit.name)).find(Boolean) || "";
        if (!validIsin(isin)) homeNote = `home ${isin} fails its check digit`;
        else if (ownClass && homeClass && ownClass !== homeClass) homeNote = `home ${hits[0].place}:${hits[0].ticker} is class ${homeClass}, the OTC line class ${ownClass}`;
        else if (ownCurrency && homeCurrency && ownCurrency !== homeCurrency) homeNote = `home ${hits[0].place}:${hits[0].ticker} is the ${homeCurrency} line, the OTC line ${ownCurrency}`;
        else if (classMismatch) homeNote = `home ${hits[0].place}:${hits[0].ticker} is "${listNames[0]}" (another class)`;
        // A Thai share has a local line and a foreign-board line, each
        // with its ISIN, and the lists have only the local one: the OTC
        // line may be either (fsmonemy gives the foreign board's for
        // AVIKF "ADVANCED INFO SVC PLC FGN"), so a Thai home hit needs a
        // second source. Its NVDR (".R") line is one line only.
        // So does a Shanghai or Shenzhen hit (an A-share: the OTC line of a
        // Chinese company is mostly its H share, GUOSF Guotai Haitong) and
        // a UCITS ETF (its umbrella has many share classes, the OTC name
        // seldom says which: ISVXF "ISHARES IV PLC CNA ETF").
        else fromHome = { isin, weak: (hits[0].place === "SET" && !nvdr) || ["SSE", "SZSE"].includes(hits[0].place) || etf, plausible: plausible(isin), agrees: listNames.some((name) => anyAgrees(names, name)), list: `${hits[0].place}:${hits[0].ticker} "${listNames[0]}"` };
      } else if (isins.length > 1) {
        homeNote = `home ${home.homeExchange} ${home.homeSymbol} gives ${isins.length} ISINs`;
      }
    } else if (home?.homeSymbol && !places.length && !adr) {
      homeNote = `home exchange "${home.homeExchange}" not mapped`;
    }

    // 2. other catalogues
    let fromCatalogues = null;
    let catNote = "";
    const entry = said.get(row.ticker);
    if (entry) {
      if (entry.size === 1) {
        const [isin, seen] = [...entry][0];
        const agrees = [...seen.names].some((name) => anyAgrees(names, name)) || listHas(isin).some((hit) => anyAgrees(names, hit.name));
        fromCatalogues = { isin, agrees, plausible: plausible(isin), folders: [...seen.folders] };
      } else {
        catNote = `catalogues disagree: ${[...entry.keys()].join(", ")}`;
      }
    }

    let isin = "";
    let method = "";
    const away = (found) => `${found.isin} not of ${[...countries].join("/")}`;
    if (fromHome && fromCatalogues) {
      if (fromHome.isin === fromCatalogues.isin) {
        // Two sources give it for this OTC symbol: taken even with a
        // country outside the expected ones (an Irish company OTC Markets
        // files under the UK, a Singapore fund listed in Toronto) or a name
        // that does not agree (a renamed company: ADVA Optical Networking,
        // now Adtran Networks SE, same ISIN). Those are counted apart.
        if (!fromHome.agrees && !fromCatalogues.agrees) renamed.push({ ticker: row.ticker, name: row.name, isin: fromHome.isin, list: fromHome.list });
        isin = fromHome.isin;
        method = "homeAndCatalogues";
      } else {
        doubtful.push({ ticker: row.ticker, name: row.name, reason: `home ${fromHome.list} ${fromHome.isin} vs catalogues ${fromCatalogues.isin} (${fromCatalogues.folders.slice(0, 3).join(", ")})` });
        continue;
      }
    } else if (fromHome) {
      if (fromHome.weak) {
        doubtful.push({ ticker: row.ticker, name: row.name, reason: `home ${fromHome.list} ${fromHome.isin}: one source only for a Thai, A-share or ETF line`, soft: true });
        continue;
      }
      if (!fromHome.plausible) {
        doubtful.push({ ticker: row.ticker, name: row.name, reason: `home ${fromHome.list} ${away(fromHome)}`, soft: true });
        continue;
      }
      if (fromHome.agrees) {
        isin = fromHome.isin;
        method = "home";
      } else {
        doubtful.push({ ticker: row.ticker, name: row.name, reason: `home ${fromHome.list} ${fromHome.isin}: name does not agree` });
        continue;
      }
    } else if (fromCatalogues) {
      if (!fromCatalogues.plausible) {
        doubtful.push({ ticker: row.ticker, name: row.name, reason: `catalogues ${away(fromCatalogues)}`, soft: true });
        continue;
      }
      if (fromCatalogues.agrees) {
        isin = fromCatalogues.isin;
        method = "catalogues";
      } else {
        doubtful.push({ ticker: row.ticker, name: row.name, reason: `catalogues ${fromCatalogues.isin} (${[...entry.values()][0].names.values().next().value}): name does not agree` });
        continue;
      }
    }

    // 3. name, when there is no home ticker to go by
    if (!isin && !adr && (!home?.homeSymbol || (places.length && !tickerFound)) && home?.company) {
      const key = exactName(home.company);
      const issuer = countryCode(home.country) || countryCode(stock?.country) || countryCode(home.homeCountry);
      // Not on SET: the name gives the local line, the OTC line may be the
      // foreign board's (see 1).
      const scope = (places.length ? places : COUNTRY_PLACES[issuer] || []).filter((place) => place !== "SET");
      if (key && issuer && scope.length) {
        const hits = scope.flatMap((place) => byPlace.get(place)?.names.get(key) || []);
        const isins = [...new Set(hits.map((hit) => hit.isin))];
        const allowed = new Set([issuer, ...(home.incorporated || []).map(countryCode)]);
        if (isins.length === 1 && validIsin(isins[0]) && allowed.has(isins[0].slice(0, 2)) && !(!otcClass && hits.some((hit) => CLASS_WORDS.test(hit.name.toUpperCase())))) {
          isin = isins[0];
          method = "name";
          row._nameKey = key;
        } else if (isins.length > 1) {
          homeNote ||= `name "${home.company}" gives ${isins.length} ISINs on ${scope.join("/")}`;
        } else if (isins.length === 1) {
          homeNote ||= `name "${home.company}" gives ${isins[0]}, not of ${[...allowed].join("/")}`;
        }
      }
    }
    if (!isin) {
      if (homeNote || catNote) doubtful.push({ ticker: row.ticker, name: row.name, reason: [homeNote, catNote].filter(Boolean).join("; "), soft: true });
      continue;
    }
    chosen.set(row, { isin, method });
  }

  // A name the name match used must belong to one OTC line only.
  const nameUse = new Map();
  for (const [row] of chosen) if (row._nameKey) nameUse.set(row._nameKey, (nameUse.get(row._nameKey) || 0) + 1);
  for (const row of open) {
    const key = exactName(homes.get(row.ticker)?.company);
    if (key && nameUse.has(key) && !row._nameKey) nameUse.set(key, nameUse.get(key) + 1);
  }
  // An ISIN goes to one OTC line only.
  const holders = new Map();
  for (const row of rows) if (row.mic === "OTCM" && row.isin) (holders.get(row.isin) || holders.set(row.isin, []).get(row.isin)).push(row.ticker);
  for (const [row, { isin }] of chosen) (holders.get(isin) || holders.set(isin, []).get(isin)).push(row.ticker);
  for (const [row, { isin, method }] of chosen) {
    const key = row._nameKey;
    delete row._nameKey;
    if (key && nameUse.get(key) > 1) {
      doubtful.push({ ticker: row.ticker, name: row.name, reason: `name "${key}" is shared by ${nameUse.get(key)} OTC lines` });
      continue;
    }
    const holding = holders.get(isin);
    if (holding.length > 1) {
      doubtful.push({ ticker: row.ticker, name: row.name, reason: `${isin} (${method}) would also be ${holding.filter((ticker) => ticker !== row.ticker).join(", ")}` });
      continue;
    }
    row.isin = isin;
    delete row.matches;
    counts[method] += 1;
    assigned.push({ ticker: row.ticker, isin, method });
  }
  return { counts, doubtful, assigned, renamed: renamed.filter((item) => open.find((row) => row.ticker === item.ticker)?.isin === item.isin) };
}
