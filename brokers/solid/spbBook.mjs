// SPB Exchange (ПАО «СПБ Биржа», St Petersburg) equity listing, read from
// the exchange's own public site API (no login, no token), for the
// brokers that sell what trades on SPB Exchange.
//
// Two lists of the exchange are read and joined on the exchange's own
// security id (idSecurities):
//
//   the lists of instruments admitted to trading, Russian and foreign
//   ("Перечень инструментов"), with ISIN, kind, category and currency
//     https://spbexchange.ru/api/listing/v1/instruments/ru/list?page=0&size=5000
//     https://spbexchange.ru/api/listing/v1/instruments/eng/list?page=0&size=5000
//
//   the boards of the market-data page ("Биржевая информация о ходе
//   торгов", https://spbexchange.ru/market-data/): every admitted line with
//   its current price and the day's trades
//     https://spbexchange.ru/api/reader/marketdata/default/rus
//     https://spbexchange.ru/api/reader/marketdata/default/eqf
//
// Since the US sanctions of November 2023 the foreign lines (US shares,
// depositary receipts and ETFs, Hong Kong shares and ETFs, the euro and
// tenge lines) are frozen: still on the list, no trade. The foreign board
// keeps showing their last price of 2023, so a price there is no sign of
// trading. Hence:
//   - a Russian-segment line counts when the board shows a price for it
//     (current or last trade price). A line with no price at all ("-") is
//     not trading (suspended, or admitted and not yet started);
//   - a foreign-segment line counts only when it has traded today. In
//     October 2026 none has, so the foreign segment gives no row; the
//     count is printed by `node brokers/solid/spbBook.mjs`.
// SPB trades every day of the week, 07:00-23:50 Moscow time on weekdays and
// 10:00-23:50 at weekends; the boards and their last prices do not reset in
// between, so the Russian segment can be read at any hour.
//
// Kinds: shares ("Акции": ordinary, preferred) and depositary receipts are
// STOCK; units of exchange-traded funds (category "... биржевого паевого
// инвестиционного фонда ..." or kind "ETF") are ETF; other unit funds
// (closed-end ZPIF, interval IPIF) are FUND and left out; bonds are left
// out. SPB writes "@" after the tickers of the Moscow Exchange funds it
// relists (TMOS@); the ticker is stored without it.
//
// The rouble is written RUB; the foreign lines are quoted in USD, HKD, EUR
// or KZT.
//
// spbexchange.ru presents a chain that Node does not trust (Russian
// national root CA), so the requests go through the lenient agent of
// ../sber/moexBook.mjs (the curl -k equivalent).

import { resolveVenue } from "../../spreads/venues.mjs";
import { getPage } from "../sber/moexBook.mjs";

export const SPB = { exchange: "SPB Exchange", mic: "XPET" };

const API = "https://spbexchange.ru/api";
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
const CURRENCY = {
  "Российский рубль": "RUB",
  "Доллар США": "USD",
  "Гонконгский доллар": "HKD",
  Евро: "EUR",
  Тенге: "KZT",
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

async function getJson(url) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const page = await getPage(url, { lenient: true, headers: { Accept: "application/json" } });
      if (page.status === 200) return JSON.parse(page.body.toString("utf8"));
      last = `${page.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(2000 * (attempt + 1));
  }
  throw new Error(last);
}

async function instruments(segment) {
  const body = await getJson(`${API}/listing/v1/instruments/${segment}/list?page=0&size=5000`);
  if (!Array.isArray(body.content) || !body.last) throw new Error(`SPB ${segment} list: unexpected answer`);
  if (body.content.length !== body.totalElements) throw new Error(`SPB ${segment} list: ${body.content.length} of ${body.totalElements}`);
  return body.content;
}

function kindOf(item) {
  const kind = normalize(item.instrumentKind);
  const category = normalize(item.instrumentCategory);
  if (kind === "Облигации") return "BOND";
  if (kind === "Акции" || kind === "Депозитарные расписки") return "STOCK";
  if (kind === "ETF") return "ETF";
  if (/паи/i.test(kind)) return /биржевого (паевого )?инвестиционного фонда/i.test(category) ? "ETF" : "FUND";
  throw new Error(`SPB ${item.srtsCode}: kind ${kind}`);
}

function hasPrice(value) {
  return /\d/.test(String(value ?? ""));
}

// Every admitted line of both segments, with its trading state:
// [{ id, ticker, code, name, category, isin, currency, kind, segment,
//    price, trades, trading }].
export async function spbBook() {
  const lines = [];
  for (const [segment, board] of [
    ["ru", "rus"],
    ["eng", "eqf"],
  ]) {
    const listed = await instruments(segment);
    await sleep(1000);
    const quotes = await getJson(`${API}/reader/marketdata/default/${board}`);
    if (!Array.isArray(quotes) || quotes.length < listed.length / 2) throw new Error(`SPB ${board} board: ${quotes?.length} lines`);
    const byId = new Map(quotes.map((quote) => [quote.idSecurities, quote]));
    for (const item of listed) {
      const quote = byId.get(item.idSecurities) || {};
      const currency = CURRENCY[normalize(item.classCurrency)] || normalize(quote.currPrice).toUpperCase();
      const kind = kindOf(item);
      const isin = normalize(item.sisinCode).toUpperCase();
      const trades = Number(quote.tradesNumTotalAggr) || 0;
      const priced = hasPrice(quote.currentPrice) || hasPrice(quote.lastPriceAggr);
      lines.push({
        id: item.idSecurities,
        code: normalize(item.srtsCode),
        ticker: normalize(item.srtsCode).replace(/@$/, ""),
        name: normalize(item.efullName),
        shortName: normalize(quote.fullnameRu),
        category: normalize(item.instrumentCategory),
        isin: ISIN.test(isin) ? isin : "",
        currency,
        kind,
        segment,
        price: normalize(quote.currentPrice),
        trades,
        // See the header: a price on the Russian board, a trade today on
        // the foreign one.
        trading: segment === "ru" ? priced || trades > 0 : trades > 0,
      });
    }
  }
  return lines;
}

// A catalogue row for one SPB line. `name` overrides the exchange name,
// `notes` go to raw.
export function spbRow(line, { name = "", notes = [] } = {}) {
  const row = {
    query: line.ticker,
    ticker: line.ticker,
    name: normalize(name) || line.shortName || line.name,
    exchange: SPB.exchange,
    mic: SPB.mic,
    currency: line.currency,
    type: line.kind,
    isin: line.isin,
    raw: [
      line.code,
      line.shortName,
      line.name,
      line.isin,
      line.category,
      line.currency,
      `${line.segment === "ru" ? "Russian" : "foreign"} segment`,
      `price ${line.price || "-"}, ${line.trades} trades today`,
      ...notes,
    ]
      .map(normalize)
      .filter(Boolean)
      .join(" | "),
  };
  const { venue } = resolveVenue(row);
  if (!venue || venue.mic !== row.mic) throw new Error(`${row.ticker}: no venue for ${row.exchange}`);
  return row;
}

// The rows of a broker that sells what trades on SPB Exchange: STOCK and
// ETF lines that trade, quoted in one of `currencies` (null = any).
// Everything else is counted in `left`.
export async function spbCatalogue({ currencies = ["RUB"], segments = ["ru", "eng"], notes = [] } = {}) {
  const lines = await spbBook();
  const rows = [];
  const left = {};
  const leave = (reason) => (left[reason] = (left[reason] || 0) + 1);
  const seen = new Set();
  for (const line of lines) {
    if (line.kind === "BOND") {
      leave("bond");
      continue;
    }
    if (line.kind === "FUND") {
      leave("unit fund, not an ETF");
      continue;
    }
    if (!segments.includes(line.segment)) {
      leave(`${line.segment} segment not sold`);
      continue;
    }
    if (!line.trading) {
      leave(line.segment === "ru" ? "Russian segment: no price on the board (not trading)" : "foreign segment: no trade today (frozen since November 2023)");
      continue;
    }
    if (currencies && !currencies.includes(line.currency)) {
      leave(`${line.kind} quoted in ${line.currency}, not an account currency`);
      continue;
    }
    const key = `${line.isin || line.ticker}|${line.currency}`;
    if (seen.has(key)) throw new Error(`SPB ${key} twice`);
    seen.add(key);
    rows.push(spbRow(line, { notes }));
  }
  return { rows, left, lines };
}

// Floors and anchor lines a full SPB catalogue must hold (Russian segment,
// October 2026: about 200 shares and 15 exchange funds trade).
export function checkSpbFloors(rows, { stocks = 150, etfs = 8, anchors = SPB_ANCHORS } = {}) {
  const count = (type) => rows.filter((row) => row.mic === SPB.mic && row.type === type).length;
  if (count("STOCK") < stocks) throw new Error(`only ${count("STOCK")} SPB shares`);
  if (count("ETF") < etfs) throw new Error(`only ${count("ETF")} SPB ETFs`);
  for (const [isin, label] of anchors) {
    if (!rows.some((row) => row.mic === SPB.mic && row.isin === isin)) throw new Error(`${label} (${isin}) is missing on SPB`);
  }
}

export const SPB_ANCHORS = [
  ["RU0007661625", "Gazprom"],
  ["RU0009024277", "Lukoil"],
  ["RU000A101X76", "TMOS ETF"],
];

if (import.meta.url === `file://${process.argv[1]}`) {
  const { rows, left, lines } = await spbCatalogue({ currencies: null });
  const counts = {};
  for (const row of rows) counts[`${row.type} ${row.currency}`] = (counts[`${row.type} ${row.currency}`] || 0) + 1;
  console.log(`${lines.length} admitted lines, ${rows.length} kept`, counts);
  console.log("left out:", left);
}
