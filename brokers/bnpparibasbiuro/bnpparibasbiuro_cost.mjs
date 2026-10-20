// What one round trip costs at Biuro Maklerskie BNP Paribas Bank Polska:
// buy n shares at price p and sell them straight back, in dollars.
//
// Taryfa prowizji i opłat (PDF of 16 February 2026; no date of entry into
// force is printed), read on 2026-10-18:
//   https://www.bnpparibas.pl/_fileserver/item/1520011
//   https://www.bnpparibas.pl/repozytorium-biura-maklerskiego/taryfy-oplat-i-prowizji
//
// A1, domestic cash market in PLN (GPW, NewConnect and GlobalConnect, all
// quoted in złoty), internet column:
//   0.35 % of the executed order, minimum 5 zł. A same-day reversing sale
//   is charged 0.19 % (the difference is refunded within three days); this
//   ticket keeps the position, so that is the remark. Phone and branch
//   orders are 0.80 % min 8 zł, another channel.
//
// A4.1, foreign cash markets. Orders are taken by phone only (8:30-17:30)
// and executed through Saxo Bank A/S, or EXANE Ltd as backup. There is no
// internet channel for them, so the phone column is the only ticket and
// a foreign line answers onlineBuy false:
//   USA, Euronext Paris, Brussels, Amsterdam, Xetra
//                              0.95 %, min 20 EUR / 20 USD / 20 GBP
//   United Kingdom             0.95 %, min 20; shares of Irish companies
//                              1.29 %, min 27
//   Italy                      0.95 %, min 25
//   Austria, Luxembourg        0.95 %, min 30
//   Other EU places, OTC incl. 0.95 %, min 25
// The commission is taken in the listing currency, and the minimum is in
// that currency. The minimum transaction is 10 000 USD/EUR/GBP: a smaller
// order is refused, so it answers N/A rather than a price. The foreign
// markets page says these commissions already include stamp duty,
// transaction taxes and other local charges, so nothing from taxMap is
// added on a foreign line, and no SEC fee either. Frankfurt, gettex,
// Stuttgart, Madrid, Dublin and Helsinki are the « other EU » row: the
// German row names Xetra only. A US OTC line takes the USA row. An Irish
// UCITS ETF on London is not a share of an Irish company and takes the
// 0.95 % row, even where the broker's own list calls it « Akcja ».
//   https://www.bnpparibas.pl/biuro-maklerskie/rynki-zagraniczne
//   https://www.bnpparibas.pl/_fileserver/item/1537059
//
// Currency. The account holds PLN and EUR, USD, GBP currency accounts
// (free). The brokerage does not exchange currency: the order needs cash
// already in the listing currency. Every catalogue currency is one of the
// four (GBX settles in GBP), so nothing is converted here. The bank's own
// rate for filling a currency account is not in the brokerage tariff and
// is the remark: its rate table (TABELA KURSÓW WALUT, read 2026-10-18)
// prints buy, sell and the bank's mid, and the remark is the sell rate
// over that mid, one way:
//   USD  4,0513 / 3,8806  4.40 %
//   EUR  4,5620 / 4,3698  4.40 %
//   GBP  5,3786 / 5,1842  3.75 %
//   https://www.bnpparibas.pl/kursy-walut
//
// Saxo's RTS 28 gives US-traded shares to Citadel Securities LLC, so the
// US book is the blended 605 × Citadel's Q (alias in spreads/rule606.mjs).
//
// Left out: the account fee (online plan free, standard plan 30 zł a
// quarter), domestic custody (twice KDPW's rate, waived up to 300 000 zł
// of portfolio), the foreign register fee (0.05 % a quarter, waived when
// the quarter's trades reach 20 % of the holding), transfers and
// certificates. None is a fee on one trade.
//
//   node brokers/bnpparibasbiuro/bnpparibasbiuro_cost.mjs PKN XWAR PLN --shares=10 --price=60
//   node brokers/bnpparibasbiuro/bnpparibasbiuro_cost.mjs AAPL XNAS USD --shares=50 --price=230
//   node brokers/bnpparibasbiuro/bnpparibasbiuro_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { isListedUsTape, listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, listingCash, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("bnpparibasbiuro-parsed.json", import.meta.url);

const SCHEDULE = {
  tariff: "https://www.bnpparibas.pl/_fileserver/item/1520011",
  repository: "https://www.bnpparibas.pl/repozytorium-biura-maklerskiego/taryfy-oplat-i-prowizji",
  foreign: "https://www.bnpparibas.pl/biuro-maklerskie/rynki-zagraniczne",
  foreignRules: "https://www.bnpparibas.pl/_fileserver/item/1537059",
  readOn: "2026-10-18",
  bankFx: "https://www.bnpparibas.pl/kursy-walut",
  tariffPdf: "2026-02-16",
  foreignBrokers: "Saxo Bank A/S (principal), EXANE Ltd (secours)",
};

const DOMESTIC_RATE = 0.0035;
const DOMESTIC_MIN_PLN = 5;
const DAYTRADE_RATE = 0.0019;
const FOREIGN_RATE = 0.0095;
const IRISH_RATE = 0.0129;
const FOREIGN_MIN_ORDER = 10000;
const HOLD = new Set(["PLN", "EUR", "USD", "GBP"]);

const DOMESTIC = new Set(["XWAR", "XNCO", "XGLO"]);
const US = new Set(["XNAS", "XNYS", "XASE", "ARCX", "BATS", "IEXG", "OTCM"]);
const MIN20 = new Set(["XPAR", "XBRU", "XAMS", "XETR"]);
const OTHER_EU = new Set(["XMAD", "XMSM", "XDUB", "XHEL", "XFRA", "XMUN", "XSTU", "XDUS", "XQTX", "XBER", "XHAM", "XLIS", "XCSE", "XSTO"]);

// The foreign row for a place, or null when the tariff has none.
function foreignRow(mic, row) {
  const rawUs = /^USA?$/i.test(String(row?.exchange || "").trim());
  if (US.has(mic) || (!mic && rawUs)) return { rate: FOREIGN_RATE, min: 20, label: "USA" };
  if (MIN20.has(mic)) return { rate: FOREIGN_RATE, min: 20, label: mic === "XETR" ? "Xetra" : "Euronext Paris, Bruxelles, Amsterdam" };
  if (mic === "XLON") {
    const irishShare =
      String(row?.isin || "").toUpperCase().startsWith("IE") &&
      String(row?.type || "").toUpperCase() === "STOCK" &&
      !/\b(UCITS|ETF|ETC|ETN)\b/i.test(String(row?.name || ""));
    return irishShare
      ? { rate: IRISH_RATE, min: 27, label: "Royaume-Uni, action irlandaise" }
      : { rate: FOREIGN_RATE, min: 20, label: "Royaume-Uni" };
  }
  if (mic === "XMIL") return { rate: FOREIGN_RATE, min: 25, label: "Italie" };
  if (mic === "XWBO" || mic === "XLUX") return { rate: FOREIGN_RATE, min: 30, label: "Autriche, Luxembourg" };
  if (OTHER_EU.has(mic)) return { rate: FOREIGN_RATE, min: 25, label: "autres places de l'UE" };
  return null;
}

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};
const pct = (x) => (100 * x).toFixed(2).replace(".", ",");

// Bank table, read 2026-10-18: [sell, bank mid] in PLN per unit.
const BANK_FX = { USD: [4.0513, 3.8806], EUR: [4.562, 4.3698], GBP: [5.3786, 5.1842] };

function bankFxRemark(cash) {
  const pair = BANK_FX[listingCash(cash)];
  if (!pair) return fxRemark("", cash, "(bank rate, not the brokerage)");
  return fxRemark((100 * (pair[0] / pair[1] - 1)).toFixed(2), cash, "(bank rate table, not the brokerage)");
}

function remarkOf(domestic, cash) {
  if (domestic) return `Same day sell is ${Number(((DOMESTIC_RATE - DAYTRADE_RATE) * 100).toFixed(2))}% lower.`;
  return [
    "Foreign orders by phone only, 8:30-17:30. Minimum trade 10,000 USD/EUR/GBP.",
    bankFxRemark(cash),
  ].join("\n");
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "",
    url: SCHEDULE.tariff,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue BNP Paribas BM n'existe pas encore : lancer `node brokers/bnpparibasbiuro/bnpparibasbiuro_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue BNP Paribas BM` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez BNP Paribas BM`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const mic = m.venue?.mic ?? null;
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "bnpparibasbiuro",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? mic,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const cash = listingCash(listing.currency);
  const domestic = DOMESTIC.has(mic) && cash === "PLN";
  const row = domestic ? null : foreignRow(mic, m.row);
  // A US listing, named or not, is priced on the per-share book.
  const usBook = cash === "USD" && (isListedUsTape(mic) || (!mic && book.leaf?.source === "us605"));
  const marketBp = bp ?? (usBook ? null : book.leaf?.bp ?? null);
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  // Foreign commissions include stamp and transaction taxes.
  const tax = taxesOf(listing.isin);
  const taxPct = domestic ? Object.values(taxRates(tax)).reduce((s, r) => s + r, 0) : 0;
  const shared = {
    ...answer,
    listing,
    cashCurrency: HOLD.has(cash) ? cash : "",
    // A4.1 takes foreign orders by phone only: priced, but not bought online.
    onlineBuy: domestic,
    remark: remarkOf(domestic, cash),
    url: domestic ? SCHEDULE.tariff : SCHEDULE.foreign,
    basis: domestic
      ? `taryfa BM BNP Paribas (PDF du ${SCHEDULE.tariffPdf}), relue le ${SCHEDULE.readOn}, A1 internet : 0,35 % par ordre, minimum 5 zł`
      : row
        ? `taryfa BM BNP Paribas (PDF du ${SCHEDULE.tariffPdf}), relue le ${SCHEDULE.readOn}, A4.1 ordre par téléphone, ${row.label} : ` +
          `${pct(row.rate)} %, minimum ${row.min} ${cash}, taxes et frais locaux compris ; transaction minimale ${FOREIGN_MIN_ORDER} ${cash}`
        : `taryfa BM BNP Paribas (PDF du ${SCHEDULE.tariffPdf}), relue le ${SCHEDULE.readOn}`,
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: null,
    bp: marketBp,
    perShare: marketPerShare,
  };
  if (!domestic && !row) {
    return { ...shared, why: `${listing.brokerExchange || listing.exchange} n'a pas de ligne dans la taryfa` };
  }
  if (!HOLD.has(cash)) {
    return { ...shared, why: `le BM ne tient pas de compte en ${cash} et ne change pas de devises` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  // In the settlement currency: pence are pounds here.
  const cashNotional = listing.currency === "GBX" ? notional / 100 : notional;
  if (!domestic && cashNotional < FOREIGN_MIN_ORDER) {
    return {
      ...shared,
      trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
      why: `transaction minimale ${FOREIGN_MIN_ORDER} ${cash} sur les marchés étrangers : un ordre de ${cashNotional.toFixed(2)} ${cash} est refusé`,
    };
  }

  const rate = domestic ? DOMESTIC_RATE : row.rate;
  const min = domestic ? DOMESTIC_MIN_PLN : row.min;
  const sideCash = Math.max(cashNotional * rate, min);
  const side = dollars(sideCash, cash);
  const brokerFees = plus(side, side);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: usBook ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxPct;
  const usd = plus(bookUsd, brokerFees, taxUsd);

  const confidence = [
    `courtage ${sideCash.toFixed(2).replace(".", ",")} ${cash} par sens (${sideCash === min ? `minimum ${min} ${cash}` : `${pct(rate)} %`})`,
    domestic ? "" : "ordre par téléphone, seul canal pour l'étranger ; taxes locales comprises dans la commission",
    usBook ? "actions US de Saxo chez Citadel Securities LLC : carnet 605 × Q de Citadel" : "",
    taxPct > 0 ? `taxes à l'achat ${pct(taxPct)} % (taxMap)` : "",
    mic === "OTCM" ? "OTC américain rangé sous la ligne USA" : "",
    marketPerShare != null
      ? `carnet ${marketPerShare} $ la part`
      : marketBp != null
        ? `carnet ${marketBp} bp à ${listing.exchange}`
        : `pas de carnet pour ${listing.exchange}`,
  ]
    .filter(Boolean)
    .join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: {
      rate,
      min,
      currency: cash,
      each: finite(sideCash, 6),
      eachWay: true,
      channel: domestic ? "internet" : "téléphone",
      ...(domestic ? { sameDaySale: DAYTRADE_RATE } : { minOrder: FOREIGN_MIN_ORDER }),
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence,
  };
}

function printCli() {
  let called = false;
  try {
    called = import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    called = false;
  }
  if (!called) return;
  if (process.argv.includes("--schedule")) {
    console.log(
      JSON.stringify(
        {
          ...SCHEDULE,
          domestic: { places: [...DOMESTIC], rate: DOMESTIC_RATE, minPln: DOMESTIC_MIN_PLN, sameDaySale: DAYTRADE_RATE, channel: "internet" },
          foreign: {
            channel: "téléphone",
            minOrder: FOREIGN_MIN_ORDER,
            taxesIncluded: true,
            rows: [
              { places: "USA (NYSE, Nasdaq, NYSE American, Arca, BZX, OTC)", rate: FOREIGN_RATE, min: 20 },
              { places: "Euronext Paris, Bruxelles, Amsterdam, Xetra", rate: FOREIGN_RATE, min: 20 },
              { places: "Londres", rate: FOREIGN_RATE, min: 20 },
              { places: "Londres, actions de sociétés irlandaises", rate: IRISH_RATE, min: 27 },
              { places: "Italie", rate: FOREIGN_RATE, min: 25 },
              { places: "Autriche, Luxembourg", rate: FOREIGN_RATE, min: 30 },
              { places: "autres places de l'UE, OTC compris", rate: FOREIGN_RATE, min: 25 },
            ],
          },
          hold: [...HOLD],
        },
        null,
        2
      )
    );
    return;
  }
  const arg = (flag, fallback) => {
    const hit = process.argv.find((item) => item.startsWith(`--${flag}=`));
    return hit ? hit.slice(flag.length + 3) : fallback;
  };
  const [etf, place, currency] = process.argv.slice(2).filter((item) => !item.startsWith("--"));
  if (!etf) {
    console.error("usage : node brokers/bnpparibasbiuro/bnpparibasbiuro_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
    process.exit(2);
  }
  console.log(JSON.stringify(roundTrip({ etf, place, currency, shares: Number(arg("shares", "10")), price: Number(arg("price", "0")) }), null, 2));
}

printCli();
