// The whole Baku Stock Exchange (BSE, Bakı Fond Birjası, MIC XIBE) share
// book, read from the exchange's own public pages, for any broker whose only
// place is the BSE.
//
// The BSE "Issuers" page sends to the Market Watch: "You can obtain more
// detailed information about the issuers of the Baku Stock Exchange by
// clicking on the link below: https://www.bfb.az/en/market-watch". Its
// "Equity" tab (table #equity_table) prints every listed share: ISIN, issuer,
// listing date, last traded price and date, underwriter, quantity, nominal,
// capitalization, and the segment (row class "main" = Main market, otherwise
// Standard market; the Growth market has no share today). The same list is
// the "Download" file https://www.bfb.az/listing-issuers/download/1.
//   https://www.bfb.az/en/issuers
//   https://www.bfb.az/en/market-watch
//   https://www.bfb.az/en/listing   (segments: Main, Standard, Growth)
//
// Each issuer page (linked from the table) prints the instrument card of the
// share: "Type: Common shares", "Market segment", "Currency: AZN". The
// currency and the share type are taken from that card; a line whose card is
// missing stops the run. A few English links lead to a 404; then the issuer
// link of the Azerbaijani Market Watch (https://www.bfb.az/az/bazara-baxis)
// is tried. When neither page exists, the line keeps AZN, the currency of
// every other card and of the Market Watch capitalisation (₼), and raw says
// so. A few cards print an exchange code ("Tiker: NKYBN"; most print "xx"
// or nothing); a real one goes into raw.
//
// Lines left out:
//   - suspended or delisted lines. The BSE has no standing suspension list;
//     it announces suspensions and delistings on its "Disclosures" page
//     (https://www.bfb.az/en/news), e.g. "the shares of "Unicapital
//     Investment Company" OJSC with ISIN code AZ1002006943 will be suspended
//     from trading and delisted" (Listing Committee, 11 June 2026). Every
//     disclosure whose title speaks of a suspension, delisting, exclusion or
//     halt is read, and each ISIN it names is dropped, unless the post says
//     the suspension "applies only to <date>" or trading resumes on a date
//     that has passed (the price-corridor halt of ABB on 20 October 2026
//     "applies only to 20 October 2026").
//   - a delisted share also leaves the Market Watch table, so it is gone
//     either way.
// The BSE lists no ETF, ETN or ETC (its tradable instruments are Equity,
// Bond and Repo: https://www.bfb.az/en/equity); bonds, CBAR notes and repo
// stay out.
//
// The BSE Market Watch prints no ticker symbols (only a few issuer cards
// carry one): the ISIN is the ticker and the query, as for other places
// without symbols. The ISIN comes from the exchange.
// Many lines have not traded since their placement (last trade date equal to
// the listing date); they stay, and raw says "no trade since listing".
//
//   import { bakuBook } from "../xalq/bakuBook.mjs";
//   const rows = await bakuBook();
//
//   node brokers/xalq/bakuBook.mjs   (prints the counts)

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const MARKET_WATCH = "https://www.bfb.az/en/market-watch";
const MARKET_WATCH_AZ = "https://www.bfb.az/az/bazara-baxis";
const DISCLOSURES = "https://www.bfb.az/en/news";
const SEGMENTS = { main: "Main market", standard: "Standard market", growth: "Growth market" };
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const FLOOR = 20;

function decode(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;|&#8217;|&rsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function get(url, { missingOk = false } = {}) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html" },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) return response.text();
      if (missingOk && response.status === 404) return null;
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await sleep(800 * (attempt + 1));
  }
  throw new Error(last);
}

function isinOf(value) {
  const text = decode(value).toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(text) ? text : "";
}

// "20 October 2026" -> Date (UTC midnight), or null.
function englishDate(text) {
  const m = String(text).match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) return null;
  const month = MONTHS.indexOf(m[2].toLowerCase());
  return month < 0 ? null : new Date(Date.UTC(Number(m[3]), month, Number(m[1])));
}

// Market Watch, Equity tab: one entry per listed share.
async function listedShares() {
  const page = await get(MARKET_WATCH);
  const table = page.match(/<table[^>]*id="equity_table"[^>]*>([\s\S]*?)<\/table>/)?.[1];
  if (!table) throw new Error("BSE: no equity_table on the Market Watch");
  const header = [...(table.match(/<thead>([\s\S]*?)<\/thead>/)?.[1] || "").matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => decode(m[1]));
  const expected = ["ISIN code", "Issuer name", "Listing Date", "Last Traded Price", "Last Trade Date", "Underwriter", "Quantity"];
  if (expected.some((name, i) => header[i] !== name)) throw new Error(`BSE: unexpected equity header ${header.join("|")}`);
  const shares = [];
  for (const [, cls, body] of table.matchAll(/<tr class="([^"]*)"[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...body.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    const isin = isinOf(cells[0]);
    if (!isin) throw new Error(`BSE: unreadable equity row ${decode(body).slice(0, 120)}`);
    const link = cells[1].match(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!link) throw new Error(`BSE: no issuer link for ${isin}`);
    const segmentKey = Object.keys(SEGMENTS).find((key) => cls.split(/\s+/).includes(key));
    if (!segmentKey) throw new Error(`BSE: unknown segment class "${cls}" for ${isin}`);
    shares.push({
      isin,
      name: decode(link[2]),
      issuerUrl: link[1].replace(/^https:\/\/bfb\.az\//, "https://www.bfb.az/"),
      segment: SEGMENTS[segmentKey],
      listed: decode(cells[2]),
      lastPrice: decode(cells[3]),
      lastTrade: decode(cells[4]),
      underwriter: decode(cells[5]),
    });
  }
  if (shares.length < FLOOR) throw new Error(`BSE: only ${shares.length} shares on the Market Watch`);
  return shares;
}

// Issuer page: the instrument card whose ISIN is the share's. The
// Azerbaijani page names the fields in Azerbaijani; they are mapped to the
// English names.
const AZ_FIELDS = {
  "İSİN": "ISIN",
  "Valyuta": "Currency",
  "Növü": "Type",
  "İnvestisiya qiymətli kağızı": "Investment security",
  "Tiker": "Ticker",
  "Bazar seqmenti": "Market segment",
};
const AZ_VALUES = { "Səhm": "Stock", "Sənədsiz adi": "Common shares (uncertificated)", "Sənədsiz imtiyazlı": "Preferred shares (uncertificated)" };

function instrumentCard(page, isin) {
  for (const [, card] of page.matchAll(/<div class="card_holder instrument_holder[^"]*"[^>]*>([\s\S]*?)(?=<div class="card_holder instrument_holder|<!-- Hesabatlar Tab -->|$)/g)) {
    const fields = {};
    for (const [, title, detail] of card.matchAll(/<div class="card_title">([\s\S]*?)<\/div>\s*<div class="card_detail">([\s\S]*?)<\/div>/g)) {
      const key = decode(title).replace(/:$/, "");
      const value = decode(detail);
      fields[AZ_FIELDS[key] || key] = AZ_VALUES[value] || value;
    }
    if (fields.ISIN === isin) return fields;
  }
  return null;
}

// Azerbaijani Market Watch: ISIN -> issuer page link, for the English links
// that lead to a 404.
async function azerbaijaniLinks() {
  const page = await get(MARKET_WATCH_AZ);
  const table = page.match(/<table[^>]*id="equity_table"[^>]*>([\s\S]*?)<\/table>/)?.[1];
  if (!table) throw new Error("BSE: no equity_table on the Azerbaijani Market Watch");
  const links = new Map();
  for (const [, body] of table.matchAll(/<tr class="[^"]*"[^>]*>([\s\S]*?)<\/tr>/g)) {
    const isin = isinOf(body.match(/<td[^>]*>([\s\S]*?)<\/td>/)?.[1]);
    const link = body.match(/<a href="([^"]+)"/)?.[1];
    if (isin && link) links.set(isin, link.replace(/^https:\/\/bfb\.az\//, "https://www.bfb.az/"));
  }
  return links;
}

// Disclosures: ISINs under a suspension or delisting still in force.
async function suspendedIsins(log) {
  const page = await get(DISCLOSURES);
  const posts = [...page.matchAll(/<div class="date">([^<]*)<\/div>\s*<a href="([^"]+)" class="post_title">([\s\S]*?)<\/a>/g)]
    .map(([, date, url, title]) => ({ date: decode(date), url, title: decode(title) }));
  if (!posts.length) throw new Error("BSE: no post on the Disclosures page");
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const dropped = new Map();
  for (const post of posts.filter((p) => /suspen|delist|exclu|halt|terminat|cancel/i.test(p.title) || /Listing Committee/i.test(p.title))) {
    await sleep(700);
    const html = await get(post.url);
    const body = decode(html.match(/<div class="text_editor[^"]*">([\s\S]*?)<\/div>/)?.[1] || "");
    if (!body) throw new Error(`BSE: empty disclosure ${post.url}`);
    const isins = [...new Set(body.match(/\bAZ[0-9A-Z]{9}\d\b/g) || [])];
    if (!/suspen|delist|exclu|halt|terminat/i.test(body)) continue;
    const onlyTo = englishDate(body.match(/applies only to ([^.,;]+)/i)?.[1] || "");
    const resumes = englishDate(body.match(/resume[sd]?[^.]*?on (?:the next business day, )?(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i)?.[1] || "");
    const lifted = (onlyTo && onlyTo.getTime() < todayUtc) || (resumes && resumes.getTime() <= todayUtc);
    for (const isin of isins) {
      if (lifted) { log(`BSE: ${isin} kept, "${post.title}" (${post.date}) is over`); continue; }
      dropped.set(isin, `${post.date}: ${post.title}`);
    }
  }
  return dropped;
}

// Returns one row per BSE share that trades: { query, ticker, name, exchange,
// mic, currency, type, isin, raw }; raw starts with the segment.
// segments: which segments to keep ("Main market", "Standard market",
// "Growth market"); default all.
export async function bakuBook({ segments = Object.values(SEGMENTS), log = console.error } = {}) {
  const shares = await listedShares();
  await sleep(700);
  const dropped = await suspendedIsins(log);
  const rows = [];
  let azLinks = null;
  for (const share of shares) {
    if (!segments.includes(share.segment)) continue;
    if (dropped.has(share.isin)) { log(`BSE: ${share.isin} ${share.name} dropped, ${dropped.get(share.isin)}`); continue; }
    await sleep(700);
    let source = share.issuerUrl;
    let issuerPage = await get(source, { missingOk: true });
    if (issuerPage === null) {
      azLinks ||= await azerbaijaniLinks();
      const azUrl = azLinks.get(share.isin);
      if (azUrl) {
        await sleep(700);
        source = azUrl;
        issuerPage = await get(azUrl, { missingOk: true });
      }
    }
    let card;
    if (issuerPage === null) {
      log(`BSE: ${share.isin} ${share.name}: no issuer page (404 in English and Azerbaijani), currency AZN assumed`);
      card = { Currency: "AZN", Type: "issuer page missing, currency AZN assumed" };
    } else {
      card = instrumentCard(issuerPage, share.isin);
      if (!card) throw new Error(`BSE: no instrument card for ${share.isin} on ${source}`);
      if (card["Investment security"] !== "Stock") throw new Error(`BSE: ${share.isin} is a ${card["Investment security"]}`);
      if (!/^[A-Z]{3}$/.test(card.Currency || "")) throw new Error(`BSE: no currency for ${share.isin}`);
    }
    rows.push({
      query: share.isin,
      ticker: share.isin,
      name: share.name,
      exchange: "Baku Stock Exchange",
      mic: "XIBE",
      currency: card.Currency,
      type: "STOCK",
      isin: share.isin,
      raw: [
        share.segment,
        share.isin,
        share.name,
        card.Type || "",
        /^[A-Z][A-Z0-9]{2,}$/.test(card.Ticker || "") ? `exchange code ${card.Ticker}` : "",
        `listed ${share.listed}`,
        `last trade ${share.lastTrade} at ${share.lastPrice}`,
        share.lastTrade === share.listed ? "no trade since listing" : "",
        `underwriter ${share.underwriter}`,
      ].filter(Boolean).join(" | "),
    });
  }
  rows.sort((left, right) => left.name.localeCompare(right.name));
  return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = await bakuBook();
  const counts = {};
  for (const row of rows) { const key = `${row.raw.split(" | ")[0]} ${row.type} ${row.currency}`; counts[key] = (counts[key] || 0) + 1; }
  console.error(`${rows.length} BSE lines`, counts, `no trade since listing: ${rows.filter((r) => r.raw.includes("no trade since listing")).length}`);
  for (const row of rows) console.log(`${row.isin}\t${row.name}\t${row.raw}`);
}
