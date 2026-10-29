// What one round trip costs at Axon Securities (Axon Securities S.A.,
// Athens, HCMC licence 7/560/02.09.2010; a NAGA white label at
// axontrader.eu): buy n shares at price p, sell them back at once, online,
// in dollars. Real (".re") stocks on the US exchanges, Xetra, Paris,
// Madrid, HKEX and Warsaw, and Greek shares on the Athens Stock Exchange.
// CFDs are another table.
//
// Read on 2026-10-28:
//   https://axontrader.eu/trading/hours-and-fees        (__NEXT_DATA__, "real_stocks" table and its notes)
//   https://axontrader.eu/documents/cost_and_charges_policy
//     -> Costs and Charges Policy - v1 - March 2024 - www.axontrader.eu.pdf
//   https://axontrader.eu/documents/order_execution_policy
//     -> Order Execution Policy - v1 - March 2024 - www.axontrader.eu.pdf
//   https://axontrader.eu/documents/client_agreement     (Client-Agreement-Axon Securities S.A.pdf)
//   https://axontrader.eu/greek-stock-market             (no price on the page)
//
// Commission, per transaction, each way. Every real-stock line of the table
// prints "3*" and each catalogue row keeps it in `raw` ("fee 3*"). The notes
// under the table: "*Opening and closing a trade equals to 2 transactions
// to be charged with above fees." and "In this respect, maximum commission
// per trade is €6.00 (or equivalent in other currencies)." So 3 EUR (or the
// equivalent in the account currency) on the buy and 3 EUR on the sale.
// The Costs and Charges Policy (March 2024) still prints "Commissions on
// Stocks: 0.99EUR (or equivalent in other currencies) for an in/out
// transaction" (Example 2, AAPL.re, 0.99 EUR each way); the live table is
// newer and wins, as in ../nagacy/nagacy_cost.mjs.
//
// Athens. No Axon page prices Greek shares (the table has no Athens block;
// the Greek Stock Market page names no fee). The Policy's "Stocks" line is
// one rate for every share and the table has since moved real stocks to
// 3 EUR a transaction, so a Greek share pays the same 3 EUR each way. No
// ATHEX, ATHEXClear or HCMC charge is printed by Axon: 0. The Greek sale
// tax is the seller's own tax item, not on the contract note
// (../hellenicamerican/hellenicamerican_cost.mjs); taxMap.mjs holds no
// Greek rate.
//
// FX. Accounts in EUR, USD or PLN ("using EUR, USD or PLN currency as a
// base for your account"; deposits.mjs). Policy 4.4: currency conversion is
// "the cost of converting realized profit and losses, adjustments, fees and
// charges that are dominated in a currency other than the base currency";
// Order Execution Policy §10: the base-currency quote "will not be
// reflected as an actual currency conversion in the Client account". So
// the principal is not converted. Axon prints no rate for that conversion.
// Stand-in, same group: NAGA Markets Europe's Policy 5.5, "up to 2.5%
// conversion fee apply to EUR & USD and up to 3.5% to all other
// currencies" (../nagacy/nagacy_cost.mjs, read 2026-10-20). A EUR, USD or
// PLN line keeps it in the remark (2.5 % EUR and USD, 3.5 % PLN). An HKD
// line is converted by force: 3.5 % on the closing P/L (the book lost on
// an instant round trip), the two tickets and the stamp, in the total.
// FX_STAND_IN = null turns those HKD lines to N/A.
//
// Taxes. Stamp and FTT from taxMap.mjs (French FTT 0.4 %, Spanish FTT
// 0.2 % on the buy; taxGap: an unknown leg is N/A). Hong Kong stamp duty
// 0.1 % on the buy and on the sale, rounded up to the HKD (none on an ETF
// or a REIT), as ../primehk/hkexCost.mjs computes it: a tax on the
// transfer, like the FTTs. The HKEX trading fee and the SFC / AFRC levies
// are not named by Axon and stay out, as UK PTM does at NAGA.
//
// US. Real stocks go to EXT Ltd (CySEC 165/12, EXANTE's Cyprus entity;
// Axon's Order Execution Policy §9), CFDs to Axon itself and Exante. EXT's
// own Client Order Execution Policy (v3.0/02.24, Annex 2) sends
// "Transferable Securities (US)" to Velocity Clearing, LLC (FINRA), now
// Tickrs Clearing; Number One Brokers and GTN Middle East are only its
// fallbacks. So the US book is the 605 × Tickrs Clearing's Q (alias in
// spreads/rule606.mjs), the quoted NBBO where no 605 line exists.
//   https://exante.eu/files/clients-orders-execution-policy_ext/
// SEC, TAF and CAT
// are not printed by Axon (only "* Other fees may apply" on the home page
// banner) and Axon is no US broker: 0, as at NAGA. TAF is paused by FINRA
// from 2026-10-01 to 2026-12-31 anyway.
//
// Not in this trip: dormant fee up to 10 units a month after six months
// with no deposit, withdrawal or trade (Client Agreement 24.5), withdrawal
// fee 0-5 EUR/USD/GBP by VIP level (Policy 4.5), swaps (CFDs).
//
//   node brokers/axon/axon_cost.mjs ALPHA XATH EUR --shares=1000 --price=1.8
//   node brokers/axon/axon_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/axon/axon_cost.mjs AA XNYS USD --shares=50 --price=40
//   node brokers/axon/axon_cost.mjs SAP XETR EUR --shares=10 --price=200
//   node brokers/axon/axon_cost.mjs AC XPAR EUR --shares=50 --price=45
//   node brokers/axon/axon_cost.mjs ACS XMAD EUR --shares=20 --price=60
//   node brokers/axon/axon_cost.mjs 00700 XHKG HKD --shares=100 --price=500
//   node brokers/axon/axon_cost.mjs ALE XWAR PLN --shares=100 --price=35
//   node brokers/axon/axon_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, fxRemark, listingCash } from "../../fx.mjs";
import { taxesOf, taxRates, taxGap } from "../../taxMap.mjs";
import { depositHas } from "../../deposits.mjs";
import { hkexSide, stampFree } from "../primehk/hkexCost.mjs";

const FOLDER = "axon";
const CATALOGUE = new URL("axon-parsed.json", import.meta.url);

const SCHEDULE = {
  source: "https://axontrader.eu/trading/hours-and-fees",
  policy: "https://axontrader.eu/documents/cost_and_charges_policy",
  policyVersion: "v1, March 2024",
  execution: "https://axontrader.eu/documents/order_execution_policy",
  agreement: "https://axontrader.eu/documents/client_agreement",
  greek: "https://axontrader.eu/greek-stock-market",
  readOn: "2026-10-28",
  entity: "Axon Securities S.A. (GR), real stocks",
};

// Per transaction, each way (table "3*", "or equivalent in other currencies").
const TICKET = { amount: 3, currency: "EUR" };
const MAX_PER_TRADE_EUR = 6;
// Stand-in FX markup, NAGA Markets Europe Policy 5.5: EUR and USD 2.5 %,
// every other currency 3.5 %. null = no stand-in (forced FX becomes N/A).
const FX_STAND_IN = { major: 0.025, other: 0.035, majorCurrencies: ["EUR", "USD"], from: "NAGA Markets Europe Ltd, Costs and Charges Policy 5.5 (September 2026)" };
const DEPOSITS = ["EUR", "USD", "PLN"];
const DORMANT_UNITS = 10;
const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS", "TXSE"]);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  if (amount == null || Number.isNaN(amount)) return null;
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(10));
};

const fxNote = (currency) => ({ quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(currency) });
const fxRateOf = (cash) =>
  FX_STAND_IN == null ? null : FX_STAND_IN.majorCurrencies.includes(cash) ? FX_STAND_IN.major : FX_STAND_IN.other;

/**
 * The fee of one line, each way. A real-stock row reads it from `raw`
 * ("fee 3*"); an Athens row (no Axon list) takes the same real-stock rate.
 */
export function feeOf(row) {
  const hit = String(row?.raw || "").match(/\bfee\s+([^|]+)/i);
  const text = hit ? hit[1].trim() : "";
  if (text) {
    const flat = text.match(/^([\d.]+)\s*(?:EUR|€)?\s*\*?$/i);
    return flat ? { amount: Number(flat[1]), currency: TICKET.currency, text, table: true } : null;
  }
  if (code(row?.mic) === "XATH") return { ...TICKET, text: "", table: false };
  return null;
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const resolved = place ? resolveVenue({ exchange: place, mic: place }) : {};
  const wantVenue = resolved.venue || null;
  const wantPlace = loose(place);
  const wantCurrency = code(currency);

  const named = rowsNamed(
    rows,
    asked,
    (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked
  );
  const exactCode = wantPlace ? named.filter((r) => loose(r.exchange) === wantPlace || loose(r.mic) === wantPlace) : [];
  const pool = exactCode.length ? exactCode : named;
  const matches = pool
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace || exactCode.length) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange).includes(wantPlace);
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

const listAlternatives = (named) =>
  named.map((r) => `${r.ticker || r.query || r.isin} ${r.currency || "?"} @ ${r.exchange || "place non dite"}`).slice(0, 12);

function coverage() {
  if (!rows.length) return null;
  const out = {};
  for (const r of rows) {
    const { venue, unsourced } = listingKey(r);
    const book = spreadLeaf(spreads, {
      isin: r.isin,
      mic: venue?.mic ?? null,
      currency: r.currency,
      unsourced,
      broker: FOLDER,
      ticker: r.ticker,
    });
    const key = `${r.mic || venue?.mic || "?"} ${r.currency}`;
    const slot = (out[key] ||= { n: 0, withBook: 0, fee: {} });
    slot.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) slot.withBook += 1;
    const fee = feeOf(r);
    const label = fee ? (fee.table ? fee.text : `${fee.amount} ${fee.currency} (Athènes)`) : "?";
    slot.fee[label] = (slot.fee[label] || 0) + 1;
  }
  return out;
}

/** One ticket, in dollars. */
export function commissionSide(fee) {
  if (!fee) return null;
  const charged = dollars(fee.amount, fee.currency);
  return charged == null ? null : { charged, currency: QUOTE, rule: `${fee.amount} ${fee.currency}` };
}

/** Hong Kong stamp of the trip (buy and sale), in dollars; 0 off HKEX. */
function hkStampUsd({ mic, row, notional, currency }) {
  if (mic !== "XHKG") return { usd: 0, free: null };
  const free = stampFree(row);
  if (free) return { usd: 0, free };
  const side = hkexSide(notional, currency);
  if (side == null) return { usd: null, free: null };
  return { usd: dollars(2 * side.stamp, currency), free: null, each: side.stamp };
}

/**
 * The whole bill for buying `shares` at `price` and selling them straight back.
 * `usd` is the number the page prints; `brokerFees` is Axon's two tickets and,
 * on an HKD line, the conversion markup.
 */
export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null, plan = null }) {
  const answer = {
    usd: null,
    brokerFees: null,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "",
    plan: plan || "",
    url: SCHEDULE.source,
  };

  if (!catalogue) {
    return { ...answer, why: "le catalogue Axon n'existe pas encore : lancer `node brokers/axon/axon_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Axon` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Axon`,
      alternatives: listAlternatives(named),
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
  const rowMic = code(m.row.mic || m.venue?.mic);
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? m.row.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
    query: m.row.query || null,
  };

  const fee = feeOf(m.row);
  const cash = listingCash(listing.currency);
  const held = depositHas(FOLDER, null, cash);
  const fxRate = fxRateOf(cash);

  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const marketBp = bp ?? (marketPerShare != null ? null : book.leaf?.bp ?? null);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: marketPerShare != null ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (value) => dollars(value, listing.currency),
  });
  const tax = listing.isin ? taxesOf(listing.isin) : null;

  const shared = {
    ...answer,
    listing,
    cashCurrency: held ? cash : "",
    bp: marketBp,
    perShare: marketPerShare,
    via606: book.via606 ?? false,
    q: book.q ?? null,
    tax,
    fx: fxNote(listing.currency),
    fxIfConverted: held && fxRate != null ? fxRate : 0,
    remark: held && fxRate != null ? fxRemark((100 * fxRate).toFixed(2), cash) : "",
    url: book.leaf?.url ?? SCHEDULE.source,
  };

  if (!fee) {
    return {
      ...shared,
      basis: `table Hours and Fees lue le ${SCHEDULE.readOn}`,
      why: `aucun frais lisible dans la table Axon pour cette ligne (${m.row.raw || "raw absent"})`,
    };
  }

  const basis =
    `table Hours and Fees lue le ${SCHEDULE.readOn} : ${fee.amount} ${fee.currency} (ou l'équivalent) par transaction, ` +
    `ouverture et clôture = 2 transactions, plafond ${MAX_PER_TRADE_EUR} € par aller-retour` +
    (fee.table ? "" : ` ; Athènes absente de la table : même tarif des actions réelles`) +
    (held
      ? ""
      : fxRate == null
        ? ` ; change forcé ${cash}, taux non publié par Axon`
        : ` ; change forcé ${cash}, majoration ${(100 * fxRate).toFixed(1)} % (substitut NAGA Markets Europe) sur le P/L, les tickets et le timbre`);

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0) || !(p > 0)) {
    return {
      ...shared,
      basis,
      why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs",
    };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const buy = commissionSide(fee);
  const sell = commissionSide(fee);
  const commissionUsd = plus(buy?.charged ?? null, sell?.charged ?? null);

  const rates = taxRates(tax);
  const ratePct = Object.values(rates).reduce((s, r) => s + r, 0);
  const gap = taxGap(listing.isin, listing.type, listing.mic);
  const ftUsd = gap || notionalUsd == null ? null : notionalUsd * ratePct;
  const stamp = hkStampUsd({ mic: rowMic, row: m.row, notional, currency: listing.currency });
  const taxUsd = plus(ftUsd, stamp.usd);

  const bookUsd =
    parts.a == null || parts.b == null || notionalUsd == null ? null : parts.a * notionalUsd + parts.b * n;
  // A forced conversion marks up what is converted: the closing P/L (the book
  // lost on an instant round trip), the two tickets and the HKD stamp. The
  // principal stays in the listing currency.
  const fxUsd = held
    ? 0
    : fxRate == null || bookUsd == null || commissionUsd == null || stamp.usd == null
      ? null
      : fxRate * (bookUsd + commissionUsd + stamp.usd);
  const brokerFees = plus(commissionUsd, fxUsd);
  const usd = plus(bookUsd, brokerFees, taxUsd);

  const why = [
    bookUsd == null
      ? `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`
      : null,
    !held && fxRate == null ? `change ${cash} forcé (compte en EUR, USD ou PLN) au taux non publié par Axon` : null,
    stamp.usd == null ? "timbre de Hong Kong incalculable : HKD absent de fx.mjs" : null,
    gap,
  ].filter(Boolean);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(why.length ? { why: why.join(" ; ") } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    buy: { commission: finite(buy?.charged, 6), taxRates: Object.keys(rates).length ? rates : null },
    sell: { commission: finite(sell?.charged, 6) },
    parts: {
      marché: finite(bookUsd, 6),
      commission: finite(commissionUsd, 6),
      change: finite(fxUsd, 6),
      taxes: finite(taxUsd, 6),
    },
    commission: { flat: fee.amount, flatCurrency: fee.currency, eachWay: true },
    basis,
    confidence: confidenceOf({ fee, listing, rowMic, marketBp, marketPerShare, book, unsourced: m.unsourced, held, cash, fxRate, rates, ratePct, stamp }),
  };
}

function confidenceOf({ fee, listing, rowMic, marketBp, marketPerShare, book, unsourced, held, cash, fxRate, rates, ratePct, stamp }) {
  const said = [];
  said.push(
    fee.table
      ? `table Hours and Fees (${SCHEDULE.source}) lue le ${SCHEDULE.readOn} : la ligne imprime « ${fee.text} », ` +
          `« Opening and closing a trade equals to 2 transactions », plafond ${MAX_PER_TRADE_EUR} € par trade`
      : `aucune page Axon ne chiffre les actions grecques (${SCHEDULE.greek}) : tarif des actions réelles de la table Hours and Fees, ` +
          `${fee.amount} ${fee.currency} par transaction, frais ATHEX, ATHEXClear et HCMC non imprimés par Axon : 0`
  );
  said.push(
    `Costs and Charges Policy ${SCHEDULE.policyVersion} : « Commissions on Stocks: 0.99EUR » par sens (exemple AAPL.re), ` +
      `plus ancienne que la table : la table l'emporte`
  );
  if (ratePct) said.push(`taxe à l'achat ${(100 * ratePct).toFixed(2)} % (${Object.keys(rates).join(", ")}), depuis taxMap.mjs`);
  if (rowMic === "XHKG") {
    said.push(
      stamp.free
        ? `timbre de Hong Kong : 0 (${stamp.free})`
        : `timbre de Hong Kong 0,1 % à l'achat et à la vente, arrondi au HKD supérieur (${stamp.each ?? "N/A"} HKD par sens), ` +
            `frais HKEX, SFC et AFRC non nommés par Axon : hors total`
    );
  }
  if (US_MICS.has(code(listing.mic))) said.push(`SEC, TAF et CAT non imprimés par Axon, courtier non américain : 0`);
  if (marketBp != null) said.push(`carnet publié ${Number(marketBp.toPrecision(4))} bp, aller-retour`);
  else if (marketPerShare != null) {
    said.push(
      book.via606
        ? `carnet Rule 605 × Q (${Number(book.q.toPrecision(4))}), ${marketPerShare} $ la part`
        : `carnet ${marketPerShare} $ la part (NBBO coté, pas de ligne 605) ; les actions réelles passent par EXT Ltd, qui envoie les actions US à Velocity Clearing (Tickrs Clearing)`
    );
  } else {
    said.push(
      `aucun carnet : ${unsourced?.name || listing.exchange}, ${unsourced?.why || "pas de source"}. Le total est N/A faute de mesure, pas faute de frais`
    );
  }
  said.push(
    held
      ? fxRate == null
        ? `ligne en ${cash}, devise de compte : pas de change dans le total`
        : `ligne en ${cash}, devise de compte : pas de change dans le total, un compte dans une autre devise convertit le P/L et les frais, ` +
            `taux non publié par Axon, ${(100 * fxRate).toFixed(1)} % de NAGA Markets Europe en substitut`
      : fxRate == null
        ? `ligne en ${cash}, hors des devises de compte (EUR, USD, PLN) : change forcé au taux non publié`
        : `ligne en ${cash}, hors des devises de compte (EUR, USD, PLN) : majoration ${(100 * fxRate).toFixed(1)} % ` +
            `(substitut ${FX_STAND_IN.from}, « all other currencies ») sur le P/L de clôture, les deux tickets et le timbre, dans le total, ` +
            `le principal n'est pas converti (Order Execution Policy §10)`
  );
  said.push(
    `hors total : frais de dormance jusqu'à ${DORMANT_UNITS} unités par mois après six mois sans mouvement (Client Agreement 24.5), ` +
      `retrait 0 à 5 EUR/USD/GBP selon le niveau VIP. Aucun aller-retour réel dans ce dépôt`
  );
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
          ticket: TICKET,
          maxPerTradeEur: MAX_PER_TRADE_EUR,
          fxStandIn: FX_STAND_IN,
          deposits: DEPOSITS,
          us: { sec: null, taf: null, cat: null },
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
      "usage : node axon_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--json]\n" +
        "        node axon_cost.mjs --schedule\n" +
        "  ex.   node axon_cost.mjs AAPL XNAS USD --shares=10 --price=230\n" +
        "        node axon_cost.mjs ALPHA XATH EUR --shares=1000 --price=1.8"
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
    plan: flag("plan"),
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const l = out.listing;
  if (!l) {
    console.log(out.why || "rien à dire");
    if (out.alternatives?.length) console.log(`\nce qu'Axon propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    process.exit(0);
  }

  console.log(`${l.ticker || l.query || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange || "—"}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(
      `${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}` +
        (t.notionalUsd != null ? ` (${t.notionalUsd.toFixed(2)} $)` : "") +
        "\n"
    );
  }
  console.log(`aller-retour     : ${out.usd == null ? `N/A${out.why ? ` — ${out.why}` : ""}` : `${out.usd} $`}`);
  console.log(`frais du courtier: ${out.brokerFees == null ? "N/A" : `${out.brokerFees} $`}`);
  if (out.parts) {
    for (const [name, v] of Object.entries(out.parts)) if (v != null) console.log(`  ${name.padEnd(15)}: ${v} $`);
  }
  console.log();
  if (out.basis) console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ").filter(Boolean)) console.log(`  ${line}`);
  if (out.remark) for (const r of out.remark.split("\n")) console.log(`  · ${r}`);
  if (out.url) console.log(`\n${out.url}`);
}
