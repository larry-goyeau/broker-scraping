// What one round trip costs at Yochaa (a wealth app built and run by
// RME-Ideas Limited, Lagos): buy n shares on the Nigerian Exchange or a US
// exchange in the app, sell them straight back, in dollars.
//
// Fees page, read 2026-10-26:
//   NG Transaction charges
//     Buy   Brokerage fees 1.00 %; "Stamp duty, CSCS & NSE charges" 0.375 %;
//           "VAT on charges" 7.5 %; CSCS Trade alert ₦4.2.
//           Worked example: ₦10,000 bought costs ₦152.01 = ₦100 + ₦37.5 +
//           ₦10.31 + ₦4.2. The ₦10.31 is 7.5 % of ₦137.5, so the VAT falls
//           on the brokerage and on the 0.375 % line together.
//     Sell  "Stamp duty & SEC charges" 0.675 %. Worked example: ₦10,000
//           sold costs ₦184.26 = ₦100 brokerage + ₦67.5 + ₦12.56 VAT (7.5 %
//           of ₦167.5) + ₦4.2 alert. So the sale pays the same 1 %
//           brokerage and the alert too.
//   US Transaction charges, per trade (each buy, each sell), USD
//     up to $100                     $1
//     above $100 but under $1,000    1.4 %
//     $1,000 but under $10,000       1.2 %
//     $10,000 and above              0.9 %   ("Above to $10,000")
//   Bank deposits 1.25 % capped at ₦300 and card deposits are funding, not
//   this trade.
// brokerFees is Yochaa's brokerage with its VAT; the 0.375 % / 0.675 % lines,
// their VAT and the alert are the exchange, CSCS, SEC and stamp levies the
// page prints (parts.taxes). The page's own figures replace the NGX card.
//
// FX: the fees page prices only naira deposits, and no page (home, fees,
// FAQ, terms) names a dollar wallet (deposits.mjs: NGN). A US line is bought
// with naira converted to dollars and sold back to naira, at a rate Yochaa
// does not print: the US total is N/A (owner's rule: an unpublished forced
// FX). No stand-in was found: Yochaa names no US broker, and its Nigerian
// broker (CardinalStone Securities, app-store listing) prints no dollar
// rate for this app. The ticket itself is in `parts`.
// US book: no US dealer is named, so the quoted NBBO (spreadLeaf with the
// folder's name). SEC and TAF are not printed: 0.
//
//   https://yochaa.com/fees
//   https://yochaa.com/faqs
//
//   node brokers/yochaa/yochaa_cost.mjs DANGCEM XNGN NGN --shares=10 --price=1066.7
//   node brokers/yochaa/yochaa_cost.mjs GREENWETF XNGN NGN --shares=100 --price=300
//   node brokers/yochaa/yochaa_cost.mjs AAPL XNAS USD --shares=1 --price=230
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, listingCash, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates, taxGap } from "../../taxMap.mjs";
import { depositHas } from "../../deposits.mjs";

const FOLDER = "yochaa";
const CATALOGUE = new URL("yochaa-parsed.json", import.meta.url);
const PAGE = "https://yochaa.com/fees";
const READ_ON = "2026-10-26";
const CASH = "NGN";

const NG = {
  brokerage: 0.01,
  buyLevies: 0.00375, // stamp duty, CSCS and NSE
  sellLevies: 0.00675, // stamp duty and SEC
  vat: 0.075, // on brokerage and the levy line
  alert: 4.2, // ₦ a trade
};
// USD a trade: [upper bound, flat fee or null, rate].
const US_STEPS = [
  { below: 100, flat: 1, inclusive: true },
  { below: 1000, rate: 0.014 },
  { below: 10000, rate: 0.012 },
  { below: Infinity, rate: 0.009 },
];
const US_MICS = new Set(["XNAS", "XNYS", "XASE", "ARCX", "BATS", "TXSE"]);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  if (amount == null || Number.isNaN(amount)) return null;
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

/** One US trade, USD. */
export function usSide(value) {
  if (!(value > 0)) return null;
  if (value <= 100) return 1;
  for (const step of US_STEPS.slice(1)) if (value < step.below) return value * step.rate;
  return null;
}

/** One Nigerian side, ₦: Yochaa's brokerage + VAT, and the levies + VAT + alert. */
export function ngSide(value, sell) {
  const brokerage = value * NG.brokerage;
  const levy = value * (sell ? NG.sellLevies : NG.buyLevies);
  return {
    brokerage,
    brokerageVat: brokerage * NG.vat,
    levy,
    levyVat: levy * NG.vat,
    alert: NG.alert,
  };
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
    cashCurrency: CASH,
    url: PAGE,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Yochaa n'existe pas encore : lancer `node brokers/yochaa/yochaa_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Yochaa` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Yochaa`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: FOLDER,
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? code(m.row.mic) ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const american = US_MICS.has(code(listing.mic)) && listing.currency === "USD";
  const nigerian = code(listing.mic) === "XNGN" && listing.currency === CASH;
  const held = depositHas(FOLDER, null, listingCash(listing.currency));
  const basis = american
    ? `barème Yochaa relu le ${READ_ON}, actions US par ordre : 1 USD jusqu'à 100, 1,4 % sous 1 000, 1,2 % sous 10 000, 0,9 % au-delà ; SEC et TAF non imprimés (0) ; compte en naira, change NGN ↔ USD sans taux publié`
    : `barème Yochaa relu le ${READ_ON}, NGX : courtage 1 % à l'achat et à la vente ; achat « stamp duty, CSCS & NSE » 0,375 %, vente « stamp duty & SEC » 0,675 % ; TVA 7,5 % sur le courtage et ces frais ; alerte CSCS 4,2 ₦ par ordre`;
  const shared = {
    ...answer,
    listing,
    basis,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };
  if (!american && !nigerian) {
    return { ...shared, why: `${listing.exchange} ${listing.currency} n'a pas de ligne dans le barème Yochaa` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  let commissionLocal;
  let leviesLocal;
  let detail;
  if (nigerian) {
    const buy = ngSide(notional, false);
    const sell = ngSide(notional, true);
    commissionLocal = buy.brokerage + buy.brokerageVat + sell.brokerage + sell.brokerageVat;
    leviesLocal = buy.levy + buy.levyVat + buy.alert + sell.levy + sell.levyVat + sell.alert;
    detail = { buy, sell };
  } else {
    const side = usSide(notional);
    commissionLocal = side == null ? null : side * 2;
    leviesLocal = 0;
    detail = { buy: side, sell: side };
  }
  const commissionUsd = dollars(commissionLocal, listing.currency);
  const leviesUsd = dollars(leviesLocal, listing.currency);
  // Naira converted to dollars on the buy and back on the sale, at a rate
  // Yochaa does not print.
  const fxUsd = held ? 0 : null;
  const brokerFees = plus(commissionUsd, fxUsd);

  const tax = taxesOf(listing.isin);
  const taxPct = american ? Object.values(taxRates(tax)).reduce((s, r) => s + r, 0) : 0;
  const gap = american ? taxGap(listing.isin, listing.type, listing.mic) : null;
  const taxUsd = gap || notionalUsd == null ? null : notionalUsd * taxPct;

  let marketBp = bp ?? (american ? null : book.leaf?.bp ?? null);
  let marketPerShare = perShare ?? (american ? null : book.leaf?.perShare ?? null);
  if (american && bp == null && perShare == null) {
    marketPerShare = usBookPerShare({ broker: FOLDER, ticker: listing.ticker, fallback: book.leaf?.perShare ?? null });
  }
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: american && marketPerShare != null ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (v) => dollars(v, listing.currency),
  });
  const bookUsd =
    parts.a == null || parts.b == null || notionalUsd == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, commissionUsd, leviesUsd, taxUsd, fxUsd);

  const unknown = [
    held ? null : `change forcé NGN → ${listing.currency} à l'achat et retour à la vente : Yochaa n'imprime ni taux ni écart`,
    bookUsd == null
      ? american
        ? `pas de carnet 605 pour ${listing.ticker || etf}`
        : `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`
      : null,
    gap,
  ].filter(Boolean);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    bp: marketBp,
    perShare: marketPerShare,
    ...(unknown.length ? { why: unknown.join(" ; ") } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { ...detail, currency: listing.currency, eachWay: true },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      taxes: finite(plus(leviesUsd, american ? taxUsd : 0), 6),
      change: finite(fxUsd, 6),
      courtageLocal: finite(commissionLocal, 6),
      taxesLocal: finite(leviesLocal, 6),
    },
    tax,
    confidence: [
      basis,
      nigerian ? "exemples de la page (achat 152,01 ₦ et vente 184,26 ₦ pour 10 000 ₦) retrouvés à l'arrondi près" : null,
      american ? "pas de courtier américain nommé : NBBO coté" : null,
      "aucun aller-retour réel chez Yochaa dans ce dépôt",
    ]
      .filter(Boolean)
      .join(" ; "),
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
  if (!etf) {
    console.error("usage : node brokers/yochaa/yochaa_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
    process.exit(2);
  }
  console.log(JSON.stringify(roundTrip({ etf, place, currency, shares: Number(arg("shares", "10")), price: Number(arg("price", "0")) }), null, 2));
}

printCli();
