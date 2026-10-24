// What one round trip costs at Sahm Capital (Sahm Capital Financial Company,
// Riyadh, CMA licence): buy n shares, sell them back, in dollars. Online
// cash order on a Saudi line (Tadawul, Nomu) or a US line (Nasdaq, NYSE,
// NYSE American, NYSE Arca, Cboe BZX, Texas SE, OTC Markets). Options,
// margin, IPOs, funds and fractional orders stay out.
//
// Read on 2026-10-24:
//   https://www.sahmcapital.com/pricing                        ("Data as of 27 Jan 2026")
//   https://www.sahmcapital.com/support/detail/x?articleId=140  Saudi stock fees schedule
//   https://www.sahmcapital.com/support/detail/x?articleId=135  U.S. stock fees schedule
//   https://www.sahmcapital.com/support/detail/x?articleId=545  currency exchange fee
//   https://www.sahmcapital.com/support/detail/x?articleId=421  exchange rate source
//   https://www.sahmcapital.com/support/detail/x?articleId=544  US custodian (DTC)
//   https://www.sahmcapital.com/support/detail/x?articleId=440  ADR custody fee
//
// Saudi stocks, ETFs and REITs (Tadawul and Nomu), each side, SAR
//   commission        0 ("Limited Time Offer: Lifetime 0% Commission"; the
//                     list rate 0.105 % of the net amount is struck through)
//   CMA fee           0.030 % of the amount
//   Exchange fee      0.009 % (Tadawul)
//   Settlement fee    0.005 % (Edaa)
//   Safekeeping fee   0.001 % (Edaa)
//   Clearing fee      0.005 % (Muqassa)
//   VAT               15 % of commission + exchange + settlement +
//                     safekeeping + clearing (not the CMA fee); foreign
//                     investors are exempt
//   The schedule has one table for both boards and every product. The
//   Tadawul Group split (0.9 + 0.5 + 0.1 + 0.5 bp a party, for shares,
//   REITs and ETFs) is the 2022 CMA-approved structure; 0.105 + 0.030 +
//   0.020 is the 0.155 % statutory ceiling.
//   So a side costs 0.030 % + 0.020 % × 1.15 = 0.053 % of the amount.
//
// US stocks and ETFs (exchange and OTC lines alike), each side, USD
//   commission        0.015 USD a share, minimum 0.49 USD when the price is
//                     5 USD or less, 1.99 USD above; at most 1.5 % of the
//                     amount (read as a cap that wins over the minimum)
//   settlement fee    0.003 USD a share, minimum 0.01, maximum 7 % of the
//                     amount ("U.S. Clearing House")
//   SEC fee           0.00206 % of the sale, minimum 0.01 USD (sells only)
//   FINRA TAF         0.000195 USD a share, minimum 0.01, maximum 9.79 USD
//                     (sells only)
//   CAT fee           0.000003 USD a share, minimum 0.01 USD, both sides
//   VAT               15 % on all the fees above; foreign investors exempt
//   The schedule prints no separate OTC table, so OTC lines pay the same.
//   The ADR custody fee is the depositary's yearly holding fee, amount not
//   printed, and stays out.
//
// In the total: the book, every fee line above and its VAT (a Saudi
// resident's bill), and any transaction tax taxMap.mjs names for the ISIN.
// brokerFees is Sahm's own commission and the VAT on it.
// Remarks: the Nomu qualified-investor remark from the catalogue; "Fees
// might be x% lower if you are a non-Saudi investor." for the VAT a foreign
// investor does not pay ("Foreign investors are exempt from this fee"), when it
// reaches 0.01 % of the order; "FX when cash ≠ CCY." The account holds SAR
// and USD (deposits.mjs), so a line is never converted by force. Sahm
// prints no FX spread ("Real-time rates ... provided by banks"), only
// 1 SAR an exchange beyond ten a day, so the FX remark has no rate.
//
// US orders: the DTC page names the custodian account "Valuable Capital
// Securities LLC-OMNI" at Velocity Clearing (DTC 0294). Valuable Capital
// Securities, LLC is now Tickrs Clearing (CRD 312531), which files its own
// Rule 606 (2026 Q2 zip, 312531_606_NMS_2026_Q2_V1_20260729.xml: CODA
// Markets, Sage, Velocity Clearing). spreads/rule606.mjs maps sahm to that
// firm, so the US book is the 605 effective spread times Tickrs' Q. OTC
// lines have no 605/606: the book is the OTC Markets touch.
//
//   node brokers/sahm/sahm_cost.mjs 1120 Tadawul SAR --shares=100 --price=100
//   node brokers/sahm/sahm_cost.mjs 9300 Nomu SAR --shares=100 --price=10
//   node brokers/sahm/sahm_cost.mjs AAPL Nasdaq USD --shares=10 --price=230
//   node brokers/sahm/sahm_cost.mjs SPY "NYSE Arca" USD --shares=2 --price=650
//   node brokers/sahm/sahm_cost.mjs NSRGY OTC USD --shares=20 --price=100
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, listingCash, toUsd, usdPer } from "../../fx.mjs";
import { depositHas } from "../../deposits.mjs";
import { taxGap, taxRates, taxesOf } from "../../taxMap.mjs";

const CATALOGUE = new URL("sahm-parsed.json", import.meta.url);
const PAGE = "https://www.sahmcapital.com/pricing";
const PAGES = {
  SA: "https://www.sahmcapital.com/support/detail/x?articleId=140",
  US: "https://www.sahmcapital.com/support/detail/x?articleId=135",
  OTC: "https://www.sahmcapital.com/support/detail/x?articleId=135",
};
const READ_ON = "2026-10-24";
const VAT = 0.15;

// Saudi, each side, fraction of the amount.
const SA = {
  commission: 0, // lifetime 0 % offer; list rate 0.00105 struck through
  cma: 0.0003,
  exchange: 0.00009,
  settlement: 0.00005,
  safekeeping: 0.00001,
  clearing: 0.00005,
};
// US, each side.
const US = {
  perShare: 0.015,
  minLow: 0.49, // price ≤ 5 USD
  minHigh: 1.99, // price > 5 USD
  cap: 0.015, // 1.5 % of the amount
  settlePerShare: 0.003,
  settleMin: 0.01,
  settleCap: 0.07,
  sec: 0.0000206,
  secMin: 0.01,
  taf: 0.000195,
  tafMin: 0.01,
  tafMax: 9.79,
  cat: 0.000003,
  catMin: 0.01,
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
      // Tadawul and Nomu share the XSAU book: the board name decides.
      if (wantPlace === "NOMU" || wantPlace === "TADAWUL") return loose(m.row.exchange) === wantPlace;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace || loose(m.row.exchange).startsWith(wantPlace);
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

function marketOf(listing) {
  const mic = listing.mic;
  const place = loose(listing.brokerExchange);
  if (mic === "OTCM" || place.startsWith("OTC")) return "OTC";
  if (mic === "XSAU" || place === "TADAWUL" || place === "NOMU") return "SA";
  if (["XNAS", "XNYS", "ARCX", "XASE", "BATS", "TXSE"].includes(mic) || /NASDAQ|NEWYORK|NYSE|CBOE|TEXAS/.test(place)) return "US";
  return "";
}

// One side of a US ticket, USD, before VAT.
function usSide({ shares, price, sell }) {
  const notional = shares * price;
  const commission = Math.min(Math.max(shares * US.perShare, price <= 5 ? US.minLow : US.minHigh), notional * US.cap);
  const settlement = Math.min(Math.max(shares * US.settlePerShare, US.settleMin), notional * US.settleCap);
  const cat = Math.max(shares * US.cat, US.catMin);
  const sec = sell ? Math.max(notional * US.sec, US.secMin) : 0;
  const taf = sell ? Math.min(Math.max(shares * US.taf, US.tafMin), US.tafMax) : 0;
  return { commission, settlement, levy: sec + taf + cat, sec, taf, cat };
}

// Both sides of the ticket in the listing currency, VAT apart.
function ticket({ market, notional, shares, price }) {
  if (market === "SA") {
    const group = SA.exchange + SA.settlement + SA.safekeeping + SA.clearing;
    const side = {
      commission: notional * SA.commission,
      settlement: notional * group,
      levy: notional * SA.cma,
      vat: notional * (SA.commission + group) * VAT,
      vatOnCommission: notional * SA.commission * VAT,
    };
    return {
      commission: side.commission * 2,
      settlement: side.settlement * 2,
      levy: side.levy * 2,
      vat: side.vat * 2,
      vatOnCommission: side.vatOnCommission * 2,
      buy: side,
      sell: side,
    };
  }
  if (market === "US" || market === "OTC") {
    const buy = usSide({ shares, price, sell: false });
    const sell = usSide({ shares, price, sell: true });
    const commission = buy.commission + sell.commission;
    const settlement = buy.settlement + sell.settlement;
    const levy = buy.levy + sell.levy;
    return {
      commission,
      settlement,
      levy,
      vat: (commission + settlement + levy) * VAT,
      vatOnCommission: commission * VAT,
      buy,
      sell,
    };
  }
  return null;
}

const BASIS = {
  SA: `livraison en ligne, barème saoudien relu le ${READ_ON}. Commission 0 (offre « Lifetime 0% Commission », 0,105 % barré), CMA 0,030 %, Tadawul 0,009 %, Edaa 0,005 % + 0,001 %, Muqassa 0,005 %, TVA 15 % sur tout sauf la CMA : 0,053 % par sens. Vente identique.`,
  US: `livraison en ligne, barème américain relu le ${READ_ON}. Commission 0,015 USD l'action (plancher 0,49 USD jusqu'à 5 USD, 1,99 USD au-delà, plafond 1,5 % du montant), règlement 0,003 USD l'action (min 0,01, max 7 %), CAT 0,000003 USD l'action (min 0,01) à chaque sens ; SEC 0,00206 % (min 0,01) et TAF 0,000195 USD l'action (min 0,01, max 9,79) à la vente ; TVA 15 % sur l'ensemble.`,
  OTC: `livraison en ligne, barème américain relu le ${READ_ON}, sans table OTC à part : mêmes lignes que la cote. Commission 0,015 USD l'action (plancher 0,49 USD jusqu'à 5 USD, 1,99 USD au-delà, plafond 1,5 % du montant), règlement 0,003 USD l'action (min 0,01, max 7 %), CAT 0,000003 USD l'action (min 0,01) à chaque sens ; SEC 0,00206 % (min 0,01) et TAF 0,000195 USD l'action (min 0,01, max 9,79) à la vente ; TVA 15 % sur l'ensemble.`,
};

// The VAT a foreign investor does not pay, buy and sell together, in % of
// the order. Below 0.01 % it is left out.
function vatRemark(vat, notional) {
  if (!(notional > 0) || !(vat > 0)) return "";
  const x = (100 * vat) / notional;
  if (x < 0.01) return "";
  return `Fees might be ${Number(x.toFixed(2))}% lower if you are a non-Saudi investor.`;
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
    url: PAGE,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Sahm n'existe pas encore : lancer `node brokers/sahm/sahm_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Sahm` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Sahm`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "sahm",
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
  const market = marketOf(listing);
  const cash = listingCash(listing.currency);
  const held = depositHas("sahm", null, cash);
  const fxLine = held ? fxRemark("", listing.currency) : "";
  const shared = {
    ...answer,
    listing,
    cashCurrency: held ? cash : "",
    url: PAGES[market] || PAGE,
    basis: BASIS[market],
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    remark: [m.row.remark, fxLine].filter(Boolean).join("\n"),
  };
  if (!market) return { ...shared, why: `${listing.brokerExchange} n'a pas de ligne dans le barème Sahm` };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const bill = ticket({ market, notional, shares: n, price: p });
  const commissionUsd = dollars(Number(bill.commission.toPrecision(12)), listing.currency);
  const settlementUsd = dollars(Number(bill.settlement.toPrecision(12)), listing.currency);
  const levyUsd = dollars(Number(bill.levy.toPrecision(12)), listing.currency);
  const vatUsd = dollars(Number(bill.vat.toPrecision(12)), listing.currency);
  const vatOnCommissionUsd = dollars(Number(bill.vatOnCommission.toPrecision(12)), listing.currency);
  // Both currencies of the listing are deposit currencies: no forced FX.
  // Anything else would be converted at a rate Sahm does not print.
  const fxUsd = held ? 0 : null;
  const brokerFees = plus(commissionUsd, vatOnCommissionUsd, fxUsd);

  const tax = taxesOf(listing.isin);
  const rates = taxRates(tax);
  const taxRate = Object.values(rates).reduce((s, r) => s + r, 0);
  const gap = taxGap(listing.isin, listing.type, listing.mic);
  const taxUsd = gap || notionalUsd == null ? null : notionalUsd * taxRate;

  let marketBp = bp ?? book.leaf?.bp ?? null;
  let marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  if (market === "US" && bp == null && perShare == null) {
    const quoted = usBookPerShare({ broker: "sahm", ticker: listing.ticker, fallback: marketPerShare });
    if (quoted != null) marketPerShare = quoted;
  }
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: market === "US" && marketBp == null && marketPerShare != null ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, commissionUsd, settlementUsd, levyUsd, vatUsd, taxUsd, fxUsd);
  const unknown = [
    held ? null : `change forcé vers ${listing.currency} : Sahm n'imprime pas d'écart de change`,
    bookUsd == null ? `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` : null,
    gap,
  ].filter(Boolean);

  return {
    ...shared,
    remark: [m.row.remark, vatRemark(bill.vat, notional), fxLine].filter(Boolean).join("\n"),
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    bp: marketBp,
    perShare: marketPerShare,
    ...(unknown.length ? { why: unknown.join(" ; ") } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { buy: bill.buy.commission, sell: bill.sell.commission, currency: listing.currency },
    levy: { amount: bill.levy, currency: listing.currency },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      règlement: finite(settlementUsd, 6),
      réglementaire: finite(levyUsd, 6),
      tva: finite(vatUsd, 6),
      taxes: finite(taxUsd, 6),
      change: finite(fxUsd, 6),
    },
    tax,
    confidence: [
      shared.basis,
      market === "SA"
        ? "commission à 0 tant que dure l'offre « Lifetime 0% Commission » ; frais CMA, Tadawul, Edaa et Muqassa imprimés par Sahm et conformes à la grille du groupe Tadawul de 2022 ; un seul tableau pour Tadawul et Nomu"
        : null,
      market === "US" || market === "OTC"
        ? "le plafond de 1,5 % est lu comme l'emportant sur le plancher ; TVA 15 % comptée (résident saoudien), les investisseurs étrangers en sont exemptés"
        : null,
      market === "SA" ? "TVA 15 % comptée (résident saoudien), les investisseurs étrangers en sont exemptés" : null,
      market === "OTC" ? "OTC : pas de 605 ni de 606, carnet OTC Markets ; frais de garde d'ADR possibles, non chiffrés" : null,
      market === "US"
        ? "carnet : 605 effectif × Q du 606 de Tickrs Clearing (ex-Valuable Capital Securities, CRD 312531), l'intermédiaire américain nommé par la page DTC de Sahm"
        : null,
      "aucun aller-retour réel chez Sahm dans ce dépôt",
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
  const [symbol, place, currency] = process.argv.slice(2).filter((item) => !item.startsWith("--"));
  console.log(JSON.stringify(roundTrip({
    etf: symbol,
    place,
    currency,
    shares: Number(arg("shares", "10")),
    price: Number(arg("price", "0")),
  }), null, 2));
}

printCli();
