// What one round trip costs at Nordnet Danmark (Nordnet Bank AB's Danish
// branch): buy n shares at price p online, in the app or on nordnet.dk,
// sell them straight back, in dollars. The account is an aktiedepot in
// kroner. Phone orders are another ticket and are not this one.
//
// Price list read on 2026-10-19:
//   https://www.nordnet.dk/kundeservice/prisliste/standard-bonus-pro
//   https://www.nordnet.dk/kundeservice/prisliste/kurtageklasser
// The class follows the number of commission-bearing trades in the
// previous calendar month: Standard (0-19), Bonus (20-39), Pro (40 or
// more, or DKK 2 million held). The client does not choose it, so the
// total is Standard, and the cheaper classes are the remark.
//
//   Nordic: Copenhagen, First North, NGM, Spotlight, Stockholm, Oslo
//   (Oslo Børs, Expand, Growth) and Helsinki
//     Standard 0.10 %, Bonus 0.075 %, Pro 0.05 %, minimum 25 DKK.
//   Xetra, Nasdaq and NYSE, Toronto and TSX Venture, and the local
//   exchanges of the UK, France, Belgium, Ireland, the Netherlands,
//   Portugal, Switzerland, Italy, Austria and Spain
//     Standard 0.15 %, Bonus and Pro 0.10 %, minimum 25 DKK.
//   OTC Markets (OTCQX, OTCQB and "penny stock exempt" Pink)
//     Standard 0.15 % min 13 USD, Bonus 0.10 % min 12 USD, Pro 0.10 %
//     min 11 USD. The list prints this row only under phone trading, but
//     it is its own row, below the phone US row (0.30 % min 25 USD), and
//     the OTC FAQ says the listed OTC shares trade electronically
//     (https://www.nordnet.dk/faq/1843-amerikanske-otc-aktier). It is
//     read as the OTC commission.
//   The percentage is of the order; the minimum is in DKK (USD for OTC).
//   Shares and ETFs use the same rows.
//
// FX: an aktiedepot can hold SEK, NOK, USD, EUR and CAD accounts
// (deposits.mjs), so a line in one of those does not convert in the
// total; the remark is `FX 0.25% when cash ≠ CCY`, the automatic
// conversion when that account is not opened. GBP and CHF have no
// account and always convert automatically at 0.25 % each way, which is
// in the total.
//
// Taxes: the UK stamp duty the list prints (0.5 % on a buy of an
// LSE-primary share) and the French, Italian, Spanish and Irish
// transaction taxes come from taxMap.mjs. The ADR/GDR fee of the
// administering bank (0.005-0.05 USD a receipt) is a depositary charge,
// not a fee of this order, and is left out. The 10 DKK introductory
// commission of a new aktiesparekonto (three months), the student and
// Dansk Aktionærforening discounts, Active Trading and Private Banking
// are not this number.
//
// The US book: Nordnet Bank AB names Citigroup Global Markets for global
// equities (spreads/rule606.mjs, `nordnetse`), so a Nasdaq/NYSE line takes
// that firm's Q on the improved 605.
//
//   node brokers/nordnetdk/nordnetdk_cost.mjs NOVO-B XCSE DKK --shares=10 --price=300
//   node brokers/nordnetdk/nordnetdk_cost.mjs AAPL XNAS USD --shares=1 --price=230
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { isListedUsTape, listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, fxRemark, listingCash } from "../../fx.mjs";
import { taxesOf, taxRates, taxGap } from "../../taxMap.mjs";
import { depositHas } from "../../deposits.mjs";

const FOLDER = "nordnetdk";
const LABEL = "Nordnet Danmark";
const BASIS_TEXT = "prisliste";
const CLASS_TEXT = "Classe Standard (0 à 19 ordres le mois précédent)";
const CATALOGUE = new URL(`${FOLDER}-parsed.json`, import.meta.url);
const PAGE = "https://www.nordnet.dk/kundeservice/prisliste/standard-bonus-pro";
const READ_ON = "2026-10-19";
const CASH = "DKK";
const FX_AUTO = 0.0025;
// Nordnet Bank AB names one US dealer for every branch.
const US_DEALER = "nordnetse";

// Standard only: Bonus and Pro come from last month's trades.
const NORDIC = {
  name: "Norden",
  ccy: "DKK",
  classes: [
    {
      id: "Standard",
      rate: 0.001,
      min: 25,
      tiers: [
        { label: "20 to 39 trades a month", rate: 0.00075, min: 25 },
        { label: "40 or more", full: "40 or more trades a month", rate: 0.0005, min: 25 },
      ],
    },
  ],
};
const OUTSIDE = {
  name: "hors Norden",
  ccy: "DKK",
  classes: [{ id: "Standard", rate: 0.0015, min: 25, tiers: [{ label: "20 or more trades a month", rate: 0.001, min: 25 }] }],
};
const OTC = {
  name: "OTC Markets",
  ccy: "USD",
  classes: [
    {
      id: "Standard",
      rate: 0.0015,
      min: 13,
      tiers: [
        { label: "20 to 39 trades a month", rate: 0.001, min: 12 },
        { label: "40 or more", full: "40 or more trades a month", rate: 0.001, min: 11 },
      ],
    },
  ],
};

const SCHEDULE = {
  XCSE: NORDIC,
  DSME: NORDIC,
  XSTO: NORDIC,
  SSME: NORDIC,
  XNGM: NORDIC,
  NSME: NORDIC,
  XSAT: NORDIC,
  XOSL: NORDIC,
  XOAS: NORDIC,
  MERK: NORDIC,
  XHEL: NORDIC,
  FSME: NORDIC,
  XETR: OUTSIDE,
  XNAS: OUTSIDE,
  XNYS: OUTSIDE,
  XASE: OUTSIDE,
  ARCX: OUTSIDE,
  BATS: OUTSIDE,
  XTSE: OUTSIDE,
  XTSX: OUTSIDE,
  XTNX: OUTSIDE,
  XLON: OUTSIDE,
  XPAR: OUTSIDE,
  XAMS: OUTSIDE,
  XBRU: OUTSIDE,
  XMSM: OUTSIDE,
  XLIS: OUTSIDE,
  XMIL: OUTSIDE,
  XMAD: OUTSIDE,
  XWBO: OUTSIDE,
  XSWX: OUTSIDE,
  OTCM: OTC,
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

function convert(amount, from, to) {
  if (code(from) === code(to)) return Number(amount);
  const usd = toUsd(amount, from);
  const per = usdPer(to);
  if (usd == null || !(per > 0)) return null;
  return usd / per;
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

const converts = (currency) => !depositHas(FOLDER, null, listingCash(currency));

// The cheapest class the account can take for this order, in the
// currency of the minimum.
export function cheapestClass(classes, amount) {
  if (!classes?.length || amount == null) return null;
  let best = null;
  for (const cls of classes) {
    const fee = Math.max(cls.min, amount * cls.rate);
    if (!best || fee < best.fee) best = { ...cls, fee };
  }
  return best;
}

// A cheaper activity class as "x% lower", a cut of the commission of the
// class in the total, at this order's amount in the fee currency (minimums
// included), or at the bare rates when no amount is known. A tier no
// cheaper here is left out.
function tierRemark(cls, amount) {
  if (!cls?.tiers) return "";
  const feeOf = (rate, min) => Math.max(min, amount * rate);
  const out = [];
  for (const t of cls.tiers) {
    const x =
      amount > 0
        ? ((feeOf(cls.rate, cls.min) - feeOf(t.rate, t.min)) / feeOf(cls.rate, cls.min)) * 100
        : ((cls.rate - t.rate) / cls.rate) * 100;
    const v = x >= 10 ? Math.round(x) : Number(x.toFixed(1));
    if (v > 0) out.push(`${out.length ? t.label : t.full ?? t.label}: ${out.length ? "" : "fees are "}${v}% lower`);
  }
  return out.length ? `${out.join("; ")}.` : "";
}

function remarkOf(cls, currency, row, amount = null) {
  const lines = [];
  if (row?.remark) lines.push(row.remark);
  const tier = tierRemark(cls, amount);
  if (tier) lines.push(tier);
  if (currency !== CASH && !converts(currency)) lines.push(fxRemark((100 * FX_AUTO).toFixed(2), currency));
  return lines.join("\n");
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
    return { ...answer, why: `le catalogue ${LABEL} n'existe pas encore : lancer \`node brokers/${FOLDER}/${FOLDER}_scraping.mjs\`` };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue ${LABEL}` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez ${LABEL}`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const mic = m.venue?.mic ?? code(m.row.mic) ?? null;
  const usTape = isListedUsTape(mic) && code(m.row.currency) === "USD";
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: usTape ? US_DEALER : FOLDER,
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
  const market = SCHEDULE[code(mic)];
  const cashCurrency = converts(listing.currency) ? CASH : listingCash(listing.currency);
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const shared = {
    ...answer,
    cashCurrency,
    listing,
    remark: remarkOf(market?.classes.length === 1 ? market.classes[0] : null, listing.currency, m.row),
    basis: `${LABEL}, ${BASIS_TEXT} relue le ${READ_ON}. ${CLASS_TEXT}, ${market?.name || "marché inconnu"}.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    bp: marketBp,
    perShare: marketPerShare,
  };
  if (!market) return { ...shared, why: `pas de courtage publié pour ${listing.exchange}` };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const inFeeCcy = convert(notional, listing.currency, market.ccy);
  const chosen = cheapestClass(market.classes, inFeeCcy);
  const each = chosen?.fee ?? null;
  const commissionUsd = each == null ? null : dollars(each * 2, market.ccy);
  const fxUsd = !converts(listing.currency) ? 0 : notionalUsd == null ? null : notionalUsd * FX_AUTO * 2;
  const brokerFees = plus(commissionUsd, fxUsd);

  const tax = listing.isin ? taxesOf(listing.isin) : null;
  const taxPct = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const gap = taxGap(listing.isin, listing.type, listing.mic);
  const taxUsd = gap || notionalUsd == null ? null : notionalUsd * taxPct;

  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: usTape ? { source: "us605" } : m.venue,
    unsourced: usTape ? null : m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const unknown = [
    notionalUsd == null || commissionUsd == null ? `aucun cours en dollars pour ${listing.currency} ou ${market.ccy} dans fx.mjs` : null,
    bookUsd == null && notionalUsd != null
      ? usTape
        ? "pas de relevé NBBO pour cette ligne"
        : `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`
      : null,
    gap,
  ].filter(Boolean);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(unknown.length ? { why: unknown.join(" ; ") } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    remark: remarkOf(chosen ?? (market.classes.length === 1 ? market.classes[0] : null), listing.currency, m.row, inFeeCcy),
    commission: {
      each: finite(each, 6),
      eachWay: true,
      currency: market.ccy,
      rate: chosen?.rate ?? null,
      min: chosen?.min ?? null,
      class: chosen?.id ?? null,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      change: finite(fxUsd, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence: [
      shared.basis,
      converts(listing.currency) ? "change automatique 0,25 % chaque sens, pas de compte devise pour cette monnaie" : "pas de change : compte devise ouvert",
      taxPct ? `taxe à l'achat ${(taxPct * 100).toFixed(2)} % depuis taxMap.mjs` : "aucune taxe dans taxMap.mjs pour cet ISIN",
    ].join(" ; "),
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
  console.log(JSON.stringify(roundTrip({ etf, place, currency, shares: Number(arg("shares", "10")), price: Number(arg("price", "0")) }), null, 2));
}

printCli();
