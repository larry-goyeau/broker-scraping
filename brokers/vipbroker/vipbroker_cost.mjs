// What one round trip costs at VIP Broker Montenegro a.d. Podgorica in its
// E-trader: buy n shares on the Montenegro Stock Exchange (Montenegroberza)
// and sell them back, in dollars. Every line is in euro.
//
// Read on 2026-10-24.
//   https://www.vipbroker.net/docs/commissions_and_fees.pdf
//   https://www.vipbroker.net/docs/cjenovnik.pdf (the same list in Montenegrin)
//     "Commissions and fees of investment company VIP Broker Montenegro
//     A.D. Podgorica" (file of December 2021, still the one linked from
//     every page of the site), brokerage services, each buy and each sell:
//       transactions up to EUR 2,500.00     up to EUR 13.00 per transaction
//       transactions larger than EUR 2,500  up to 0.7% of transaction value
//       E-broker access fee                 "According to the Exchange's
//                                           price list"
//     The list prints maximums ("Up to", "Do"). The number takes those
//     maximums: they are what the client may be charged. The closing line
//     ("The Company holds right to ... provide discounts") is not a
//     published rate and gives no remark.
//   https://www.vipbroker.net/docs/general_terms_and_conditions.pdf
//   https://www.vipbroker.net/docs/opsti_uslovi_poslovanja.pdf
//     "The commission, which represents the transaction cost for the
//     Investor, includes net commission of the brokerage house, stock
//     exchange and CDA commission, and it is determined by the brokerage
//     house price list" ("objedinjava proviziju brokerske kuće, berze i
//     CDA"). So the exchange and depository fees are inside the 13 EUR /
//     0.7 % and nothing is added for them. For the record, from their own
//     schedules:
//       Montenegroberza, Cjenovnik (prečišćen tekst, 30.06.2025), VII
//       Provizije: shares on the regulated market 0,15 %, shares on the MTP
//       0,20 % of the transaction value; III: "E broker" application, natural
//       person, 20 € a month, legal person 50 € a month, before VAT.
//         https://www.mnse.me/upload/documents/pdf/RegulativaSR/Cjenovnik-preciscen-tekst-MNSE-2025.pdf
//       CKDD (Centralno klirinško depozitarno društvo), Cjenovnik 2024, 2 / 1.1
//       clearing and settlement of equity transactions: 0.05 % each side,
//       not less than EUR 1.50.
//         https://www.ckdd.me/Content/documents/234/Cjenovnik%20CKDD-a_2024.pdf
//
//   Online: https://www.vipbroker.net/en/e-trader, "Input and execution of
//   orders in real time", so every line is bought online.
//
//   In the number: the book crossed and the broker's maximum commission,
//   each side. In the remark: the E-broker access fee, EUR 20 a month plus
//   VAT for a natural person (the exchange's price list, which VIP's list
//   points to). Not per trade.
//
//   Cash: client money sits on VIP's account at NLB Banka, in euro
//   (deposits.mjs), and every line is in euro: no conversion, no FX remark.
//   No custody fee is printed.
//
//   Book: spreads/venues.mjs has no Montenegro Stock Exchange (XMNX) entry
//   yet, so no book leaf exists and the total stays unknown until one does.
//   brokerFees is still given.
//
//   node brokers/vipbroker/vipbroker_cost.mjs TECG XMNX EUR --shares=500 --price=2.5
//   node brokers/vipbroker/vipbroker_cost.mjs EPCG XMNX EUR --shares=1000 --price=5.5
//   node brokers/vipbroker/vipbroker_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, listingCash, toUsd, usdPer } from "../../fx.mjs";
import { depositHas } from "../../deposits.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const FOLDER = "vipbroker";
const CATALOGUE = new URL("vipbroker-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.vipbroker.net/docs/commissions_and_fees.pdf",
  cjenovnik: "https://www.vipbroker.net/docs/cjenovnik.pdf",
  terms: "https://www.vipbroker.net/docs/general_terms_and_conditions.pdf",
  etrader: "https://www.vipbroker.net/en/e-trader",
  mnse: "https://www.mnse.me/upload/documents/pdf/RegulativaSR/Cjenovnik-preciscen-tekst-MNSE-2025.pdf",
  ckdd: "https://www.ckdd.me/Content/documents/234/Cjenovnik%20CKDD-a_2024.pdf",
  readOn: "2026-10-24",
  entity: "VIP Broker Montenegro a.d. Podgorica, E-trader",
};

// Each side, in euro. Published maximums; exchange and CKDD inside.
const COMMISSION = { flatEur: 13, flatUpToEur: 2500, rate: 0.007 };
// For the record only (inside the commission, per the general terms).
const INCLUDED = { mnseRegulated: 0.0015, mnseMtp: 0.002, ckdd: 0.0005, ckddMinEur: 1.5 };
const EBROKER_EUR_MONTH = 20;

const REMARK = `E-broker access is EUR ${EBROKER_EUR_MONTH} a month plus VAT.`;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

const MNSE_CODES = new Set(["XMNX", "MNSE", "MONTENEGROBERZA", "MONTENEGROSTOCKEXCHANGE", "PODGORICA"]);
const segmentOf = (row) => String(row?.raw || "").split(" | ")[3] || null;
const isMtp = (row) => /^MTP/i.test(segmentOf(row) || "");

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
      if (loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace) return true;
      if (MNSE_CODES.has(wantPlace)) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return false;
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
    cashCurrency: "EUR",
    url: SCHEDULE.url,
    remark: REMARK,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue VIP Broker n'existe pas encore : lancer `node brokers/vipbroker/vipbroker_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue VIP Broker` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez VIP Broker`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
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
    segment: segmentOf(m.row),
  };
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? (marketBp != null ? null : book.leaf?.perShare ?? null);
  const tax = taxesOf(listing.isin);
  const taxPct = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const cash = listingCash(listing.currency);
  const held = depositHas(FOLDER, null, cash);
  const mtp = isMtp(m.row);
  const shared = {
    ...answer,
    listing,
    cashCurrency: held ? cash : "EUR",
    bp: marketBp,
    perShare: marketPerShare,
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    basis:
      `tarif VIP Broker (« Commissions and fees », décembre 2021) relu le ${SCHEDULE.readOn} : jusqu'à 13 € par transaction ` +
      `jusqu'à 2 500 €, jusqu'à 0,7 % au-delà, chaque sens ; maximums publiés retenus. Les conditions générales disent que ` +
      `la commission comprend celles de la Bourse et de la CDA (CKDD) : rien n'est ajouté pour elles`,
  };
  if (!held) {
    return { ...shared, why: `VIP Broker ne tient pas de compte en ${cash}` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const notionalEur = listing.currency === "EUR" ? notional : null;
  const flat = notionalEur != null && notionalEur <= COMMISSION.flatUpToEur;
  const side = notionalEur == null ? null : flat ? COMMISSION.flatEur : notionalEur * COMMISSION.rate;
  const brokerFees = side == null ? null : dollars(side * 2, "EUR");
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxPct;
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const why = [
    notionalUsd == null ? `fx.mjs n'a pas de cours ${listing.currency}` : null,
    side == null ? `ligne en ${listing.currency} : le barème VIP Broker est en euros` : null,
    bookUsd == null
      ? `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${
          m.unsourced?.why || (m.venue ? "pas de feuille de carnet" : "spreads/venues.mjs n'a pas d'entrée XMNX, pas de feuille de carnet")
        }`
      : null,
  ].filter(Boolean);
  const confidence = [
    shared.basis,
    side == null
      ? "commission inconnue"
      : flat
        ? `transaction de ${notional.toFixed(2)} € ≤ 2 500 € : forfait maximum de 13 € par sens`
        : `transaction de ${notional.toFixed(2)} € > 2 500 € : 0,7 % maximum, ${side.toFixed(2)} € par sens`,
    `pour mémoire, inclus : Montenegroberza ${mtp ? "0,20 % (MTP)" : "0,15 % (marché réglementé)"}, CKDD 0,05 % (minimum 1,50 €) par sens`,
    taxPct ? `taxe ${(taxPct * 100).toFixed(2)} % depuis taxMap.mjs, en sus` : "aucune taxe de transaction dans taxMap.mjs",
    "ligne en euros, compte en euros : pas de change",
    "accès E-broker 20 € / mois + TVA (cjenovnik de la Bourse) en remarque",
    marketPerShare != null
      ? `carnet ${marketPerShare} € la part`
      : marketBp != null
        ? `carnet ${marketBp} bp`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(why.length ? { why: why.join(" ; ") } : {}),
    commission: {
      flat: COMMISSION.flatEur,
      flatUpTo: COMMISSION.flatUpToEur,
      rate: COMMISSION.rate,
      maximum: true,
      eachWay: true,
      currency: "EUR",
      thirdPartyIncluded: true,
    },
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      bourse: 0,
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
  const flag = (name) => {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({ ...SCHEDULE, commission: COMMISSION, included: INCLUDED, eBrokerEurMonth: EBROKER_EUR_MONTH }, null, 2));
    return;
  }
  const [etf, place, currency] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (!etf) {
    console.error("usage : node brokers/vipbroker/vipbroker_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
    process.exit(2);
  }
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
  });
  console.log(JSON.stringify(out, null, 2));
}

printCli();
