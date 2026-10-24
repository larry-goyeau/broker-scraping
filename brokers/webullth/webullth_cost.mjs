// What one round trip costs at Webull Thailand (Webull Securities (Thailand)
// Co., Ltd.): buy n shares at price p, sell them back, in dollars. US, Thai
// (SET / mai), Hong Kong and China Connect A-share lines. Options, IPOs and
// Smart Portfolio are other products. Each side unless said.
//
// Read 2026-10-24.   https://www.webull.co.th/en/pricing
//
//   US stocks / ETFs   commission 0.10 % of the trade amount, no minimum
//                      (overnight session the same "until further notice")
//                      SEC 0.0000206 of the sale, min $0.01
//                      TAF "-": not charged
//                      CAT $0.000003 × trade volume (shares), both sides
//   Thai stocks        commission 0.04 %, SET trading 0.005 %,
//                      TSD clearing 0.001 %, SEC Thailand 0.001 %
//   HK stocks / ETFs   commission 0.10 %; SEHK trading 0.00565 %,
//                      HKSCC settlement 0.0042 %, SFC 0.0027 % (each min
//                      HK$0.01), FRC 0.00015 % (min HK$1, as printed),
//                      stamp 0.10 %
//   China A-shares     commission 0.10 %; handling 0.00341 %, CSRC 0.002 %,
//                      CSDC 0.001 %, HKSCC 0.002 % (each min CN¥0.01),
//                      stamp 0.05 % on the sale (min CN¥0.01)
//   VAT 7 % on every line the page stars: the commission on each market,
//   and on Thai stocks the SET, TSD and SEC fees too.
//
// Rounding: the page gives no rounding; levies with a printed minimum are
// rounded up to the cent of their currency. HK stamp: the page prints
// "0.10 % (Min 0.01 HK$)"; the duty is the statute's (rounded up to the whole
// HK$, ETFs exempt), as on the other Webull cards. China Connect ETFs: the
// page prints one A-share table; ETF lines take the ETF levies every Webull
// card prints (handling 0.004 %, HKSCC 0.002 %, no CSRC, CSDC or stamp).
// Thai and US transaction taxes come from taxMap by ISIN.
//
// Deposits are baht only: "you can only deposit money with THB and then
// convert to USD/HKD/CN¥" (https://www.webull.co.th/en/help/faq/360). So a
// US, HK or China line is converted by force, baht to the listing currency on
// the buy and back on the sale. Webull Thailand prints no rate or spread for
// that conversion (the FAQ only says the rate is shown in the app,
// https://www.webull.co.th/en/help/faq/353), so Webull Australia's 0.50%
// stands in (`FX_STAND_IN`). Thai lines are baht and have no FX.
//
// Book: a US line uses Webull Financial LLC's 606 mix, as every other
// Webull entity does (spreads/rule606.mjs, webullth → webull; owner's choice,
// 2026-10-24). Outside the US, the
// venue's own book.
//
// Left out: the ADR custody fee (DTC, $0.01–0.03 a share, billed on the
// depositary's calendar) is the remark; dividend collection fees are not a
// trade.
//
//   node brokers/webullth/webullth_cost.mjs PTT SET THB --shares=1000 --price=33
//   node brokers/webullth/webullth_cost.mjs 1DIV SET THB --shares=100 --price=10
//   node brokers/webullth/webullth_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node brokers/webullth/webullth_cost.mjs 700 HKEX HKD --shares=100 --price=400
//   node brokers/webullth/webullth_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, listingCash } from "../../fx.mjs";
import { taxGap, taxesOf, taxRates } from "../../taxMap.mjs";
import { depositHas } from "../../deposits.mjs";

const CATALOGUE = new URL("webullth-parsed.json", import.meta.url);
const FOLDER = "webullth";

const SCHEDULE = {
  url: "https://www.webull.co.th/en/pricing",
  deposits: "https://www.webull.co.th/en/help/faq/360",
  fx: "https://www.webull.co.th/en/help/faq/353",
  readOn: "2026-10-24",
  entity: "Webull Securities (Thailand) Co., Ltd.",
};

const VAT = 0.07;
const SEC_RATE = 0.0000206;
const SEC_MIN = 0.01;
const CAT_NMS = 0.000003;
const ADR_NAMED = /\bADRs?\b|american deposit|depositary receipt/i;
const ADR_REMARK = "ADR custody $0.01–$0.03/share.";

// Unpublished forced FX: Webull Thailand only says the rate is shown in the
// app. Webull Australia's 50 pips (the same 0.50% as Webull UK Go) stands in,
// each way (owner's choice, 2026-10-24).
const FX_STAND_IN = { rate: 0.005, from: "Webull Australia, 50 pips" };

// Pass-through lines: a rate of the trade value (with `min` when printed),
// both sides unless `sellOnly`; `vat` when the page stars it; `stamp` goes
// to taxes; `dollarUp` rounds up to the whole unit.
const HK_STAMP = { name: "stamp", rate: 0.001, min: 1, dollarUp: true, stamp: true, etfExempt: true };
const MARKETS = {
  us: { ccy: "USD", commission: 0.001, levies: [] },
  set: {
    ccy: "THB",
    commission: 0.0004,
    levies: [
      { name: "SET trading", rate: 0.00005, vat: true },
      { name: "TSD clearing", rate: 0.00001, vat: true },
      { name: "SEC Thailand", rate: 0.00001, vat: true },
    ],
  },
  hk: {
    ccy: "HKD",
    commission: 0.001,
    levies: [
      { name: "SEHK trading", rate: 0.0000565, min: 0.01 },
      { name: "HKSCC settlement", rate: 0.000042, min: 0.01 },
      { name: "SFC levy", rate: 0.000027, min: 0.01 },
      { name: "FRC levy", rate: 0.0000015, min: 1 },
      HK_STAMP,
    ],
  },
  china: {
    ccy: "CNH",
    commission: 0.001,
    levies: {
      stock: [
        { name: "SSE/SZSE handling", rate: 0.0000341, min: 0.01 },
        { name: "CSRC management", rate: 0.00002, min: 0.01 },
        { name: "CSDC transfer", rate: 0.00001, min: 0.01 },
        { name: "HKSCC transfer", rate: 0.00002, min: 0.01 },
        { name: "stamp", rate: 0.0005, min: 0.01, sellOnly: true, stamp: true },
      ],
      etf: [
        { name: "SSE/SZSE handling", rate: 0.00004, min: 0.01 },
        { name: "HKSCC transfer", rate: 0.00002, min: 0.01 },
      ],
    },
  },
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const isFund = (type) => /^(ETF|ETN|ETC)$/i.test(String(type || ""));
const centUp = (v) => Math.ceil(v * 100 - 1e-9) / 100;
const pct = (rate) => `${+(rate * 100).toPrecision(4)} %`;

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

export function feeMarketOf(row) {
  const raw = code(row?.exchange);
  if (/^(NASDAQ|NYSE|AMEX|ARCA|NYSEARCA|CBOE|BATS|BZX|IEX)$/.test(raw)) return "us";
  if (/^(SET|MAI)$/.test(raw) || code(row?.mic) === "XBKK") return "set";
  if (/^(HKEX|SEHK)$/.test(raw)) return "hk";
  if (/^(SHANGHAI|SHENZHEN|SSE|SZSE)$/.test(raw)) return "china";
  return null;
}

function levyEach(line, amount) {
  if (line.dollarUp) return Math.max(Math.ceil(line.rate * amount - 1e-9), line.min ?? 0);
  const v = line.rate * amount;
  return line.min != null ? centUp(Math.max(v, line.min)) : v;
}

/**
 * Round trip in the market's fee currency, `amount` the order value in it:
 * Webull's commission (VAT in), the pass-through levies and the stamp.
 */
export function marketFees({ market, amount, type }) {
  const spec = MARKETS[market];
  if (!spec || !(amount > 0)) return null;
  const fund = isFund(type);
  const levies = Array.isArray(spec.levies) ? spec.levies : spec.levies[fund ? "etf" : "stock"];
  const commissionSide = spec.commission * amount * (1 + VAT);
  let regulatory = 0;
  let stamp = 0;
  const lines = [];
  for (const line of levies) {
    if (line.stamp && line.etfExempt && fund) continue;
    const each = levyEach(line, amount) * (line.vat ? 1 + VAT : 1);
    const total = line.sellOnly ? each : 2 * each;
    if (line.stamp) stamp += total;
    else regulatory += total;
    lines.push(`${line.name} ${pct(line.rate)}${line.min != null ? ` min ${line.min}` : ""}${line.sellOnly ? " (vente)" : ""}${line.vat ? " + TVA" : ""}`);
  }
  return { ccy: spec.ccy, commissionSide, commission: 2 * commissionSide, regulatory, stamp, lines };
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => !wantPlace || loose(m.row.exchange) === wantPlace || loose(m.venue?.mic) === wantPlace)
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
    cashCurrency: "THB",
    url: SCHEDULE.url,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: `le catalogue Webull Thailand n'existe pas encore : lancer \`node brokers/${FOLDER}/${FOLDER}_scraping.mjs\`` };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Webull Thailand` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Webull Thailand`,
      alternatives: named.slice(0, 12).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
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
  const market = feeMarketOf(m.row);
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
    adr: ADR_NAMED.test(String(m.row.name || "")),
  };
  if (!market) {
    return { ...answer, listing, why: `${listing.brokerExchange || listing.exchange} n'a pas de barème chez Webull Thailand` };
  }

  const spec = MARKETS[market];
  const us = market === "us";
  const venueStamp = market === "hk" || market === "china";
  const tax = venueStamp ? { known: true, buy: {}, sell: {} } : taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const gap = market === "set" ? taxGap(listing.isin, listing.type, listing.mic) : null;
  const cash = listingCash(listing.currency);
  const held = depositHas(FOLDER, null, cash);
  const fxRate = held ? 0 : FX_STAND_IN?.rate ?? null;
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;

  const shared = {
    ...answer,
    listing,
    feeMarket: market,
    cashCurrency: held ? cash : "THB",
    remark: us && listing.adr ? ADR_REMARK : "",
    bp: marketBp,
    perShare: marketPerShare,
    sources: [SCHEDULE.url, SCHEDULE.deposits],
    basis:
      `barème Webull Thailand, palier ${market}, relu le ${SCHEDULE.readOn}` +
      (held ? "" : ` ; change forcé THB ↔ ${cash} : dépôts en bahts seulement`),
    tax,
    ccy: QUOTE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: null,
    commission: { rate: spec.commission, min: 0, vat: VAT, currency: spec.ccy, eachWay: true },
  };
  if (gap) return { ...shared, why: gap };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const feeAmount = notionalUsd != null && usdPer(spec.ccy) ? notionalUsd / usdPer(spec.ccy) : null;
  const fees = marketFees({ market, amount: feeAmount, type: listing.type });
  const inUsd = (x) => (x == null ? null : dollars(x, spec.ccy));

  const commissionUsd = fees ? inUsd(fees.commission) : null;
  const secUsd = us && notionalUsd != null ? Math.max(notionalUsd * SEC_RATE, SEC_MIN) : 0;
  const catUsd = us ? n * CAT_NMS * 2 : 0;
  const levyUsd = us ? 0 : fees ? inUsd(fees.regulatory) : null;
  const stampUsd = us ? 0 : fees ? inUsd(fees.stamp) : null;
  const taxUsd = notionalUsd == null ? null : plus(notionalUsd * taxTotal, stampUsd);
  const bookUsd =
    marketPerShare != null ? marketPerShare * n : marketBp != null && notionalUsd != null ? (notionalUsd * marketBp) / 1e4 : null;
  // Forced conversion: baht to the listing currency on the buy, back on the sale.
  const fxUsd = held ? 0 : fxRate == null || notionalUsd == null ? null : notionalUsd * fxRate * 2;
  const regulatoryUsd = plus(secUsd, catUsd, levyUsd);
  const usd = plus(bookUsd, commissionUsd, regulatoryUsd, taxUsd, fxUsd);
  const brokerFees = plus(commissionUsd, fxUsd);

  const said = [
    shared.basis,
    `courtage ${pct(spec.commission)} par jambe sans minimum, TVA ${Math.round(VAT * 100)} % en sus`,
  ];
  if (fees?.lines.length) said.push(`frais de place imprimés : ${fees.lines.join(", ")}`);
  if (us) said.push(`SEC ${SEC_RATE} du montant à la vente, minimum ${SEC_MIN} $ ; TAF « - » sur la page, donc 0 ; CAT ${CAT_NMS} $/part les deux jambes`);
  if (market === "hk") said.push(`timbre HK 0,10 % arrondi au HK$ supérieur, ETF exonérés (la page imprime « Min 0.01 HK$ »)`);
  if (market === "china" && isFund(listing.type)) said.push(`ETF A : frais ETF des autres cartes Webull, sans CSRC, CSDC ni timbre`);
  if (venueStamp) said.push(`droit de timbre pris sur la page, pas dans taxMap`);
  if (taxTotal) said.push(`taxe ${(100 * taxTotal).toFixed(3)} % du montant, depuis taxMap.mjs`);
  if (held) said.push(`compte en bahts, aucun change`);
  else if (fxRate == null) said.push(`change forcé THB ↔ ${cash} non publié : total N/A`);
  else said.push(`change forcé ${(100 * fxRate).toFixed(2)} % par sens, repris de ${FX_STAND_IN.from}`);
  if (marketPerShare != null) said.push(`carnet ${marketPerShare} $ la part${book.via606 ? " (605 × Q)" : " (NBBO coté)"}`);
  else if (marketBp != null) said.push(`carnet ${Number(marketBp.toPrecision(4))} bp`);
  else said.push(`pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}, ${m.unsourced?.why || "pas de source"}`);

  const why =
    fxUsd == null
      ? `change forcé non publié : ${cash} n'est pas une devise de dépôt chez Webull Thailand (bahts seulement), et aucun taux de conversion n'est imprimé`
      : bookUsd == null
        ? `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`
        : null;

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(why ? { why } : {}),
    trade: {
      shares: n,
      price: p,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: listing.currency,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      réglementaire: finite(regulatoryUsd, 6),
      taxes: finite(taxUsd, 6),
      change: finite(fxUsd, 6),
    },
    sell: us ? { sec: finite(secUsd, 6), taf: 0, cat: finite(catUsd, 6) } : null,
    confidence: said.join(" ; "),
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
    console.log(JSON.stringify({ ...SCHEDULE, vat: VAT, sec: { rate: SEC_RATE, min: SEC_MIN }, taf: 0, cat: CAT_NMS, markets: MARKETS, fxStandIn: FX_STAND_IN }, null, 2));
    return;
  }
  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage : node brokers/webullth/webullth_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
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
  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) console.log(out.alternatives.join("\n"));
    process.exit(0);
  }
  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}, ${(l.type || "").toLowerCase()}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(`${t.shares} parts à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}` + (t.notionalUsd != null ? ` (${t.notionalUsd.toFixed(2)} $)` : "") + "\n");
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${out.brokerFees ?? "N/A"} $`);
    const parts = out.parts || {};
    if (parts.marché != null) console.log(`  carnet         : ${parts.marché} $`);
    if (parts.courtage != null) console.log(`  courtage       : ${parts.courtage} $`);
    if (parts.réglementaire) console.log(`  réglementaire  : ${parts.réglementaire} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
    if (parts.change) console.log(`  change         : ${parts.change} $`);
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}`);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence.split(" ; ").join("\n")}`);
}

printCli();
