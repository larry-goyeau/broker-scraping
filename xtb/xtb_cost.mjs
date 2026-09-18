// What one round trip costs at XTB: buy n shares at price p, sell them
// back at once (online, regular hours, market), in dollars.
//
// The affine triple hid the monthly cliff. 0.2 % of a 2 300 $ Apple
// ticket is 4.60 $, but the first 100 000 € of calendar-month turnover
// (every registered account) is 0, so ten shares pay nothing. A fifth
// trade that only just crosses the line still pays the 10 € floor, not
// 0.2 % of the sliver. `roundTrip` is given the size — and `--spent=`
// already booked this month, in euro — and charges what is charged.
//
// XTB S.A. (PL, KNF) / XTB Limited (UK). Same Standard OMI card on the
// 2026 help pages and on the 30.06.2025 table. The Belize INT marketing
// page prints the same 0 / 0.2 % / 0.5 %. Catalogue
// `xtb_scraping.mjs` — xStation equities (CFDs dropped). Until that
// file has been run, this one answers that the book is missing. Stock
// CFDs, ETF CFDs and crypto CFDs are another product.
//
//   OMI stocks / ETFs / ETC / ETN / fractionals
//                      0 % until 100 000 € monthly turnover
//                      then 0.2 %, min 10 €, on the excess of that trade
//   FX on the trade    0.5 % of mid, each way, when cash ≠ listing
//   FX weekend transfer 0.8 % — cash-account move, not this trip
//
// Cash accounts the pages name: PLN, EUR, USD (PL, max four live
// books) and GBP, EUR, USD (UK). The union is holdable. GBX settles
// in GBP. A SEK / CHF / HKD / JPY / CZK / HUF / DKK / NOK listing
// cannot be held, so that 0.5 % is in `brokerFees` and stays out of
// the remark. Holdable cash keeps `FX 0.50% when cash ≠ CCY.`
//
// Stamp / FTT from taxMap by ISIN. The OMI table also names France
// 0.40 %, Spain 0.20 %, Italy 0.10 %, UK 0.50 % / Irish 1 %, and PTM
// £1.50 above £10 000 — used only when the map is silent, and only
// on a stock of that market. SEC is printed 0 %. TAF, CAT, Belgian
// TOB and HK stamp are not named and are not invented.
//
// Custody 0.02 % p.a. on the excess of average daily NAV above
// 250 000 €, inactivity 10 € (no trade 365 days and no deposit 90
// days), transfers and the $10 minimum ticket stay out of the number.
// Tickets already in the number stay out of the remark.
//
//   https://www.xtb.com/int/account-and-fees
//   https://www.xtb.com/en/help-center/stocks-and-etfs-10/what-are-the-commissions-fees-for-trading-shares-stocks
//   https://www.xtb.com/en/help-center/fees-and-payments-3/fees-and-commissions-at-xtb
//   https://www.xtb.com/pl/centrum-pomocy/akcje-i-etf-8/czy-pobierana-jest-oplata-za-przewalutowanie-w-przypadku-handlu-na-akcjach-i-etf-notowanych-w-innych-walutach
//
//   node xtb/xtb_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node xtb/xtb_cost.mjs VWCE XETR EUR --shares=10 --price=140
//   node xtb/xtb_cost.mjs TTE EURONEXT EUR --shares=10 --price=60
//   node xtb/xtb_cost.mjs AAPL NASDAQ USD --shares=500 --price=230 --spent=95000
//   node xtb/xtb_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, listingCash, fxRemark } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("xtb-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  fees: "https://www.xtb.com/int/account-and-fees",
  help: "https://www.xtb.com/en/help-center/stocks-and-etfs-10/what-are-the-commissions-fees-for-trading-shares-stocks",
  helpInt: "https://www.xtb.com/en/help-center/fees-and-payments-3/fees-and-commissions-at-xtb",
  fxPl: "https://www.xtb.com/pl/centrum-pomocy/akcje-i-etf-8/czy-pobierana-jest-oplata-za-przewalutowanie-w-przypadku-handlu-na-akcjach-i-etf-notowanych-w-innych-walutach",
  readOn: "2026-09-18",
  tableOn: "2025-06-30",
  entity: "XTB S.A. / XTB Limited",
};

const FREE_EUR = 100000;
const RATE = 0.002;
const MIN_EUR = 10;
const FX_EACH = 0.005;
const HOLD = new Set(["EUR", "GBP", "USD", "PLN"]);
const PTM = { each: 1.5, currency: "GBP", above: 10000 };
const UK_STAMP = 0.005;
const IE_STAMP = 0.01;
const OWN_FTT = {
  FR: { name: "FRENCH_TRANSACTION_TAX", rate: 0.004, mics: new Set(["XPAR"]), exchanges: /EURONEXT|PARIS|XPAR/ },
  ES: { name: "SPANISH_FTT", rate: 0.002, mics: new Set(["XMAD"]), exchanges: /BME|MADRID|XMAD/ },
  IT: { name: "ITALIAN_FTT", rate: 0.001, mics: new Set(["XMIL"]), exchanges: /MIL|BORSA|XMIL/ },
};
const EURONEXT_MICS = new Set(["XPAR", "XAMS", "XBRU", "XLIS"]);
const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS", "IEXG"]);
const US_EX = /^(NASDAQ|NYSE|AMEX|ARCA|NYSEARCA|BATS|BZX|CBOE|IEX)$/;
const OMI = new Set(["STOCK", "ETF", "ETC", "ETN"]);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const isStock = (listing) => code(listing?.type) === "STOCK";
const isOmi = (row) => OMI.has(code(row?.type));
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
};
function convert(amount, from, to) {
  if (amount == null || Number.isNaN(amount)) return null;
  const a = listingCash(from);
  const b = listingCash(to);
  if (a === b && code(from) !== "GBX") return amount;
  const usd = toUsd(amount, from);
  const per = usdPer(b);
  return usd == null || !(per > 0) ? null : usd / per;
}
const fxNote = (currency) => ({ quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listingCash(currency)) });

export function feeMarketOf(row) {
  const type = code(row?.type);
  if (type === "CRYPTO" || type === "CFD") return null;
  if (isOmi(row) || !type) return "omi";
  return null;
}

/**
 * One side, after `spentEur` of the month has already printed.
 * The floor binds the excess, not the free remainder.
 */
export function commissionSide({ notionalEur, spentEur = 0 }) {
  if (!(notionalEur > 0)) return null;
  const spent = Number(spentEur) || 0;
  const remaining = Math.max(0, FREE_EUR - spent);
  const excess = Math.max(0, notionalEur - remaining);
  if (excess <= 0) return { charged: 0, excess: 0, raw: 0, floored: false, currency: "EUR" };
  const raw = excess * RATE;
  const charged = Math.max(MIN_EUR, raw);
  return { charged, excess, raw, floored: charged > raw, currency: "EUR" };
}

export function taxesFor(isin, listing) {
  const tax = taxesOf(isin);
  const mapped = taxRates(tax);
  const cc = String(isin || "").slice(0, 2).toUpperCase();
  const mic = code(listing?.mic);
  const ex = loose(listing?.brokerExchange || listing?.exchange);
  if (Object.keys(mapped).length) return { tax, rates: mapped, added: [], source: "taxMap" };
  if (!isStock(listing)) return { tax, rates: {}, added: [], source: null };

  if (mic === "XLON" || /^LSE|LONDON/.test(ex)) {
    if (cc === "IE") return { tax, rates: { stamp: IE_STAMP }, added: ["stamp"], source: "xtb" };
    if (cc === "GB" || mic === "XLON") return { tax, rates: { stamp: UK_STAMP }, added: ["stamp"], source: "xtb" };
  }

  const own = OWN_FTT[cc];
  if (own && (own.mics.has(mic) || own.exchanges.test(ex))) {
    return { tax, rates: { [own.name]: own.rate }, added: [own.name], source: "xtb" };
  }
  return { tax, rates: {}, added: [], source: tax?.assumedZero ? "assumedZero" : null };
}

function isUkStock(row, mic) {
  if (!isStock(row)) return false;
  if (code(mic) === "XLON") return true;
  return /^(LSE|LONDON)/.test(loose(row?.exchange));
}

function ptmOf({ row, mic, notional, currency }) {
  if (!isUkStock(row, mic)) return { gbp: 0, usd: 0, bites: false };
  if (notional == null) return { gbp: null, usd: null, bites: false };
  const gbp = convert(notional, currency, "GBP");
  if (gbp == null) return { gbp: null, usd: null, bites: false };
  if (gbp < PTM.above) return { gbp: 0, usd: 0, bites: false };
  return { gbp: PTM.each * 2, usd: dollars(PTM.each * 2, "GBP"), bites: true };
}

function remarkOf({ holdable, currency, ukStock, ptmBites }) {
  const lines = [];
  if (holdable) lines.push(fxRemark((100 * FX_EACH).toFixed(2), currency));
  if (ukStock && !ptmBites) lines.push("UK takeover levy (PTM) £1.50 each way above £10,000.");
  return lines.join("\n");
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const resolved = place ? resolveVenue({ exchange: place, mic: place }) : {};
  const wantVenue = resolved.venue || null;
  const wantPlace = loose(place);
  const wantCurrency = code(currency);

  const named = rows.filter(
    (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked
  );
  const exactCode = wantPlace ? named.filter((r) => loose(r.exchange) === wantPlace) : [];
  const pool = exactCode.length ? exactCode : named;
  const matches = pool
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (exactCode.length) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      if (wantVenue && EURONEXT_MICS.has(wantVenue.mic) && loose(m.row.exchange) === "EURONEXT") {
        return true;
      }
      return loose(m.row.exchange) === wantPlace || loose(m.row.exchange).includes(wantPlace);
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);

  return { named, matches };
}

const listAlternatives = (named) =>
  named
    .map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "place non dite"}`)
    .slice(0, 12);

function coverage() {
  if (!rows.length) return null;
  const out = {};
  for (const r of rows) {
    const type = r.type || "?";
    const { venue, unsourced } = listingKey(r);
    const book = spreadLeaf(spreads, {
      isin: r.isin,
      mic: venue?.mic ?? null,
      currency: r.currency,
      unsourced,
    });
    const market = feeMarketOf(r) || "?";
    const slot = (out[type] ||= { n: 0, withBook: 0, byMarket: {} });
    slot.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) slot.withBook += 1;
    const mk = (slot.byMarket[market] ||= { n: 0, withBook: 0 });
    mk.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) mk.withBook += 1;
  }
  return out;
}

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `usd` is the number the page prints; `brokerFees` is XTB's ticket and,
 * when the listing currency is not held, the conversion.
 */
export function roundTrip({
  etf,
  place,
  currency,
  shares,
  price,
  bp = null,
  perShare = null,
  spent = 0,
}) {
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "",
  };

  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue XTB n'existe pas encore : lancer `node xtb/xtb_scraping.mjs`",
    };
  }

  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue XTB` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez XTB`,
      alternatives: listAlternatives(named),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "xtb",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency) || null,
    brokerExchange: m.row.exchange || null,
  };

  const market = feeMarketOf(m.row);
  if (!market) {
    return {
      ...answer,
      listing,
      why: `${listing.ticker || listing.isin} n'est pas un OMI chez XTB (${listing.type || "type inconnu"})`,
    };
  }

  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const settle = listingCash(listing.currency);
  const holdable = HOLD.has(settle);
  const fxPct = holdable ? 0 : FX_EACH;
  const { tax, rates, added, source: taxSource } = taxesFor(listing.isin, listing);
  const taxTotal = Object.values(rates).reduce((s, r) => s + r, 0);
  const ukStock = isUkStock(m.row, listing.mic);
  const american = US_MICS.has(code(listing.mic)) || US_EX.test(loose(listing.brokerExchange));

  const n = Number(shares);
  const p = Number(price);
  const notional = n > 0 && p > 0 ? n * p : null;
  const levy = ptmOf({ row: m.row, mic: listing.mic, notional, currency: listing.currency });

  const shared = {
    ...answer,
    listing,
    feeMarket: market,
    cashCurrency: holdable ? settle : "",
    remark: remarkOf({ holdable, currency: listing.currency, ukStock, ptmBites: levy.bites }),
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.fees,
    basis: `barème XTB OMI, relu le ${SCHEDULE.readOn}`,
    tax,
    ccy: QUOTE,
    fx: fxNote(listing.currency),
    fxIfConverted: holdable ? FX_EACH * 2 : 0,
    spent: Number(spent) || 0,
  };

  if (notional == null) {
    return {
      ...shared,
      why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node prices.mjs",
      confidence: confidenceOf({
        listing,
        leaf,
        marketBp,
        marketPerShare,
        unsourced: m.unsourced,
        holdable,
        fxPct,
        taxTotal,
        rates,
        taxSource,
        added,
        ukStock,
        american,
      }),
    };
  }

  const notionalUsd = dollars(notional, listing.currency);
  const notionalEur = convert(notional, listing.currency, "EUR");
  const spentEur = Number(spent) || 0;
  const buy = commissionSide({ notionalEur, spentEur });
  const sell = commissionSide({ notionalEur, spentEur: spentEur + (notionalEur || 0) });
  const commissionEur = buy && sell ? buy.charged + sell.charged : null;
  const commissionUsd = commissionEur == null ? null : dollars(commissionEur, "EUR");

  const bookUsd =
    marketPerShare != null
      ? american || listing.currency === "USD"
        ? marketPerShare * n
        : dollars(marketPerShare * n, listing.currency)
      : marketBp != null && notionalUsd != null
        ? (notionalUsd * marketBp) / 1e4
        : null;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const fxUsd = fxPct && notionalUsd != null ? notionalUsd * fxPct * 2 : 0;
  const usd = plus(bookUsd, commissionUsd, taxUsd, levy.usd, fxUsd);
  const brokerFees = plus(commissionUsd, fxUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? {
          why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${
            m.unsourced?.why || "pas de feuille de carnet"
          }`,
        }
      : {}),
    trade: {
      shares: n,
      price: p,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      notionalEur: finite(notionalEur, 6),
      currency: listing.currency,
    },
    commission: {
      rate: RATE,
      min: MIN_EUR,
      freeUntil: FREE_EUR,
      spent: spentEur,
      buy,
      sell,
      currency: "EUR",
      eachWay: true,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      taxes: finite(plus(taxUsd, levy.usd ?? 0), 6),
      change: finite(fxUsd, 6),
    },
    ptm: levy.bites ? { gbp: levy.gbp, usd: finite(levy.usd, 6), above: PTM.above } : null,
    confidence: confidenceOf({
      listing,
      leaf,
      marketBp,
      marketPerShare,
      unsourced: m.unsourced,
      holdable,
      fxPct,
      taxTotal,
      rates,
      taxSource,
      added,
      ukStock,
      american,
      buy,
      sell,
      notionalEur,
      spentEur,
      ptmBites: levy.bites,
    }),
  };
}

function confidenceOf({
  listing,
  leaf,
  marketBp,
  marketPerShare,
  unsourced,
  holdable,
  fxPct,
  taxTotal,
  rates,
  taxSource,
  added,
  ukStock,
  american,
  buy,
  sell,
  notionalEur,
  spentEur,
  ptmBites,
}) {
  const said = [];
  said.push(
    `barème XTB OMI, relu le ${SCHEDULE.readOn} (table du ${SCHEDULE.tableOn}) : ` +
      `0 % jusqu'à ${FREE_EUR} € de volume mensuel, ensuite ${100 * RATE} % (plancher ${MIN_EUR} €) sur l'excédent`
  );
  if (notionalEur != null) {
    const booked = (spentEur || 0) + 2 * notionalEur;
    said.push(
      `ce trajet ${Number(notionalEur.toPrecision(4))} € × 2` +
        (spentEur ? ` après ${spentEur} € déjà comptés` : "") +
        ` → volume ${Number(booked.toPrecision(5))} €`
    );
  }
  if (buy && sell) {
    if (buy.charged + sell.charged === 0) {
      said.push(`sous le plafond : commission 0`);
    } else {
      const side = (leg, name) =>
        !leg.excess
          ? `${name} 0`
          : leg.floored
            ? `${name} au plancher ${MIN_EUR} € (l'excédent ${Number(leg.excess.toPrecision(4))} € ne donnerait que ${Number(leg.raw.toPrecision(3))} €)`
            : `${name} ${Number(leg.charged.toPrecision(4))} € sur ${Number(leg.excess.toPrecision(4))} €`;
      said.push(`${side(buy, "achat")}, ${side(sell, "vente")}`);
    }
  }
  if (fxPct) {
    said.push(
      `change ${100 * FX_EACH} % × 2 : ${listingCash(listing.currency)} n'est pas une devise de caisse (PLN/EUR/USD/GBP), donc dans le total`
    );
  } else if (holdable) {
    said.push(
      `change hors du total : le compte peut tenir ${listingCash(listing.currency)} (${100 * FX_EACH} % seulement si le cash doit traverser)`
    );
  }
  if (taxTotal) {
    const named = Object.entries(rates)
      .map(([k, v]) => `${k} ${(100 * v).toFixed(2)} %`)
      .join(", ");
    said.push(
      `taxe à l'achat ${named}` +
        (taxSource === "xtb" ? `, au taux imprimé par XTB` : `, depuis taxMap.mjs`) +
        (added?.length ? ` (repli carte : ${added.join(", ")})` : "")
    );
  }
  if (ukStock) {
    said.push(
      ptmBites
        ? `PTM ${PTM.each} £ × 2, le montant dépasse ${PTM.above} £`
        : `PTM ${PTM.each} £ par jambe au-delà de ${PTM.above} £, hors du chiffre à cette taille`
    );
  }
  if (american) {
    said.push(`SEC imprimé 0 % de la vente, TAF et CAT ne sont pas nommés`);
  }
  if (marketBp != null) said.push(`carnet ${Number(marketBp.toPrecision(4))} bp, aller-retour`);
  else if (marketPerShare != null) said.push(`carnet 605 ${marketPerShare} $ la part, aller-retour`);
  else {
    said.push(
      `aucun carnet : ${unsourced?.why || "place sans source de spread"} — le total est N/A et non un total sans marché`
    );
  }
  said.push(
    `hors total : inactivité ${MIN_EUR} € si aucun ordre depuis 365 jours et aucun dépôt depuis 90. ` +
      `Garde 0.02 % l'an au-delà de 250 000 € de NAV moyenne. Ouverture et retraits EUR/GBP/USD 0. ` +
      `Aucun aller-retour réel dans ce dépôt`
  );
  if (!leaf) said.push(`carnet absent pour cette ligne`);
  return said.join(" ; ");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };

  if (process.argv.includes("--schedule")) {
    console.log(
      JSON.stringify(
        {
          ...SCHEDULE,
          freeEur: FREE_EUR,
          rate: RATE,
          minEur: MIN_EUR,
          fx: FX_EACH,
          hold: [...HOLD],
          ptm: PTM,
          ownFtt: Object.fromEntries(Object.entries(OWN_FTT).map(([k, v]) => [k, { name: v.name, rate: v.rate }])),
          secPrinted: 0,
          coverage: coverage(),
        },
        null,
        2
      )
    );
    process.exit(0);
  }

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error(
      "usage : node xtb/xtb_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--spent=eur] [--json]\n" +
        "        node xtb/xtb_cost.mjs --schedule\n" +
        "  ex.   node xtb/xtb_cost.mjs AAPL NASDAQ USD --shares=10 --price=230\n" +
        "        node xtb/xtb_cost.mjs VWCE XETR EUR --shares=10 --price=140\n" +
        "        node xtb/xtb_cost.mjs AAPL NASDAQ USD --shares=500 --price=230 --spent=95000"
    );
    process.exit(2);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : 10,
    price: flag("price") ? Number(flag("price")) : null,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
    spent: flag("spent") ? Number(flag("spent")) : 0,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const l = out.listing;
  if (!l) {
    console.log(out.why || "rien à dire");
    if (out.alternatives?.length) console.log(`\nce que XTB propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    process.exit(0);
  }

  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange || "—"}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}\n`
  );

  if (out.trade) {
    const t = out.trade;
    console.log(
      `${t.shares ? `${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ` : ""}` +
        `${t.notional.toFixed(2)} ${t.currency}` +
        (t.notionalUsd != null ? ` (${t.notionalUsd.toFixed(2)} $)` : "")
    );
    console.log();
  }

  console.log(`aller-retour     : ${out.usd == null ? `N/A${out.why ? ` — ${out.why}` : ""}` : `${out.usd} $`}`);
  console.log(`frais du courtier: ${out.brokerFees == null ? "N/A" : `${out.brokerFees} $`}`);
  if (out.parts) {
    for (const [name, v] of Object.entries(out.parts)) {
      if (v != null) console.log(`  ${name.padEnd(15)}: ${v} $`);
    }
  }
  console.log();
  console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);
  if (out.remark) for (const r of out.remark.split("\n")) console.log(`  · ${r}`);
  if (out.url) console.log(`\n${out.url}`);
}
