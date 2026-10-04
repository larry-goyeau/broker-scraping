// What one round trip costs at Pluang: buy, then sell, in dollars.
// Online order. The regular schedule, not Pluang Plus and not the
// opening waiver.
//
// https://pluang.com/biaya/id-stocks
// https://pluang.com/biaya/us-stocks
// https://pluang.com/biaya/crypto
// https://pluang.com/biaya/biaya-lainnya
// read on 2026-10-04.
//
//   Indonesian shares and funds, each side already includes the
//   exchange lines, the VAT and the sale tax.
//     Buy                         0.15% of the fill.
//     Sell                        0.25% of the fill.
//     e-Meterai                   Rp10,000 on a confirmation above
//                                 Rp10,000,000. Each side is its own
//                                 confirmation.
//   United States shares and funds. Regular customer.
//     Commission                  0.30% of the fill, each side.
//                                 Pluang Plus is 0.20%. The worked
//                                 example rounds each component up
//                                 to the cent.
//     JFX and KBI                 0.05% of the fill, capped at $0.10,
//                                 each side.
//     VAT                         11% of the commission and the JFX
//                                 line, each side.
//     Sale only                   SEC $0.0000206 per $1, minimum
//                                 $0.01. TAF $0.000166 a share,
//                                 minimum $0.01, maximum $8.30.
//                                 CAT $0.0000265 a share, minimum
//                                 $0.01.
//     A US share or ETF is executed by Alpaca Securities LLC. The
//     book is that firm's Rule 606.
//     https://pluang.com/faq/us-stocks/about-us-stocks/penyaluran-dana-saat-transaksi-saham-as-di-pluang
//     The page does not print a custody line.
//   Spot crypto, instant order. The table prints no Pluang
//   commission on that order. CFX is 0.00555% of the fill each
//   side and already includes VAT. Maker is 0.10% and taker is
//   0.15%; those are advanced orders, so they stay in the remark.
//   The page also charges a bid-ask that varies by token and
//   prints no figure for it.
//   IDR to USD and back is 0.25% plus 11% VAT. The conversion
//   spread is named and not priced. A US line's remark is
//   "FX 0.278% when cash ≠ USD."
//
//   node brokers/pluang/pluang_cost.mjs BBCA IDX IDR --shares=300 --price=8500
//   node brokers/pluang/pluang_cost.mjs AAPL US USD --shares=10 --price=200
//   node brokers/pluang/pluang_cost.mjs BTC CRYPTO IDR --amount=1000
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { cryptoId, listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("pluang-parsed.json", import.meta.url);
const SPREADS = new URL("../../spreads/spread.json", import.meta.url);
const READ_ON = "2026-10-04";
const ID_PAGE = "https://pluang.com/biaya/id-stocks";
const US_PAGE = "https://pluang.com/biaya/us-stocks";
const CRYPTO_PAGE = "https://pluang.com/biaya/crypto";
const ID_BUY = 0.0015;
const ID_SELL = 0.0025;
const STAMP = 10_000;
const STAMP_ABOVE = 10_000_000;
const US_COMMISSION = 0.003;
const JFX = 0.0005;
const JFX_CAP = 0.1;
const VAT = 0.11;
const SEC = 0.0000206;
const SEC_MIN = 0.01;
const TAF = 0.000166;
const TAF_MIN = 0.01;
const TAF_MAX = 8.3;
const CAT = 0.0000265;
const CAT_MIN = 0.01;
const CFX = 0.0000555;
const FX_FEE = 0.0025;
const FX_REMARK = `FX ${(FX_FEE * (1 + VAT) * 100).toFixed(3)}% when cash ≠ USD. The conversion spread is not priced.`;
const CRYPTO_REMARK = "Advanced orders: maker 0.10%, taker 0.15%.";

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};
const ceilCent = (amount) => Math.ceil(amount * 100 - 1e-8) / 100;

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(
    rows,
    asked,
    (r) =>
      loose(r.isin) === asked ||
      loose(r.ticker) === asked ||
      loose(r.query) === asked ||
      (Array.isArray(r.matches) && r.matches.some((item) => loose(item) === asked))
  );
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

function idSide(notional, sell) {
  const stamp = notional > STAMP_ABOVE ? STAMP : 0;
  return notional * (sell ? ID_SELL : ID_BUY) + stamp;
}

function usSide(notional, shares, sell) {
  const commission = ceilCent(notional * US_COMMISSION);
  const jfx = ceilCent(Math.min(notional * JFX, JFX_CAP));
  const vat = ceilCent((commission + jfx) * VAT);
  if (!sell) return commission + jfx + vat;
  const sec = Math.max(notional * SEC, SEC_MIN);
  const taf = Math.min(Math.max(shares * TAF, TAF_MIN), TAF_MAX);
  const cat = Math.max(shares * CAT, CAT_MIN);
  return commission + jfx + vat + sec + taf + cat;
}

export function roundTrip({ etf, place, currency, shares, price, amount = null, bp = null, perShare = null }) {
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "",
    url: "https://pluang.com/biaya",
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Pluang n'existe pas encore : lancer `node brokers/pluang/pluang_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Pluang` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Pluang`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const crypto = code(m.row.type) === "CRYPTO";
  const book = spreadLeaf(spreads, {
    isin: crypto ? cryptoId(m.row.ticker) : m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "pluang",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const american = loose(listing.brokerExchange) === "US" && listing.currency === "USD";
  const indonesian = loose(listing.brokerExchange) === "IDX";
  const quoted = american ? usBookPerShare({ broker: "pluang", ticker: listing.ticker }) : null;
  const marketBp = bp ?? (american ? null : book.leaf?.bp ?? null);
  const marketPerShare = perShare ?? quoted ?? (american ? null : book.leaf?.perShare ?? null);
  const page = crypto ? CRYPTO_PAGE : american ? US_PAGE : ID_PAGE;
  const remark = american ? FX_REMARK : crypto ? CRYPTO_REMARK : "";
  const shared = {
    ...answer,
    url: page,
    listing,
    cashCurrency: listing.currency,
    remark,
    basis: crypto
      ? `ordre instantané, page relue le ${READ_ON}. Commission Pluang 0. CFX 0,00555 % de chaque côté.`
      : american
        ? `livraison en ligne, page relue le ${READ_ON}. Commission régulière 0,30 % de chaque côté, plus JFX plafonné et TVA 11 %.`
        : `livraison en ligne, page relue le ${READ_ON}. Achat 0,15 %. Vente 0,25 %.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    bp: marketBp,
    perShare: marketPerShare,
  };

  const n = Number(shares);
  const p = Number(price);
  const cash = Number(amount);
  if (crypto) {
    if (!(cash > 0)) return { ...shared, why: "aucun montant pour cette ligne crypto" };
  } else if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  else if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = crypto ? cash : n * p;
  const notionalUsd = crypto ? cash : dollars(notional, listing.currency);
  let ticketUsd = null;
  if (crypto) ticketUsd = cash * CFX * 2;
  else if (indonesian) ticketUsd = dollars(idSide(notional, false) + idSide(notional, true), listing.currency);
  else if (american) ticketUsd = usSide(notional, n, false) + usSide(notional, n, true);
  const brokerFees = ticketUsd;
  const parts = bookParts({
    bp: marketBp,
    perShare: crypto ? null : marketPerShare,
    venue: american && marketPerShare != null ? { source: "us605" } : m.venue,
    unsourced: crypto && marketBp == null ? null : m.unsourced,
    toUsd: (value) => dollars(value, listing.currency),
  });
  const units = crypto ? 0 : n;
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * units;
  const usd = plus(bookUsd, brokerFees);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    trade: {
      shares: crypto ? null : n,
      price: crypto ? null : p,
      amount: crypto ? cash : null,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: crypto ? QUOTE : listing.currency,
    },
    commission: crypto
      ? { cfx: CFX, eachWay: true, currency: QUOTE }
      : indonesian
        ? { buy: ID_BUY, sell: ID_SELL, currency: listing.currency }
        : { each: US_COMMISSION, currency: listing.currency, eachWay: true },
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
  const arg = (flag, fallback) => {
    const hit = process.argv.find((item) => item.startsWith(`--${flag}=`));
    return hit ? hit.slice(flag.length + 3) : fallback;
  };
  const [etf, place, currency] = process.argv.slice(2).filter((item) => !item.startsWith("--"));
  console.log(
    JSON.stringify(
      roundTrip({
        etf,
        place,
        currency,
        shares: Number(arg("shares", "10")),
        price: Number(arg("price", "0")),
        amount: arg("amount", "") === "" ? null : Number(arg("amount")),
      }),
      null,
      2
    )
  );
}

printCli();
