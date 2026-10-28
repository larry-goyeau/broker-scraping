// What one round trip costs at ABC Finance (ИП АВС Финанс АД, Sofia): buy n
// shares or ETF units on the Bulgarian Stock Exchange and sell them back, in
// dollars. Every catalogue line is XBUL and in euro: the BSE Main Market
// (regulated market: Premium, Standard, EuroBridge, Special Purpose
// Vehicles, Exchange Traded Products) and the BSE's own non-regulated
// markets, BaSE and BEAM.
//
// https://abc-finance.info/wp-content/uploads/tarifa_abc-finans_22-11-2021eur.xlsx
// (linked from https://abc-finance.info/za-klienti/tarifa/), approved by the
// Board on 22.11.2021, in force 23.12.2021, dual lev / euro labels until
// 31.12.2026, read on 2026-10-26. Section 3:
//   "Сделки на регулиран пазар на ценни книжа н страната:"
//     "до 5 000 лв./2 556.46 EUR"    "1.8% от размера на сделката"  min "10 лв./5.11 EUR"
//     "до 25 000 лв./12 782.30 EUR"  "1.4% от размера на сделката"  min 5.11 EUR
//     "до 50 000 лв./25 564.59 EUR"  "1% от размера на сделката"    min 5.11 EUR
//     "над 50 000 лв./25 564.59 EUR" "по договаряне"  (no figure: N/A above)
//   "Сделки на нерегулиран пазар на ценни книжа в страната"
//     "2% от размера на сделката", min "10 лв./5.11 EUR"   (BaSE, BEAM)
//   Order reception and cancellation: "без комисион".
// The tier is the order's value; its rate applies to the whole order. The
// tariff has one price for every channel (office, phone, e-mail and the
// "АВС трейдър" platform), so the online order pays it.
//
// The tariff prices only ABC's commission and says that for what it does not
// name "се прилагат таксите, определени в Тарифите на съответните институции
// – Централен депозитар АД, "Българска фондова борса" АД". So the BSE and
// Central Depository trade fees are added each way, with the figures
// BenchMark Finance's and UG Market's files read from those tariffs
// (../benchmark/benchmark_cost.mjs, read 2026-10-20):
//     BSE Main Market, shares (art. 21)           0.065%, min 0.51 €
//     BSE Main Market, exchange-traded products   0.075%, min 0.51 €
//     Central Depository, 3.3.2 Variant 1         1.00 € per T2S
//       settlement instruction
//   https://download.bse-sofia.bg/BSE-Rules/BSE_Tariff_of_fees_EN.pdf
//   https://www.csd-bg.bg/resources/docfiles/issuers/tarifa_na_uslugite_BG.pdf
// BaSE and BEAM trade on the same T7 book under the Main Market's rules and
// take its line, as at BenchMark and UG Market.
// Custody, section 4: 0.1% a year on cash (min 2.56 €) and 0.05% a year on
// securities for retail clients; that is the remark. VAT is charged on the
// portfolio-management fee only (section 5), not on trades. Primary-market
// and tender-offer lines, government bonds and repos are not this trip.
//
// Cash: the tariff is in euro and every line is in euro, so nothing is
// converted.
//
//   node brokers/abcfinance/abcfinance_cost.mjs SFA "Bulgarian Stock Exchange" EUR --shares=100 --price=8.6
//   node brokers/abcfinance/abcfinance_cost.mjs BGX "Bulgarian Stock Exchange" EUR --shares=800 --price=1.07
//   node brokers/abcfinance/abcfinance_cost.mjs FORM "Bulgarian Stock Exchange" EUR --shares=200 --price=4.3
//   node brokers/abcfinance/abcfinance_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const FOLDER = "abcfinance";
const CATALOGUE = new URL("abcfinance-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://abc-finance.info/wp-content/uploads/tarifa_abc-finans_22-11-2021eur.xlsx",
  page: "https://abc-finance.info/za-klienti/tarifa/",
  bse: "https://download.bse-sofia.bg/BSE-Rules/BSE_Tariff_of_fees_EN.pdf",
  csd: "https://www.csd-bg.bg/resources/docfiles/issuers/tarifa_na_uslugite_BG.pdf",
  inForce: "2021-12-23",
  readOn: "2026-10-26",
  thirdPartyReadOn: "2026-10-20",
  entity: "ИП АВС Финанс АД, АВС трейдър",
};

const CASH = "EUR";
// ABC Finance commission, each order, in euro. Regulated market by order
// value (upTo inclusive); above the last tier the fee is negotiated.
const BROKER = {
  regulated: {
    tiers: [
      { upTo: 2556.46, rate: 0.018 },
      { upTo: 12782.3, rate: 0.014 },
      { upTo: 25564.59, rate: 0.01 },
    ],
    min: 5.11,
  },
  nonRegulated: { tiers: [{ upTo: Infinity, rate: 0.02 }], min: 5.11 },
};
// BSE fee, each side, in euro (BaSE and BEAM take the Main Market line).
const BSE_FEE = { stock: { rate: 0.00065, min: 0.51 }, etp: { rate: 0.00075, min: 0.51 } };
// Central Depository settlement, each side, in euro.
const CSD_T2S = 1.0;

const REMARK = "Custody 0.05%/year on securities, 0.1%/year on cash.";
const PLACE = "Bulgarian Stock Exchange";

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

/** "regulated" for the BSE Main Market, "nonRegulated" for BaSE and BEAM. */
function segmentOf(row) {
  const c = loose(row?.exchange);
  if (!(c === loose(PLACE) || /^(BSESOF|XBUL|BSE|SOFIA)$/.test(c))) return null;
  const board = String(row?.raw || "").split(" | ")[2] || "";
  if (/^BSE MAIN MARKET/i.test(board)) return "regulated";
  if (/^(BASE ALTERNATIVE MARKET|BEAM)/i.test(board)) return "nonRegulated";
  return null;
}
const isEtp = (row) => code(row?.type || "STOCK") !== "STOCK";

/** Rate for an order of `amount` €, or null when the tariff says negotiated. */
function rateOf(rule, amount) {
  const tier = rule.tiers.find((t) => amount <= t.upTo);
  return tier ? tier.rate : null;
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const exact = wantPlace ? named.filter((r) => loose(r.exchange) === wantPlace) : [];
  const pool = exact.length ? exact : named;
  const wantVenue = !exact.length && place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const matches = pool
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace || exact.length) return true;
      if (loose(m.row.mic) === wantPlace) return true;
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
    cashCurrency: CASH,
    url: SCHEDULE.url,
    remark: REMARK,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue ABC Finance n'existe pas encore : lancer `node brokers/abcfinance/abcfinance_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue ABC Finance` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez ABC Finance`,
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
  };
  const segment = segmentOf(m.row);
  const brokerRule = segment ? BROKER[segment] : null;
  const bseRule = BSE_FEE[isEtp(m.row) ? "etp" : "stock"];
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? (marketBp != null ? null : book.leaf?.perShare ?? null);
  const tax = taxesOf(listing.isin);
  const taxPct = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const shared = {
    ...answer,
    listing,
    segment,
    bp: marketBp,
    perShare: marketPerShare,
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    basis: segment
      ? `tarif ABC Finance en vigueur le ${SCHEDULE.inForce}, relu le ${SCHEDULE.readOn}, section 3, ` +
        (segment === "regulated"
          ? "marché réglementé : 1,8 % jusqu'à 2 556,46 €, 1,4 % jusqu'à 12 782,30 €, 1 % jusqu'à 25 564,59 €, négocié au-delà"
          : "marché non réglementé (BaSE, BEAM) : 2 %") +
        `, minimum ${brokerRule.min} € par ordre, plus BFB ${(bseRule.rate * 100).toFixed(3)} % (plancher ${bseRule.min} €) et ` +
        `Dépositaire central ${CSD_T2S.toFixed(2)} € par instruction T2S, chaque sens ` +
        `(tarifs BFB et DC relus le ${SCHEDULE.thirdPartyReadOn} pour BenchMark)`
      : "",
  };
  if (!segment) return { ...shared, why: `${listing.brokerExchange || listing.exchange} : segment BSE inconnu, pas de ligne dans le tarif ABC Finance` };
  if (listing.currency !== CASH) return { ...shared, why: `ABC Finance tarife en euro ; ${listing.currency} n'est pas couvert` };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const rate = rateOf(brokerRule, notional);
  if (rate == null) {
    return {
      ...shared,
      why: `ordre de ${notional.toFixed(2)} € au-dessus de 25 564,59 € : courtage « по договаряне » (négocié), aucun chiffre publié`,
    };
  }
  const notionalUsd = dollars(notional, CASH);
  const commissionSide = Math.max(notional * rate, brokerRule.min);
  const bseSide = Math.max(notional * bseRule.rate, bseRule.min);
  const brokerFees = dollars(commissionSide * 2, CASH);
  const leviesUsd = dollars((bseSide + CSD_T2S) * 2, CASH);
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxPct;
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, CASH),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, leviesUsd, taxUsd);
  const confidence = [
    shared.basis,
    notional * rate < brokerRule.min
      ? `le minimum de ${brokerRule.min} € mord (${(notional * rate).toFixed(2)} € calculés)`
      : `${(rate * 100).toFixed(1)} % de ${notional.toFixed(2)} € = ${commissionSide.toFixed(2)} € par sens`,
    `BFB ${bseSide.toFixed(2)} € et DC ${CSD_T2S.toFixed(2)} € par sens : le tarif renvoie aux tarifs de ces institutions pour ce qu'il ne nomme pas`,
    "même prix à l'agence, au téléphone et sur АВС трейдър",
    "garde 0,05 % / an sur les titres et 0,1 % / an sur les espèces en remarque",
    marketBp != null ? `carnet ${marketBp} bp` : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${listing.ticker} sur ${listing.brokerExchange} : ${m.unsourced?.why || "pas de feuille de carnet pour cette ligne"}` }
      : {}),
    commission: { rate, min: brokerRule.min, minCurrency: CASH, eachWay: true, currency: CASH, thirdPartyIncluded: false },
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      réglementaire: finite(leviesUsd, 6),
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
    console.log(JSON.stringify({ ...SCHEDULE, broker: BROKER, bseFee: BSE_FEE, csdT2S: CSD_T2S }, null, 2));
    return;
  }
  const [etf, place, currency] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (!etf) {
    console.error("usage : node brokers/abcfinance/abcfinance_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
    process.exit(2);
  }
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    bp: flag("bp") ? Number(flag("bp")) : null,
  });
  console.log(JSON.stringify(out, null, 2));
}

printCli();
