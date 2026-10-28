// What one round trip costs at Nordnet Norge (Nordnet Bank AB's Norwegian
// branch): buy n shares at price p online, in the app or on nordnet.no,
// sell them straight back, in dollars. The account is an aksje- og
// fondskonto in kroner. Phone orders are another ticket and are not this
// one.
//
// Price list read on 2026-10-19:
//   https://www.nordnet.no/kundeservice/prisliste
// Normal is the standard class. Mini is a class the client picks under
// "Mine sider" and can change, so the bill is the cheaper of Normal and
// Mini for this order. Bonus (more than 15 Normal trades in a month) and
// VIP (more than 30) follow activity and are the remark when Normal is
// the cheaper class. The welcome price of a new account (this month and
// next), the student discount, Active Trading and Private Banking are not
// this number.
//
//   Nordic: Oslo Børs, Stockholm, Copenhagen and Helsinki (the page's
//   heading; Expand, Euronext Growth Oslo, First North, NGM, Nordic SME
//   and Spotlight are read as the same Nordic markets)
//     Normal 0.049 % min 79 NOK, Mini 0.15 % min 29 NOK
//     (Bonus 0.04 % min 69, VIP 0.035 % min 39)
//   Outside the Nordics: USA, Canada, UK, Germany, Portugal, Belgium,
//   France, Netherlands, Ireland, Switzerland, Italy, Austria and Spain,
//   on Nasdaq, NYSE, Toronto, TSX Venture, LSE, Xetra, Euronext Lisbon,
//   Brussels, Paris, Amsterdam and Dublin, SIX, Vienna, Milan and Madrid
//     Normal 0.1 % min 99 NOK, Mini 0.2 % min 49 NOK
//     (Bonus 0.09 % min 89, VIP 0.08 % min 79)
//   Shares, ETFs and ETPs use the same rows. Warsaw is phone-only and is
//   not in the catalogue. OTC Markets is not among the places the page
//   names, so an OTC line has no published commission and is N/A.
//
// FX: kroner are the account; SEK, DKK, EUR, CAD and USD can have a
// currency account (deposits.mjs), so a line in one of those does not
// convert in the total and the remark is `FX 0.25% when cash ≠ CCY`, the
// automatic conversion ("0,25 % ved kjøp og 0,25 % ved salg"). Exchanging
// yourself on the currency account is 0.075 % each way, which is not this
// trip. GBP and CHF have no account and always convert automatically at
// 0.25 % each way, which is in the total.
//
// Taxes: the UK, Irish, French, Spanish and Italian stamp duties and
// transaction taxes the page names come from taxMap.mjs. The ADR/GDR fee
// of the administering bank is a depositary charge, not a fee of this
// order, and is left out.
//
// The US book: Nordnet Bank AB names Citigroup Global Markets for global
// equities (spreads/rule606.mjs, `nordnetse`), so a Nasdaq/NYSE line takes
// that firm's Q on the improved 605.
//
//   node brokers/nordnetno/nordnetno_cost.mjs EQNR XOSL NOK --shares=10 --price=270
//   node brokers/nordnetno/nordnetno_cost.mjs AAPL XNAS USD --shares=1 --price=230
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

const FOLDER = "nordnetno";
const LABEL = "Nordnet Norge";
const BASIS_TEXT = "prisliste";
const CLASS_TEXT = "La moins chère des classes Normal et Mini";
const CATALOGUE = new URL(`${FOLDER}-parsed.json`, import.meta.url);
const PAGE = "https://www.nordnet.no/kundeservice/prisliste";
const READ_ON = "2026-10-19";
const CASH = "NOK";
const FX_AUTO = 0.0025;
// Nordnet Bank AB names one US dealer for every branch.
const US_DEALER = "nordnetse";

const NORDIC = {
  name: "Norden",
  ccy: "NOK",
  classes: [
    {
      id: "Normal",
      rate: 0.00049,
      min: 79,
      tiers: [
        { label: "More than 15 trades a month", rate: 0.0004, min: 69 },
        { label: "more than 30", full: "More than 30 trades a month", rate: 0.00035, min: 39 },
      ],
    },
    { id: "Mini", rate: 0.0015, min: 29 },
  ],
};
const OUTSIDE = {
  name: "utenfor Norden",
  ccy: "NOK",
  classes: [
    {
      id: "Normal",
      rate: 0.001,
      min: 99,
      tiers: [
        { label: "More than 15 trades a month", rate: 0.0009, min: 89 },
        { label: "more than 30", full: "More than 30 trades a month", rate: 0.0008, min: 79 },
      ],
    },
    { id: "Mini", rate: 0.002, min: 49 },
  ],
};

const SCHEDULE = {
  XOSL: NORDIC,
  XOAS: NORDIC,
  MERK: NORDIC,
  XSTO: NORDIC,
  SSME: NORDIC,
  XNGM: NORDIC,
  NSME: NORDIC,
  XSAT: NORDIC,
  XCSE: NORDIC,
  DSME: NORDIC,
  XHEL: NORDIC,
  FSME: NORDIC,
  XNAS: OUTSIDE,
  XNYS: OUTSIDE,
  XASE: OUTSIDE,
  ARCX: OUTSIDE,
  BATS: OUTSIDE,
  XTSE: OUTSIDE,
  XTSX: OUTSIDE,
  XTNX: OUTSIDE,
  XLON: OUTSIDE,
  XETR: OUTSIDE,
  XLIS: OUTSIDE,
  XBRU: OUTSIDE,
  XPAR: OUTSIDE,
  XAMS: OUTSIDE,
  XMSM: OUTSIDE,
  XSWX: OUTSIDE,
  XWBO: OUTSIDE,
  XMIL: OUTSIDE,
  XMAD: OUTSIDE,
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

// A cheaper activity class as "x% lower" than the class in the total, x the
// cut of that class's fee at this order's amount in the fee currency
// (minimums included), or of its bare rate when no amount is known. Whole
// when 10 or more, one decimal below. A tier no cheaper here is left out.
function tierRemark(cls, amount) {
  if (!cls?.tiers) return "";
  const feeOf = (rate, min) => Math.max(min, amount * rate);
  const out = [];
  for (const t of cls.tiers) {
    const own = feeOf(cls.rate, cls.min);
    const gap = amount > 0 ? ((own - feeOf(t.rate, t.min)) / own) * 100 : ((cls.rate - t.rate) / cls.rate) * 100;
    const v = gap >= 10 ? Math.round(gap) : Math.round(gap * 10) / 10;
    if (v > 0) out.push(out.length ? `${t.label}: ${v}% lower` : `${t.full ?? t.label}: fees are ${v}% lower`);
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
