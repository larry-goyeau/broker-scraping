// What one round trip costs at Endavu: buy n shares at price p, sell them
// back at once, in the app, in dollars. Shares, ETFs and the Danish
// investment funds that trade on Nasdaq Copenhagen. Monthly savings plans
// (månedsopsparing) and the mutual-fund screener are not this trip.
//
// Price list read on 2026-10-18.
//   https://endavu.com/priser
//   https://cdn.endavu.com/documents/market-and-exchange-specific-terms.pdf
//     (version 10/2-2026)
//
//   Commission     the larger of a minimum and a percentage of the order,
//                  each way, in the market's own currency. No maximum.
//                    Denmark                        0.01 %, min 8 DKK
//                    Sweden                         0.01 %, min 10 SEK
//                    Norway                         0.01 %, min 10 NOK
//                    DE FR IT ES PT BE NL FI AT EE IE LV LT
//                                                   0.01 %, min 2 EUR
//                    England                        0.01 %, min 2.5 GBP
//                    Switzerland                    0.01 %, min 2.5 CHF
//                    Czech Republic                 0.01 %, min 70 CZK
//                    Hungary                        0.01 %, min 500 HUF
//                    Poland                         0.01 %, min 10 PLN
//                    USA                            0 %, min 0 USD
//                    Canada                         0.01 %, min 4 CAD
//                    Mexico                         0.01 %, min 250 MXN
//                    Australia                      0.01 %, min 2.5 AUD
//                    China                          0.01 %, min 14 CNH
//                    Japan                          0.01 %, min 700 JPY
//                    Hong Kong                      0.01 %, min 14 HKD
//                    Israel                         0.01 %, min 15 ILS
//                    Taiwan                         0.01 %, min 250 TWD
//                    Singapore                      0.01 %, min 2.9 SGD
//                    UAE, ADX                       0.10 %, min 5 AED
//                    UAE, DFM                       0.25 %, min 5 AED
//                  The page's own examples agree: Novo B 100 000 DKK pays
//                  10 DKK, SXR8 for 25 000 DKK pays the 2 EUR floor, NVDA 0.
//   FX             automatic conversion 0.07 %. The account holds kroner
//                  (deposits.mjs), so a line in any other currency pays it
//                  on the buy and again on the sale.
//   Exchange fees  the market terms say a foreign trade is subject to the
//                  transaction fees the exchange imposes, and that Endavu may
//                  charge them; the investment service agreement (8.3) says
//                  any such third-party cost is shown "directly on the
//                  platform". What the platform shows, read on 2026-10-18:
//                    - the ex-ante costs and charges disclosure (version
//                      10/3-2026), the MiFID cost sheet, prices a share or an
//                      ETF in every listed country as commission + FX only;
//                      its "Third party transaction costs" row is empty for
//                      stocks and "-" for ETFs, whatever country is picked;
//                    - the app's order summary explains the commission line
//                      ("Kurtage") as "det, du betaler for at dække
//                      omkostningerne relateret til eksekveringen af ordren
//                      hos børsen, samt vores ydelse".
//                  So the exchange's fee is inside the commission: 0 on top,
//                  every market. The clause stays a right Endavu has not used.
//                    https://cdn.endavu.com/documents/ex-ante-costs-and-charges-disclosure.xlsx
//                    https://cdn.endavu.com/documents/investment-service-agreement-nd-da.pdf
//                    https://endavu.com/priser (app strings embedded in the page)
//   Taxes          stamp duty and FTT from taxMap.mjs. Endavu names none. A
//                  GB/IE/FR/IT/ES share with no tax-map line is N/A (taxGap).
//
// Greece, Slovakia, Slovenia, Romania, Turkey, Brazil, South Africa,
// Malaysia, Saudi Arabia and Cboe Europe are in the catalogue but not on the
// price list: those lines answer N/A with a reason. Custody, transfers in
// and out are 0 DKK. Returning a foreign deposit is 399 DKK, other services
// 699 DKK an hour: none of that is this trip.
//
//   node brokers/endavu/endavu_cost.mjs NOVO-B XCSE DKK --shares=10 --price=380
//   node brokers/endavu/endavu_cost.mjs SXR8 XETR EUR --shares=10 --price=600
//   node brokers/endavu/endavu_cost.mjs NVDA XNAS USD --shares=10 --price=180
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates, taxGap } from "../../taxMap.mjs";

const CATALOGUE = new URL("endavu-parsed.json", import.meta.url);
const PAGE = "https://endavu.com/priser";
const TERMS = "https://cdn.endavu.com/documents/market-and-exchange-specific-terms.pdf";
const EX_ANTE = "https://cdn.endavu.com/documents/ex-ante-costs-and-charges-disclosure.xlsx";
const READ_ON = "2026-10-18";
const CASH = "DKK";
const FX_EACH_WAY = 0.0007;

// One line of the price list: rate and floor, the floor in `ccy`.
const line = (label, rate, min, ccy) => ({ label, rate, min, ccy });
const EUR_ZONE = line("zone euro", 0.0001, 2, "EUR");
const MARKETS = {
  XCSE: line("Danemark", 0.0001, 8, "DKK"),
  XSTO: line("Suède", 0.0001, 10, "SEK"),
  XOSL: line("Norvège", 0.0001, 10, "NOK"),
  XETR: EUR_ZONE,
  XFRA: EUR_ZONE,
  XSTU: EUR_ZONE,
  XMUN: EUR_ZONE,
  XPAR: EUR_ZONE,
  XMIL: EUR_ZONE,
  XMAD: EUR_ZONE,
  XLIS: EUR_ZONE,
  XBRU: EUR_ZONE,
  XAMS: EUR_ZONE,
  XHEL: EUR_ZONE,
  XWBO: EUR_ZONE,
  XTAL: EUR_ZONE,
  XMSM: EUR_ZONE,
  XRIS: EUR_ZONE,
  XLIT: EUR_ZONE,
  XLON: line("Angleterre", 0.0001, 2.5, "GBP"),
  XSWX: line("Suisse", 0.0001, 2.5, "CHF"),
  XPRA: line("Tchéquie", 0.0001, 70, "CZK"),
  XBUD: line("Hongrie", 0.0001, 500, "HUF"),
  XWAR: line("Pologne", 0.0001, 10, "PLN"),
  XNAS: line("USA", 0, 0, "USD"),
  XNYS: line("USA", 0, 0, "USD"),
  XASE: line("USA", 0, 0, "USD"),
  ARCX: line("USA", 0, 0, "USD"),
  BATS: line("USA", 0, 0, "USD"),
  XTSE: line("Canada", 0.0001, 4, "CAD"),
  XTSX: line("Canada", 0.0001, 4, "CAD"),
  XCNQ: line("Canada", 0.0001, 4, "CAD"),
  NEOE: line("Canada", 0.0001, 4, "CAD"),
  XATS: line("Canada", 0.0001, 4, "CAD"),
  XMEX: line("Mexique", 0.0001, 250, "MXN"),
  XASX: line("Australie", 0.0001, 2.5, "AUD"),
  XSHE: line("Chine", 0.0001, 14, "CNH"),
  XSEC: line("Chine", 0.0001, 14, "CNH"),
  XSHG: line("Chine", 0.0001, 14, "CNH"),
  XSSC: line("Chine", 0.0001, 14, "CNH"),
  XTKS: line("Japon", 0.0001, 700, "JPY"),
  XHKG: line("Hong Kong", 0.0001, 14, "HKD"),
  XTAE: line("Israël", 0.0001, 15, "ILS"),
  XTAI: line("Taïwan", 0.0001, 250, "TWD"),
  ROCO: line("Taïwan", 0.0001, 250, "TWD"),
  XSES: line("Singapour", 0.0001, 2.9, "SGD"),
  XADS: line("Émirats, ADX", 0.001, 5, "AED"),
  XDFM: line("Émirats, DFM", 0.0025, 5, "AED"),
};
// Endavu writes Munich without a MIC.
const MUNICH = /m(ü|u|ue)nchen/i;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};
const convert = (amount, from, to) => {
  if (code(from) === code(to)) return amount;
  const usd = toUsd(amount, from);
  const per = usdPer(to);
  return usd == null || !per ? null : usd / per;
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
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

function marketOf(m) {
  const mic = code(m.venue?.mic || m.row.mic);
  return MARKETS[mic] || (MUNICH.test(m.row.exchange || "") ? EUR_ZONE : null);
}

// One side, in the floor's currency.
export function commissionEach(notional, currency, market) {
  const local = convert(notional, currency, market.ccy);
  if (local == null) return null;
  return Math.max(market.min, local * market.rate);
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
    return { ...answer, why: "le catalogue Endavu n'existe pas encore : lancer `node brokers/endavu/endavu_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Endavu` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Endavu`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "endavu",
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
  const market = marketOf(m);
  const converts = listing.currency !== CASH;
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
  const taxTotal = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const shared = {
    ...answer,
    listing,
    bp: marketBp,
    perShare: marketPerShare,
    tax,
    basis: market
      ? `liste de prix Endavu relue le ${READ_ON}, ${market.label} : ${(market.rate * 100).toLocaleString("fr-FR")} %, ` +
        `minimum ${market.min.toLocaleString("fr-FR")} ${market.ccy} par sens` +
        (converts ? `, change automatique 0,07 % par sens (compte en DKK)` : "")
      : `liste de prix Endavu relue le ${READ_ON}`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };
  if (!market) {
    return {
      ...shared,
      why: `${listing.exchange} n'est pas sur la liste de prix Endavu : aucun courtage publié pour cette place`,
    };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const each = commissionEach(notional, listing.currency, market);
  const commissionUsd = each == null ? null : dollars(each * 2, market.ccy);
  const fxUsd = !converts ? 0 : notionalUsd == null ? null : notionalUsd * FX_EACH_WAY * 2;
  // The exchange's transaction fee sits inside the commission: the ex-ante
  // cost sheet has commission and FX only, for every country.
  const brokerFees = plus(commissionUsd, fxUsd);
  const gap = taxGap(listing.isin, listing.type, listing.mic);
  const taxUsd = gap || notionalUsd == null ? null : notionalUsd * taxTotal;
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const unknown = [
    bookUsd == null ? `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` : null,
    gap,
  ].filter(Boolean);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(unknown.length ? { why: unknown.join(" ; ") } : {}),
    commission: { rate: market.rate, minimum: market.min, currency: market.ccy, each, eachWay: true },
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      change: finite(fxUsd, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence: [
      shared.basis,
      taxTotal ? `taxe à l'achat ${(taxTotal * 100).toFixed(2)} % depuis taxMap.mjs` : "aucune taxe dans taxMap.mjs pour cet ISIN",
      `frais de bourse compris dans le courtage : la fiche de coûts ex ante (version 10/3-2026) ne compte que courtage et change, pour tous les pays, et l'app décrit le courtage comme couvrant l'exécution en bourse (${EX_ANTE})`,
      `conditions de marché : ${TERMS}`,
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
