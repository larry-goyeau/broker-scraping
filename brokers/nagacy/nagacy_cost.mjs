// What one round trip costs at NAGA (NAGA Markets Europe Ltd, Cyprus, CySEC
// 204/13), real stocks and ETFs (the ".re" lines, 1:1, no leverage): buy n
// shares at price p, sell them back at once, online, in dollars. CFDs are
// another table and another account.
//
// Read on 2026-10-20:
//   https://naga.com/eu/trading/hours-and-fees                    (fee per line, "Real Stocks & ETFs" tab)
//   https://cms.naga.com/NAGA_Markets_Europe_Ltd_Costs_and_Charges_updated_commission_fee_updated_final_6e72896d30.pdf
//                                                                 (Costs and Charges Policy, version September 2026,
//                                                                  the one the EU legal page links)
//   https://cms.naga.com/NAGA_Markets_Europe_Ltd_Order_Execution_Policy_February_2026_3aae586dc4.pdf
//   https://naga.com/eu/investing/markets/bvb-romania              (BVB FAQ)
//   https://cms.naga.com/NME_VIP_Level_Programme_1_9160033908.pdf (VIP levels)
//   https://nagamarkets.zendesk.com/hc/en-gb/articles/13801518527516-How-can-I-add-a-trading-account
//
// Commission, per executed ticket, each way. The fee table gives it per line
// and each catalogue row keeps it in `raw` ("fee 1 EUR", "fee 0.3%*"):
//   every place but Bucharest   1 EUR a ticket (Policy 5.4.1: "a fixed
//                               transaction/execution fee of EUR 1 (or the
//                               equivalent amount in the relevant account
//                               currency) applies to each executed ticket";
//                               opening and closing are two tickets)
//   Bucharest (BVB)             0.30 % of the notional a leg (Policy 5.4.2,
//                               "regardless of monthly trading volume";
//                               5.9: zero settlement fee)
// The asterisk on "0.3%*" is the page's footnote pair: "Opening and closing
// a trade equals to 2 transactions to be charged with above fees, per
// transaction" and "An additional fee of 0.3% will be applied to nominal
// volumes exceeding 100,000 within a one-month period". The second is the
// 2025 BVB "0% commission" campaign (0 % up to 100 000 EUR a month, 0.3 %
// above), which the BVB FAQ says ended on 31 December 2025; the Policy's
// own BVB footnote is "Unless '0 Commission Offering' is applicable". So
// 0.3 % each way is charged on every BVB trade, and nothing is added on
// other lines. The help-centre article "What are the trading fees at NAGA?"
// still prints 3 EUR a side for real stocks and 0.10 % for ETFs; the
// Policy (September 2026) and the fee table agree on 1 EUR and win.
//
// VIP levels (Iron to Crystal) change spreads on CFDs, copy fees and
// signals; the Policy charges the same commission to "all the clients of
// the Company". One row, no plans.
//
// FX (Policy 5.5 and Order Execution Policy glossary): when the account
// currency is not the instrument's, a conversion fee is applied "on the
// Profit/Loss, Swap, Commission, Margin, Dividends, Rollovers and Splits, in
// the form of a markup": 2.50 % on major pairs and 3.50 % on minor ones, "up
// to 2.5% conversion fee apply to EUR & USD and up to 3.5% to all other
// currencies". The principal is not converted (Order Execution Policy §10:
// the base-currency quote "will not be reflected as an actual currency
// conversion in the client account"). Accounts open in EUR, USD, GBP, PLN
// and RON (deposits.mjs). A line in one of them keeps the rate in the remark
// (2.5 % for EUR and USD lines, 3.5 % for GBX and RON). A Tadawul (SAR) or
// Dubai (AED) line is converted by force: 3.5 % on the closing P/L, which
// for an instant round trip is the book, and on the two tickets, is in the
// total.
//
// Stamp and FTT come from taxMap.mjs (taxGap: an unknown leg is N/A). The
// Policy says the 1 EUR fee is "separate from any applicable third-party
// costs, exchange fees, taxes, stamp duties, financial transaction taxes,
// custody charges, or other statutory or regulatory charges, which may
// apply separately" and names none; SEC / TAF / CAT stay 0, UK PTM is not
// named and stays out. US orders: NAGA executes cash equities "through Saxo
// Bank A/S" and names EXT Ltd, SSIF Swiss Capital and VTC Europe for real
// stocks, no US broker-dealer. Saxo's RTS 28 gives US-traded shares to Citadel Securities LLC, so the
// US book is the blended 605 × Citadel's Q (alias in spreads/rule606.mjs).
//
// Not in this trip: swaps (CFDs), inactivity 20 EUR a month after six months
// with no order, transfer out of BVB shares 5 EUR a symbol, deposits and
// withdrawals 0.
//
//   node brokers/nagacy/nagacy_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node brokers/nagacy/nagacy_cost.mjs SAP XETR EUR --shares=10 --price=200
//   node brokers/nagacy/nagacy_cost.mjs TLV XBSE RON --shares=100 --price=30
//   node brokers/nagacy/nagacy_cost.mjs 2222 XSAU SAR --shares=100 --price=25
//   node brokers/nagacy/nagacy_cost.mjs --schedule
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

const FOLDER = "nagacy";
const CATALOGUE = new URL("nagacy-parsed.json", import.meta.url);

const SCHEDULE = {
  source: "https://naga.com/eu/trading/hours-and-fees",
  policy:
    "https://cms.naga.com/NAGA_Markets_Europe_Ltd_Costs_and_Charges_updated_commission_fee_updated_final_6e72896d30.pdf",
  policyVersion: "September 2026",
  execution: "https://cms.naga.com/NAGA_Markets_Europe_Ltd_Order_Execution_Policy_February_2026_3aae586dc4.pdf",
  bvbFaq: "https://naga.com/eu/investing/markets/bvb-romania",
  vip: "https://cms.naga.com/NME_VIP_Level_Programme_1_9160033908.pdf",
  readOn: "2026-10-20",
  entity: "NAGA Markets Europe Ltd (CY), real stocks",
};

// Conversion markup (Policy 5.5): EUR and USD 2.5 %, every other currency 3.5 %.
const FX_MAJOR = 0.025;
const FX_OTHER = 0.035;
const MAJOR = new Set(["EUR", "USD"]);
const INACTIVITY_EUR = 20;
const TRANSFER_OUT_EUR = 5;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(10));
};

const fxNote = (currency) => ({ quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(currency) });
const fxRateOf = (cash) => (MAJOR.has(cash) ? FX_MAJOR : FX_OTHER);

/** The fee the hours-and-fees table prints for this line, read from `raw`. */
export function feeOf(row) {
  const hit = String(row?.raw || "").match(/\bfee\s+([^|]+)/i);
  const text = hit ? hit[1].trim() : "";
  const flat = text.match(/^([\d.]+)\s*([A-Z]{3})$/);
  if (flat) return { kind: "flat", amount: Number(flat[1]), currency: flat[2], text };
  const pct = text.match(/^([\d.]+)\s*%\*?$/);
  if (pct) return { kind: "pct", rate: Number(pct[1]) / 100, starred: text.endsWith("*"), text };
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
    const fee = feeOf(r)?.text || "?";
    slot.fee[fee] = (slot.fee[fee] || 0) + 1;
  }
  return out;
}

/** One ticket, in dollars. */
export function commissionSide({ notional, currency, fee }) {
  if (!fee) return null;
  if (fee.kind === "flat") {
    const charged = dollars(fee.amount, fee.currency);
    return charged == null ? null : { charged, currency: QUOTE, rule: `${fee.amount} ${fee.currency}` };
  }
  const amountUsd = dollars(notional, currency);
  return amountUsd == null ? null : { charged: amountUsd * fee.rate, currency: QUOTE, rule: `${(100 * fee.rate).toFixed(2)} %` };
}

/**
 * The whole bill for buying `shares` at `price` and selling them straight back.
 * `usd` is the number the page prints; `brokerFees` is NAGA's two tickets and,
 * on a SAR or AED line, the conversion markup.
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
    return { ...answer, why: "le catalogue NAGA n'existe pas encore : lancer `node brokers/nagacy/nagacy_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue NAGA` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez NAGA`,
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
    fxIfConverted: held ? fxRate : 0,
    remark: held ? fxRemark((100 * fxRate).toFixed(2), cash) : "",
    url: book.leaf?.url ?? SCHEDULE.source,
  };

  if (!fee) {
    return {
      ...shared,
      basis: `table Hours and Fees lue le ${SCHEDULE.readOn}`,
      why: `aucun frais lisible dans la table NAGA pour cette ligne (${m.row.raw || "raw absent"})`,
    };
  }

  const basis =
    `table Hours and Fees et Costs and Charges Policy (${SCHEDULE.policyVersion}) lues le ${SCHEDULE.readOn} : ` +
    (fee.kind === "flat" ? `${fee.amount} ${fee.currency} par ticket exécuté, à chaque sens` : `${(100 * fee.rate).toFixed(2)} % du montant à chaque sens`) +
    (held ? "" : ` ; change forcé ${cash}, majoration ${(100 * fxRate).toFixed(1)} % sur le P/L et les tickets`);

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
  const buy = commissionSide({ notional, currency: listing.currency, fee });
  const sell = commissionSide({ notional, currency: listing.currency, fee });
  const commissionUsd = plus(buy?.charged ?? null, sell?.charged ?? null);

  const rates = taxRates(tax);
  const ratePct = Object.values(rates).reduce((s, r) => s + r, 0);
  const gap = taxGap(listing.isin, listing.type, listing.mic);
  const taxUsd = gap || notionalUsd == null ? null : notionalUsd * ratePct;

  const bookUsd =
    parts.a == null || parts.b == null || notionalUsd == null ? null : parts.a * notionalUsd + parts.b * n;
  // A forced conversion marks up what is converted: the closing P/L (the book
  // lost on an instant round trip) and the two tickets. The principal stays.
  const fxUsd = held ? 0 : bookUsd == null || commissionUsd == null ? null : fxRate * (bookUsd + commissionUsd);
  const brokerFees = plus(commissionUsd, fxUsd);
  const usd = plus(bookUsd, brokerFees, taxUsd);

  const why = [
    bookUsd == null
      ? `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`
      : null,
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
    commission: {
      rate: fee.kind === "pct" ? fee.rate : null,
      flat: fee.kind === "flat" ? fee.amount : null,
      flatCurrency: fee.kind === "flat" ? fee.currency : null,
      eachWay: true,
    },
    basis,
    confidence: confidenceOf({ fee, listing, marketBp, marketPerShare, book, unsourced: m.unsourced, held, cash, fxRate, rates, ratePct }),
  };
}

function confidenceOf({ fee, listing, marketBp, marketPerShare, book, unsourced, held, cash, fxRate, rates, ratePct }) {
  const said = [];
  said.push(
    `table Hours and Fees (${SCHEDULE.source}) et Costs and Charges Policy ${SCHEDULE.policyVersion} lues le ${SCHEDULE.readOn} : ` +
      `la ligne imprime « ${fee.text} »`
  );
  if (fee.kind === "flat") {
    said.push(
      `Policy 5.4.1 : ${fee.amount} ${fee.currency} par ticket exécuté, ouverture et clôture facturées séparément ; ` +
        `l'article d'aide « What are the trading fees » (3 € par sens) est plus ancien et contredit par la Policy`
    );
  } else {
    said.push(
      `Policy 5.4.2 et 5.9 : BVB ${(100 * fee.rate).toFixed(2)} % par jambe « regardless of monthly trading volume », règlement 0 ; ` +
        `l'astérisque renvoie à la campagne « 0 % commission » (jusqu'à 100 000 € par mois) close le 31/12/2025 selon la FAQ BVB`
    );
  }
  said.push(`niveaux VIP : spreads CFD, frais de copie et signaux, pas la commission des actions réelles : une seule ligne`);
  if (ratePct) said.push(`taxe à l'achat ${(100 * ratePct).toFixed(2)} % (${Object.keys(rates).join(", ")}), depuis taxMap.mjs`);
  if (["XNAS", "XNYS", "ARCX", "XASE", "BATS", "TXSE"].includes(code(listing.mic))) {
    said.push(`SEC, TAF et CAT non imprimés par NAGA : 0`);
  }
  if (code(listing.mic) === "XLON") said.push(`PTM non nommé par NAGA : hors total`);
  if (marketBp != null) said.push(`carnet publié ${Number(marketBp.toPrecision(4))} bp, aller-retour`);
  else if (marketPerShare != null) {
    said.push(
      book.via606
        ? `carnet Rule 605 × Q de Citadel Securities LLC, courtier US de Saxo (Q ${Number(book.q.toPrecision(4))}), ${marketPerShare} $ la part`
        : `carnet ${marketPerShare} $ la part (NBBO coté) : NAGA exécute via Saxo Bank A/S et ne nomme aucun broker-dealer US`
    );
  } else {
    said.push(
      `aucun carnet : ${unsourced?.name || listing.exchange}, ${unsourced?.why || "pas de source"}. Le total est N/A faute de mesure, pas faute de frais`
    );
  }
  said.push(
    held
      ? `ligne en ${cash}, devise de compte : pas de change dans le total ; un compte dans une autre devise majore de ${(100 * fxRate).toFixed(1)} % le P/L et les frais convertis`
      : `ligne en ${cash}, hors des devises de compte (EUR, USD, GBP, PLN, RON) : majoration ${(100 * fxRate).toFixed(1)} % ` +
          `(« all other currencies ») sur le P/L de clôture et les deux tickets, dans le total ; le principal n'est pas converti (Order Execution Policy §10)`
  );
  said.push(
    `hors total : inactivité ${INACTIVITY_EUR} € par mois après six mois sans ordre, transfert sortant BVB ${TRANSFER_OUT_EUR} € par titre, ` +
      `dépôts et retraits 0. Aucun aller-retour réel dans ce dépôt`
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
          fx: { major: FX_MAJOR, other: FX_OTHER, majorCurrencies: [...MAJOR] },
          inactivityEur: INACTIVITY_EUR,
          transferOutEur: TRANSFER_OUT_EUR,
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
      "usage : node nagacy_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--json]\n" +
        "        node nagacy_cost.mjs --schedule\n" +
        "  ex.   node nagacy_cost.mjs AAPL NASDAQ USD --shares=10 --price=230\n" +
        "        node nagacy_cost.mjs TLV XBSE RON --shares=100 --price=30"
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
    if (out.alternatives?.length) console.log(`\nce que NAGA propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
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
