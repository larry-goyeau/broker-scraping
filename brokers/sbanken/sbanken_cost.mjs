// What one round trip costs at Sbanken (a brand of DNB Bank ASA, "Sbanken
// - et konsept fra DNB"): buy n shares at price p online, in the app or
// on dnb.no, sell them straight back, in dollars. The trading account
// (handlekonto for aksjer, or aksjesparekonto) is in kroner. Orders by
// phone (ordretelefon, 0.50 %) are not online and are not this number.
//
// Price list read on 2026-10-21 (Sbanken's web price list, "Priser
// aksjehandel" and "Kurtasjer aksjehandel utland"; the same table is on
// the aksjehandel page):
//   https://sbanken.no/priser
//   https://sbanken.no/spare/aksjer/aksjehandel
// The PDF the page links (Prisliste_spareprodukter, last published
// 09.01.2025) holds only the Norwegian rows and is older; the web table
// is the one used.
// Standard is the class a client is in unless placed elsewhere. Basis is
// a class the client can switch to himself (once every 30 days), so the
// bill is the cheaper of Standard and Basis for this order. Premium (more
// than 20 trades in a month, placed automatically) follows activity and
// is the remark. Ung (age 18 to 28, placed automatically) is not this
// number.
//
//   Norge (Oslo Børs, Euronext Expand and Growth Oslo), in NOK
//     Basis 0.12 % min 59, Standard 0.05 % min 79, Premium 0.04 % min 49
//   Sverige (Stockholm, First North, Spotlight, NGM), in SEK
//     Basis 0.12 % min 59, Standard 0.05 % min 79, Premium 0.04 % min 49
//   Danmark (Copenhagen, First North), in DKK
//     Basis 0.12 % min 59, Standard 0.05 % min 79, Premium 0.04 % min 49
//   Finland (Helsinki, First North), in EUR
//     Basis 0.12 % min 5, Standard 0.05 % min 7, Premium 0.04 % min 4
//   USA (USD), Canada (CAD), Storbritannia (GBP), Sveits (CHF) and Europa
//   øvrige (EUR)
//     Basis 0.20 % min 9, Standard 0.10 % min 10, Premium 0.09 % min 9,
//     the minimum in that row's currency
//   NOTC: Basis and Standard 0.30 % min 300 NOK, Premium 0.20 % min 200 NOK
// The table's footnotes ("* Tyskland, Nederland, Spania ** Belgia,
// Frankrike") hang on Storbritannia and Europa øvrige; DNB's own list,
// which runs the same trading, reads "Europa, øvrige*: Belgia, Frankrike,
// Tyskland, Nederland, Spania", so all five take the EUR row. The rates of
// the two rows are the same; only the minimum's currency differs.
//   https://www.dnb.no/markets/aksjer/prisliste-aksjehandel
//
// FX: the account holds kroner only (deposits.mjs). A trade in another
// currency is converted to kroner right after execution, buy and sell,
// and DNB says no FX fee is charged "beyond the exchange rate": the
// margin is in DNB's rate and no number is published. Sbanken prints a
// 0.25 % valutapåslag for funds (fondssparing) and 1.99 % for cards, not
// for shares or ETFs. That conversion is forced; FX_MARKUP takes the
// funds' 0.25 % for it, both legs, in the total. NOK lines (Oslo, NOTC,
// one Spotlight line) have no conversion.
//   https://www.dnb.no/markets/aksjer/utenlandske-aksjer
//
// Taxes: the French FTT (0.4 % on the buy since 1 April 2025, loi de
// finances 2025, CGI art. 235 ter ZD) and UK stamp duty (0.5 %, 1 % for
// some Irish shares) come from taxMap.mjs. Norway has no transaction
// tax. Custody of foreign shares (free up to NOK 250,000, then NOK 600 a
// year, 0.05 % a year above NOK 1.2 million) is small and is left out.
//
// The US book: no single US dealer is named (DNB lists several brokers it
// may route through), so a US line has no Rule 606 mix and its book is
// the quoted NBBO.
//   https://www.dnb.no/markets/aksjer/execution-venues-and-brokers
//
// In the total: the book, the commission each way, the tax. Remark: the
// Premium class when it is cheaper at this order's amount.
//
//   node brokers/sbanken/sbanken_cost.mjs EQNR XOSL NOK --shares=10 --price=270
//   node brokers/sbanken/sbanken_cost.mjs EQNR XOSL NOK --shares=1000 --price=270
//   node brokers/sbanken/sbanken_cost.mjs AAPL XNAS USD --shares=1 --price=230
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { isListedUsTape, listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, listingCash } from "../../fx.mjs";
import { taxesOf, taxRates, taxGap } from "../../taxMap.mjs";
import { depositHas } from "../../deposits.mjs";

const FOLDER = "sbanken";
const LABEL = "Sbanken";
// Forced conversion to kroner, each leg. DNB prints no rate for shares
// ("ingen egen valutakostnad utover vekslingskursen"); the only figure the
// group prints is Sbanken's 0.25 % valutapåslag on funds in a foreign
// currency (sbanken.no/priser, Prisliste_spareprodukter_01042024.pdf). It is
// taken for shares and ETFs too (owner decision, 2026-10-22).
const FX_MARKUP = 0.0025;
const CATALOGUE = new URL(`${FOLDER}-parsed.json`, import.meta.url);
const PAGE = "https://sbanken.no/priser";
const READ_ON = "2026-10-21";
const CASH = "NOK";

const PREMIUM = "More than 20 trades a month";
const nordic = (name, ccy, min) => ({
  name,
  ccy,
  classes: [
    { id: "Standard", rate: 0.0005, min: min.standard },
    { id: "Basis", rate: 0.0012, min: min.basis },
  ],
  premium: { label: PREMIUM, rate: 0.0004, min: min.premium },
});
const abroad = (name, ccy) => ({
  name,
  ccy,
  classes: [
    { id: "Standard", rate: 0.001, min: 10 },
    { id: "Basis", rate: 0.002, min: 9 },
  ],
  premium: { label: PREMIUM, rate: 0.0009, min: 9 },
});

const KRONE_MIN = { basis: 59, standard: 79, premium: 49 };
const NORGE = nordic("Norge", "NOK", KRONE_MIN);
const SVERIGE = nordic("Sverige", "SEK", KRONE_MIN);
const DANMARK = nordic("Danmark", "DKK", KRONE_MIN);
const FINLAND = nordic("Finland", "EUR", { basis: 5, standard: 7, premium: 4 });
const USA = abroad("USA", "USD");
const CANADA = abroad("Canada", "CAD");
const UK = abroad("Storbritannia", "GBP");
const SVEITS = abroad("Sveits", "CHF");
const EUROPA = abroad("Europa, øvrige", "EUR");
const NOTC = {
  name: "NOTC",
  ccy: "NOK",
  classes: [
    { id: "Standard", rate: 0.003, min: 300 },
    { id: "Basis", rate: 0.003, min: 300 },
  ],
  premium: { label: PREMIUM, rate: 0.002, min: 200 },
};

const SCHEDULE = {
  XOSL: NORGE,
  XOAM: NORGE,
  XOAS: NORGE,
  MERK: NORGE,
  NOTC,
  XSTO: SVERIGE,
  SSME: SVERIGE,
  FNSE: SVERIGE,
  XSAT: SVERIGE,
  XNGM: SVERIGE,
  XCSE: DANMARK,
  DSME: DANMARK,
  XHEL: FINLAND,
  FSME: FINLAND,
  XNYS: USA,
  XASE: USA,
  XNAS: USA,
  XNGS: USA,
  XNCM: USA,
  XNMS: USA,
  ARCX: USA,
  BATS: USA,
  XCHI: USA,
  TXSE: USA,
  IEXG: USA,
  XTSE: CANADA,
  XLON: UK,
  XSWX: SVEITS,
  XETR: EUROPA,
  XBRU: EUROPA,
  ALXB: EUROPA,
  XPAR: EUROPA,
  XPMC: EUROPA,
  ALXP: EUROPA,
  XAMS: EUROPA,
  XAMC: EUROPA,
  XMAD: EUROPA,
  XMCE: EUROPA,
  MABX: EUROPA,
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
const pct = (rate) => `${Number((rate * 100).toFixed(3))}`.replace(".", ",");

function convert(amount, from, to) {
  if (code(from) === code(to)) return Number(amount);
  const usd = toUsd(amount, from);
  const per = usdPer(to);
  if (usd == null || !(per > 0)) return null;
  return usd / per;
}

function marketOf(row, venue) {
  return SCHEDULE[code(row.mic)] || SCHEDULE[venue?.mic] || null;
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
      if (loose(m.row.mic) === wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

const converts = (currency) => !depositHas(FOLDER, null, listingCash(currency));

// The cheaper of the classes the client can pick for this order, in the
// currency of the minimum.
function cheapestClass(classes, amount) {
  if (!classes?.length || amount == null) return null;
  let best = null;
  for (const cls of classes) {
    const fee = Math.max(cls.min, amount * cls.rate);
    if (!best || fee < best.fee) best = { ...cls, fee };
  }
  return best;
}

// Premium as "x% lower" than the class in the total, x the cut of that
// class's fee at this order's amount in the fee currency (minimums
// included); whole when 10 or more, one decimal below. Left out when it is
// no cheaper here.
function premiumRemark(market, chosen, amount) {
  const t = market?.premium;
  if (!t || !chosen || !(amount > 0)) return "";
  const gap = ((chosen.fee - Math.max(t.min, amount * t.rate)) / chosen.fee) * 100;
  const v = gap >= 10 ? Math.round(gap) : Math.round(gap * 10) / 10;
  return v > 0 ? `${t.label}: fees are ${v}% lower.` : "";
}

function classText(market) {
  const c = market.classes.map((k) => `${k.id} ${pct(k.rate)} % min ${k.min} ${market.ccy}`).join(", ");
  return `${market.name} : ${c} (le moins cher des deux pour cet ordre)`;
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
  const mic = m.venue?.mic ?? (code(m.row.mic) || null);
  const usTape = isListedUsTape(mic) && code(m.row.currency) === "USD";
  // No US dealer is named: the key is Sbanken's own, no Q, the quoted NBBO.
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic,
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
    mic: book.mic ?? mic,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const market = marketOf(m.row, m.venue);
  const forced = converts(listing.currency);
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const shared = {
    ...answer,
    listing,
    basis:
      `${LABEL}, priser aksjehandel (en ligne, sbanken.no/priser) relues le ${READ_ON}. ` +
      (market ? `${classText(market)}, à l'achat et à la vente.` : "marché inconnu.") +
      (forced ? ` Change forcé en couronnes : ${FX_MARKUP * 100} % par conversion, à l'achat et à la vente (hypothèse).` : ""),
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    bp: marketBp,
    perShare: marketPerShare,
  };
  if (!market) {
    return { ...shared, why: `pas de courtage publié pour ${listing.exchange}` };
  }

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
  const fxUsd = forced ? (notionalUsd == null ? null : notionalUsd * FX_MARKUP * 2) : 0;
  const brokerFees = plus(commissionUsd, fxUsd);

  const tax = listing.isin ? taxesOf(listing.isin) : null;
  const taxPct = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const gap = taxGap(listing.isin, listing.type, listing.mic);
  const taxUsd = gap || notionalUsd == null ? null : notionalUsd * taxPct;

  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: usTape && marketBp == null && marketPerShare != null ? { source: "us605" } : m.venue,
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
    remark: premiumRemark(market, chosen, inFeeCcy),
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
      chosen ? `classe ${chosen.id} : ${Number(each.toFixed(2))} ${market.ccy} par sens${each === chosen.min ? " (minimum)" : ""}` : null,
      forced
        ? `change automatique en couronnes : ${FX_MARKUP * 100} % par sens, le valutapåslag que Sbanken imprime pour les fonds en devise, pris pour les actions (décision du propriétaire, 2026-10-22)`
        : "ligne en couronnes : pas de change",
      usTape ? "carnet NBBO coté : aucun courtier américain nommé" : null,
      taxPct ? `taxe à l'achat ${(taxPct * 100).toFixed(2)} % depuis taxMap.mjs` : "aucune taxe dans taxMap.mjs pour cet ISIN",
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
  console.log(JSON.stringify(roundTrip({ etf, place, currency, shares: Number(arg("shares", "10")), price: Number(arg("price", "0")) }), null, 2));
}

printCli();
