// What one round trip costs at Shares (shares.io): buy n shares at price p
// and sell them straight back, in dollars. The ordinary account (« compte
// titres », Shares Retail). The PEA, the managed plans and Shares Pro are
// other accounts and stay out.
//
// Retail fee page, read on 2026-10-18:
//   https://www.shares.io/fr/terms/fees
//   https://support.shares.io/fr/articles/89570-quels-sont-les-frais-de-transaction-sur-shares
//   Shares (EU, US) and ETFs, each buy and each sell
//     1 € for an order up to 500 € inclusive,
//     0.2 % of the gross amount above 500 €.
//   No plan tiers: every retail client pays this one table. Buys inside a
//   programmed investment plan (France only) are free and their sales pay
//   the table; that is a recurring buy, not this trip, so it is the remark.
//   No custody, no deposit or withdrawal fee, and « aucun frais de change
//   pour la conversion de devises étrangères ».
//
// Where the order goes. The 2026 best-selection policy (version of
// 19 May 2026) names the partners: EUR-listed shares, fractions and ETFs
// go to Upvest Securities GmbH, which executes on Tradegate Exchange or
// Quotrix (Börse Düsseldorf); USD-listed shares go to Alpaca Securities
// LLC. The catalogue writes each EUR line on both places and each one is
// priced on its own book. A US line is Alpaca's Rule 606 mix on the 605.
//   https://www.shares.io/fr/terms/best-execution-policy
//   https://cdn.prod.website-files.com/668fa7cba71e7a0773fff140/6a61ed14c6f1b0155168efb1_Politique_Meilleure_Selection_SFA_FR%202026%20(1).pdf
//
// Currency. Deposits are euros only. A US share is bought in euros:
// Shares converts to dollars on the buy and back to euros on the sale, at
// the market rate, and the fee page says no conversion fee is charged. So
// the conversion adds nothing here, and the 500 € threshold is read on the
// order converted to euros.
//   https://support.shares.io/fr/articles/69446-quel-est-l-impact-du-taux-de-change-et-pourquoi-affecte-t-il-mon-investissement
//
// Taxes. The help centre says the French FTT is collected and shown in
// the order preview; taxMap supplies the rate, on the buy. British stamp
// duty is dropped on the Upvest lines: Upvest settles through Clearstream
// and not CREST, and Upvest's own cost disclosure for a British share
// (measured in N26_cost.mjs, same executing firm) shows no duty. The PTM
// levy is per order and not a German-exchange charge. SEC, TAF and CAT on
// a US sale are not in Shares' table, so they are not copied (Alpaca pays
// them and leaves each partner to rebill them or not, as for Sarwa).
//   https://support.shares.io/fr/articles/89569-qu-est-ce-que-la-taxe-sur-les-transactions-financieres-ttf
//
//   node brokers/shares/shares_cost.mjs IE00B4L5Y983 Tradegate EUR --shares=10 --price=100
//   node brokers/shares/shares_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node brokers/shares/shares_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { isListedUsTape, listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { qOf } from "../../spreads/rule606.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("shares-parsed.json", import.meta.url);

const SCHEDULE = {
  fees: "https://www.shares.io/fr/terms/fees",
  feesHelp: "https://support.shares.io/fr/articles/89570-quels-sont-les-frais-de-transaction-sur-shares",
  fx: "https://support.shares.io/fr/articles/69446-quel-est-l-impact-du-taux-de-change-et-pourquoi-affecte-t-il-mon-investissement",
  ftt: "https://support.shares.io/fr/articles/89569-qu-est-ce-que-la-taxe-sur-les-transactions-financieres-ttf",
  execution:
    "https://cdn.prod.website-files.com/668fa7cba71e7a0773fff140/6a61ed14c6f1b0155168efb1_Politique_Meilleure_Selection_SFA_FR%202026%20(1).pdf",
  readOn: "2026-10-18",
  policyOn: "2026-05-19",
  entity: "Shares Financial Assets (RTO) ; EUR : Upvest Securities GmbH à Tradegate ou Quotrix ; USD : Alpaca Securities LLC",
  rule606: "alpaca",
};

const CASH = "EUR";
const FLAT_EUR = 1;
const FLAT_UP_TO_EUR = 500;
const RATE = 0.002;
const US_DEALER = SCHEDULE.rule606;
// Upvest settles through Clearstream; no stamp shows on its cost form.
const DROPPED_UPVEST = ["STAMP_DUTY"];
const UPVEST_MICS = new Set(["XGAT", "XQTX"]);

// Only a dollar line is exchanged, so only it carries the FX line.
const USD_REMARK = "No FX fee: a US share is bought and sold in euros at the market rate.";

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

// One order's ticket, in euros, from its amount in euros.
export function ticketEur(amountEur) {
  if (amountEur == null || !Number.isFinite(amountEur)) return null;
  return amountEur <= FLAT_UP_TO_EUR ? FLAT_EUR : amountEur * RATE;
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

export function roundTrip(query) {
  const out = priceTrip(query);
  const ccy = code(out.listing?.currency || query.currency);
  return { ...out, remark: ccy === "USD" ? USD_REMARK : "" };
}

function priceTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: CASH,
    url: SCHEDULE.fees,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Shares n'existe pas encore : lancer `node brokers/shares/shares_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Shares` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Shares`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const mic = m.venue?.mic ?? null;
  const american = code(m.row.currency) === "USD" && isListedUsTape(mic);
  const upvest = UPVEST_MICS.has(mic) && code(m.row.currency) === CASH;
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: american ? US_DEALER : "shares",
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

  const tax = taxesOf(listing.isin);
  const all = taxRates(tax);
  const rates = upvest ? Object.fromEntries(Object.entries(all).filter(([k]) => !DROPPED_UPVEST.includes(k))) : all;
  const dropped = upvest ? DROPPED_UPVEST.filter((k) => all[k] != null) : [];
  const taxPct = Object.values(rates).reduce((s, r) => s + r, 0);
  const q = american ? qOf(US_DEALER) : null;
  const marketBp = bp ?? (american ? null : book.leaf?.bp ?? null);
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;

  const basis =
    `barème Shares Retail, relu le ${SCHEDULE.readOn} : 1 € par ordre jusqu'à 500 € inclus, 0,2 % du montant brut au-delà, ` +
    `à l'achat et à la vente. ` +
    (upvest
      ? `Exécution Upvest à ${listing.exchange}.`
      : american
        ? `Exécution Alpaca Securities, montant ramené en euros pour le seuil ; carnet 605 × Q Alpaca` +
          (q != null ? ` ${Number(q.toFixed(3))}.` : " (pas de Q, NBBO coté).")
        : "");
  const shared = {
    ...answer,
    listing,
    cashCurrency: listing.currency === CASH ? CASH : "",
    basis,
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    bp: marketBp,
    perShare: marketPerShare,
  };
  if (!upvest && !american) {
    return { ...shared, why: `${listing.brokerExchange || listing.exchange} n'est ni une place Upvest en euros ni une cote US d'Alpaca` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const eurPerUsd = usdPer(CASH) ? 1 / usdPer(CASH) : null;
  const notionalEur = listing.currency === CASH ? notional : notionalUsd == null || eurPerUsd == null ? null : notionalUsd * eurPerUsd;
  const sideEur = ticketEur(notionalEur);
  const side = sideEur == null ? null : dollars(sideEur, CASH);
  const brokerFees = plus(side, side);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: american ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  // Stamp and transaction taxes are charged on the purchase only.
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxPct;
  const usd = plus(bookUsd, brokerFees, taxUsd);

  const confidence = [
    sideEur == null
      ? "ticket inconnu : pas de cours EUR/USD"
      : `ticket ${sideEur.toFixed(2).replace(".", ",")} € par sens (${notionalEur <= FLAT_UP_TO_EUR ? "forfait jusqu'à 500 €" : "0,2 % au-delà de 500 €"})`,
    american ? "SEC, TAF et CAT absents du barème Shares : non ajoutés" : "",
    dropped.length ? `droit de timbre britannique retiré : Upvest règle par Clearstream, pas par CREST` : "",
    taxPct > 0 ? `taxes à l'achat ${(100 * taxPct).toFixed(2).replace(".", ",")} % (taxMap)` : "",
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
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), notionalEur: finite(notionalEur, 6), currency: listing.currency },
    commission: {
      eachEur: finite(sideEur, 6),
      flatEur: FLAT_EUR,
      flatUpToEur: FLAT_UP_TO_EUR,
      rate: RATE,
      currency: CASH,
      eachWay: true,
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
          cash: CASH,
          ticket: { flatEur: FLAT_EUR, upToEur: FLAT_UP_TO_EUR, rateAbove: RATE, eachWay: true },
          fxFee: 0,
          places: { EUR: ["Tradegate (XGAT)", "Quotrix (XQTX)"], USD: ["NYSE", "Nasdaq", "NYSE American", "Cboe BZX"] },
          droppedTaxesOnUpvest: DROPPED_UPVEST,
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
    console.error("usage : node brokers/shares/shares_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
    process.exit(2);
  }
  console.log(JSON.stringify(roundTrip({ etf, place, currency, shares: Number(arg("shares", "10")), price: Number(arg("price", "0")) }), null, 2));
}

printCli();
