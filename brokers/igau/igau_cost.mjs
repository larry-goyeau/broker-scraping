// What one round trip costs at IG Australia: buy n shares at price p, sell
// them back at once, share trading account, online, default (instant)
// currency conversion, in dollars. Phone dealing, CFDs and the manual
// currency setting are not this trip.
//
// IG Australia Pty Ltd (AFSL 515106). Charges page read 2026-10-18 (no
// effective date printed), and the Share Trading Product Details of July
// 2025 that the AUD deposit line already cites.
//
//   Commission     online, instant currency conversion: $0 on Australian,
//                  US, UK, German and Irish shares. Manual conversion is the
//                  other setting (US$10 / 2¢ a share, £10 / €10 / 0.1 %) and
//                  is not this account: the cash is AUD only (deposits.mjs).
//   FX             0.7 % on top of the best bid/offer rate, GST included,
//                  "0.7% to buy and sell": a line that is not in AUD pays it
//                  on the purchase and again on the sale proceeds. IG keeps
//                  it, so it sits in brokerFees.
//   Levies         the government taxes and levies table, passed on:
//                    UK SDRT 0.50 % on the buy        from taxMap.mjs
//                    UK PTM £1.50 a side above £10,000 (the July 2025 PDF
//                      printed £1; the live page prints £1.50), on a UK-
//                      registered share
//                    Ireland stamp 1 % on the buy     from taxMap.mjs
//                    Ireland ITP €1.25 a side above €12,500, Irish share
//                    US on-exchange fee (Section 31) on the sale. The page
//                      prints 0.00278 %, the PDF 0.00229 % and its example
//                      0.00207 %: none is the current statutory rate, so the
//                      0.0000206 the other cost files use is applied. No
//                      FINRA TAF is printed, so none is added.
//                  A GB/IE share with no tax-map line is N/A (taxGap).
//   Other          platform 0, custody 0, standard bank transfer 0. Same-day
//                  transfer $15, international $15, a US$50 documentation fee
//                  without a W-8 before a US dividend, live data by exchange:
//                  none of that is this order.
//
// Book: spreads/book.mjs through spreadLeaf, broker "igau". IG Australia
// names no US broker-dealer and rule606.mjs has no alias for it, so a US line
// is the quoted NBBO of the name, as the README says for a broker with no
// 606. Dublin, Hamburg, Stuttgart and Frankfurt have no book leaf here and
// stay N/A on the book.
//
//   https://www.ig.com/au/share-trading/charges
//   https://www.ig.com/usermanagement/customeragreements?igCompany=igau&agreementType=share_trading_product_details&locale=en_GB
//
//   node brokers/igau/igau_cost.mjs BHP ASX AUD --shares=100 --price=60.94
//   node brokers/igau/igau_cost.mjs AAPL NASDAQ USD --shares=10 --price=343.46
//   node brokers/igau/igau_cost.mjs SAP XETR EUR --shares=10 --price=199.22
//   node brokers/igau/igau_cost.mjs --schedule
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

const CATALOGUE = new URL("igau-parsed.json", import.meta.url);

const SCHEDULE = {
  source: "https://www.ig.com/au/share-trading/charges",
  productDetails:
    "https://www.ig.com/usermanagement/customeragreements?igCompany=igau&agreementType=share_trading_product_details&locale=en_GB",
  productDetailsOf: "2025-07",
  readOn: "2026-10-18",
  entity: "IG Australia Pty Ltd",
};

const CASH = "AUD";
const FX_EACH_WAY = 0.007;
const SEC_RATE = 0.0000206;
const SEC_PRINTED = 0.0000278;
const PTM = { each: 1.5, ccy: "GBP", above: 10000 };
const ITP = { each: 1.25, ccy: "EUR", above: 12500 };
const UK_REGISTERED = /^(GB|GG|JE|IM)/;

// The remark sets the instant conversion beside the manual setting, whose
// commission is per side in the listing's currency: US$10 or 2¢ a share,
// £10 or €10 or 0.1 %, whichever is more.
const AUTOMATIC = `Automatic currency conversion is ${Number((FX_EACH_WAY * 100).toFixed(2))}% when cash is ${CASH}.`;
// { each, floor }: the commission, and the minimum's label when it bites.
function manualEach(currency, shares, notional) {
  const pick = (rate, min, label) => (rate >= min ? { each: rate, floor: "" } : { each: min, floor: label });
  if (currency === "USD") return pick(0.02 * shares, 10, "US$10");
  if (currency === "GBP") return pick(0.001 * notional, 10, "£10");
  if (currency === "GBX") return pick(0.001 * notional, 1000, "£10");
  if (currency === "EUR") return pick(0.001 * notional, 10, "€10");
  return null;
}

// Venue -> the market line of the charges table. Commission is 0 on every one.
const MARKETS = {
  XASX: "au",
  XNYS: "us",
  XNAS: "us",
  XASE: "us",
  ARCX: "us",
  BATS: "us",
  OTCM: "us",
  XLON: "uk",
  AQSE: "uk",
  XETR: "de",
  XFRA: "de",
  XHAM: "de",
  XSTU: "de",
  XMSM: "ie",
};
const LABEL = { au: "Australie", us: "États-Unis", uk: "Royaume-Uni", de: "Allemagne", ie: "Irlande" };

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

export function feeMarketOf() {
  return "share-trading";
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

// A levy charged per order above a threshold, both sides: dollars, 0, or null.
function perOrderLevy(levy, due, notional, currency) {
  if (!due) return 0;
  const local = convert(notional, currency, levy.ccy);
  if (local == null) return null;
  return local > levy.above ? dollars(levy.each * 2, levy.ccy) : 0;
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
    url: SCHEDULE.source,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue IG Australia n'existe pas encore : lancer `node brokers/igau/igau_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue IG Australia` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez IG Australia`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "igau",
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
  const market = MARKETS[code(m.venue?.mic || m.row.mic)] || null;
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
    feeMarket: feeMarketOf(),
    bp: marketBp,
    perShare: marketPerShare,
    tax,
    remark: converts ? AUTOMATIC : "",
    basis:
      `barème IG Australia relu le ${SCHEDULE.readOn}` +
      (market ? `, ${LABEL[market]} : commission 0 en ligne (conversion instantanée)` : "") +
      (converts ? `, change 0,7 % à l'achat et à la vente (cash en AUD)` : ""),
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };
  if (!market) {
    return { ...shared, why: `${listing.exchange} n'est pas un marché du barème IG Australia` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const commissionUsd = 0;
  const fxUsd = !converts ? 0 : notionalUsd == null ? null : notionalUsd * FX_EACH_WAY * 2;
  const brokerFees = plus(commissionUsd, fxUsd);

  const stock = listing.type === "STOCK";
  const secUsd = market === "us" ? (notionalUsd == null ? null : notionalUsd * SEC_RATE) : 0;
  const ptmUsd = perOrderLevy(PTM, market === "uk" && stock && UK_REGISTERED.test(listing.isin || ""), notional, listing.currency);
  const itpUsd = perOrderLevy(ITP, market === "ie" && stock && /^IE/.test(listing.isin || ""), notional, listing.currency);
  const levyUsd = plus(secUsd, ptmUsd, itpUsd);
  const gap = taxGap(listing.isin, listing.type, listing.mic);
  const stampUsd = gap || notionalUsd == null ? null : notionalUsd * taxTotal;
  const taxUsd = plus(stampUsd, levyUsd);
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const unknown = [
    bookUsd == null ? `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` : null,
    gap,
  ].filter(Boolean);

  const manual = manualEach(listing.currency, n, notional);
  return {
    ...shared,
    remark: converts
      ? [AUTOMATIC, manual == null
          ? null
          : `Manual currency conversion is ${Number(((manual.each / notional) * 100).toFixed(2))}%${manual.floor ? ` min ${manual.floor}` : ""}.`]
          .filter(Boolean)
          .join("\n")
      : "",
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(unknown.length ? { why: unknown.join(" ; ") } : {}),
    commission: { each: 0, roundTrip: 0, currency: CASH, eachWay: true },
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    parts: {
      marché: finite(bookUsd, 6),
      commission: 0,
      change: finite(fxUsd, 6),
      taxes: finite(stampUsd, 6),
      sec: finite(secUsd, 6),
      ptm: finite(ptmUsd, 6),
      itp: finite(itpUsd, 6),
    },
    confidence: [
      shared.basis,
      taxTotal ? `taxe à l'achat ${(taxTotal * 100).toFixed(2)} % depuis taxMap.mjs` : "aucune taxe dans taxMap.mjs pour cet ISIN",
      market === "us"
        ? `Section 31 à la vente au taux légal ${SEC_RATE} (la page imprime ${SEC_PRINTED}) ; pas de TAF imprimée`
        : market === "uk"
          ? `PTM ${PTM.each} £ par sens au-delà de ${PTM.above} £ sur une action britannique`
          : market === "ie"
            ? `ITP ${ITP.each} € par sens au-delà de ${ITP.above} € sur une action irlandaise`
            : "",
      marketPerShare != null
        ? `carnet NBBO coté ${marketPerShare} $ la part : IG Australia ne nomme aucun broker-dealer américain, pas de 606`
        : marketBp != null
          ? `carnet ${Number(marketBp.toPrecision(4))} bp`
          : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
      "hors trajet : conversion manuelle, téléphone, virements, données de marché",
    ]
      .filter(Boolean)
      .join(" ; "),
  };
}

function calledDirectly() {
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
}

if (calledDirectly()) {
  const flag = (name) => {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  if (process.argv.includes("--schedule")) {
    console.log(
      JSON.stringify(
        { ...SCHEDULE, commission: 0, fxEachWay: FX_EACH_WAY, cash: CASH, sec: SEC_RATE, secPrinted: SEC_PRINTED, ptm: PTM, itp: ITP },
        null,
        2
      )
    );
    process.exit(0);
  }
  const [etf, place, currency] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (!etf) {
    console.error("usage : node brokers/igau/igau_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
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
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }
  const l = out.listing;
  if (!l) {
    console.log(out.why || "rien à dire");
    if (out.alternatives?.length) console.log(`\n  ${out.alternatives.join("\n  ")}`);
    process.exit(0);
  }
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange || "—"}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(`${t.shares} parts à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency} (${t.notionalUsd} $)\n`);
  }
  console.log(`aller-retour     : ${out.usd == null ? `N/A${out.why ? ` — ${out.why}` : ""}` : `${out.usd} $`}`);
  console.log(`frais du courtier: ${out.brokerFees == null ? "N/A" : `${out.brokerFees} $`}`);
  for (const [name, value] of Object.entries(out.parts || {})) {
    if (value != null) console.log(`  ${name.padEnd(15)}: ${value} $`);
  }
  console.log();
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);
  if (out.url) console.log(`\n${out.url}`);
}
