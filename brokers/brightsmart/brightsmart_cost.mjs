// What one round trip costs at Bright Smart Securities (耀才證券): buy n
// shares at price p, sell them back at once, in dollars.
//
// The US table prints two commission lines; each is a row (`query.plan`):
//   pershare     0.008 USD a share, minimum 1.88 USD, SEC, TAF and CAT
//                on top. The default.
//   percentage   0.1 % of the order, minimum 8 USD, the levies cell
//                reading "commission includes the SEC fee and the
//                trading levy". CAT sits only in the per-share row's
//                levies cell and is not said to be extra here, so this
//                plan adds no levy at all.
// Every other market prices the same on both plans.
//
// The electronic
// ticket (internet, the iPhone/Android app or the voice system). Phone
// orders through a dealer are a dearer line on the same pages and are
// not this one. Odd lots go by phone and stay out. Margin interest,
// IPOs, futures, options and forex stay out.
//
// Commission pages read on 2026-10-18.
//   Hong Kong (HKEX), each side
//     commission 0.0668 %, minimum 50 HKD, 50 RMB or 6.50 USD by the
//     counter's currency. The monthly turnover rebate (down to 0.01 %
//     above 20 million HKD a month) is paid back the next month and is
//     not this trip.
//     HKEX trading 0.00565 %, SFC 0.0027 %, AFRC 0.00015 %, HKSCC
//     settlement 0.0042 %. Stamp 0.1 %, a part of a dollar counts as
//     one HKD, on a share or a REIT. An ETF pays no stamp.
//     The 0.2 % Italian FTT on HK-listed Italian companies is charged on
//     the day's net purchase, which a round trip leaves at zero.
//     https://www.bsgroup.com.hk/commissions/hongkongsecurities/
//   Shanghai and Shenzhen A shares (Stock Connect), each side
//     commission 0.01 %, minimum 50 RMB.
//     A share: handling 0.00341 %, CSRC 0.002 %, CSDC 0.001 %,
//     HKSCC 0.002 %, stamp 0.05 % on the sale.
//     ETF: handling 0.004 %, HKSCC 0.002 %, no CSRC, CSDC or stamp.
//     The HKSCC portfolio fee (0.008 % a year) is in the remark.
//     https://www.bsgroup.com.hk/commissions/shanghaishenzhena/
//   Global securities, electronic, each side
//     https://www.bsgroup.com.hk/commissions/globalsecurities/
//     US          0.008 USD a share, minimum 1.88 USD (the per-share
//                 line, the new-client offer since 12 Aug 2019). SEC
//                 0.00206 % on the sale, minimum 0.01. TAF 0.000195 USD
//                 a share sold, minimum 0.01, maximum 9.79. CAT
//                 0.000003 USD a share each side, minimum 0.01.
//                 Percentage plan: 0.1 %, minimum 8 USD, SEC and TAF
//                 included, no CAT line. The page's FTT on
//                 French, Italian and Spanish ADRs is on the day's net
//                 purchase, zero on a round trip.
//     Shanghai B  0.18 %, minimum 5 USD. Handling 0.00341 %, CSRC
//                 0.002 %, settlement 0.002 % up to 50 USD. Stamp 0.05 %
//                 on the sale.
//     Shenzhen B  0.18 %, minimum 38 HKD. Levy 0.00541 % (CSRC
//                 included), settlement 0.002 % up to 500 HKD. Stamp
//                 0.05 % on the sale.
//     Taiwan      0.2 %, minimum 500 TWD. 800 TWD to the custodian bank
//                 per trade. Securities transaction tax on the sale:
//                 0.3 % on a share, 0.1 % on an ETF, ETN or TDR. Custody
//                 0.1 % a year is in the remark.
//     Singapore   0.08 %, minimum 5 SGD or 4 USD. SGX trading 0.0075 %,
//                 clearing 0.0325 % up to 200 SGD. No floor is printed
//                 for a line in EUR, GBP or HKD, so those answer N/A.
//     Japan       0.0668 %, minimum 300 JPY. No stamp, no levy.
//     Australia   0.138 %, minimum 20 AUD. No stamp, no levy.
//     UK          0.20 %, minimum 15 GBP. PTM levy 1.50 GBP on a trade
//                 over 10,000 GBP. Stamp 0.5 % on the buy, from the
//                 tax map (a UK share pays it, an ETF or a foreign
//                 company does not).
//
// The account holds HKD, USD, CNH and JPY (deposits.mjs). A line in
// TWD, SGD, AUD, GBP or EUR needs a conversion at the house rate, which
// no page prints as a fee or a spread. Those currencies are not deposit
// currencies, so the conversion is forced and belongs in the total; its
// cost is unknown, so the total of such a line is unknown (N/A), with the
// broker fees still shown. A Taiwan trade is settled in HKD at the house
// rate of the day. A line in a deposit currency converts nothing.
//
// Bright Smart names no US broker-dealer (the terms speak of a "BS
// Trading Agent"). A US line has no Rule 606 mix, so its book is the
// quoted NBBO. Every other market keeps its own book.
//
//   node brokers/brightsmart/brightsmart_cost.mjs 00700 HKEX HKD --shares=100 --price=400
//   node brokers/brightsmart/brightsmart_cost.mjs 600519 SSE CNY --shares=100 --price=1500
//   node brokers/brightsmart/brightsmart_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node brokers/brightsmart/brightsmart_cost.mjs AAPL NASDAQ USD --shares=10 --price=230 --plan=percentage
//   node brokers/brightsmart/brightsmart_cost.mjs 0050 TWSE TWD --shares=1000 --price=190
//   node brokers/brightsmart/brightsmart_cost.mjs VOD LSE GBP --shares=1000 --price=0.7
//   node brokers/brightsmart/brightsmart_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, listingCash } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("brightsmart-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.bsgroup.com.hk/commissions/globalsecurities/",
  pages: {
    HK: "https://www.bsgroup.com.hk/commissions/hongkongsecurities/",
    CN: "https://www.bsgroup.com.hk/commissions/shanghaishenzhena/",
    GLOBAL: "https://www.bsgroup.com.hk/commissions/globalsecurities/",
  },
  readOn: "2026-10-18",
  entity: "Bright Smart Securities International (H.K.) Limited",
  channel: "electronic (internet, app, voice system)",
  rule606: null,
};

const CASH = new Set(["HKD", "USD", "CNY", "JPY"]);
const US_PLACES = new Set(["NASDAQ", "NYSE", "AMEX", "CBOEBZX"]);

// Each side, in the listing's currency unless noted.
const HK = { rate: 0.000668, min: { HKD: 50, CNY: 50, USD: 6.5 }, levy: 0.0000565 + 0.000027 + 0.0000015 + 0.000042, stamp: 0.001 };
const CN = { rate: 0.0001, min: 50, stockLevy: 0.0000341 + 0.00002 + 0.00001 + 0.00002, etfLevy: 0.00004 + 0.00002, stamp: 0.0005 };
const US = { perShare: 0.008, min: 1.88, sec: 0.0000206, taf: 0.000195, tafMax: 9.79, cat: 0.000003, levyMin: 0.01 };
const US_PERCENT = { rate: 0.001, min: 8 };
const SHB = { rate: 0.0018, min: 5, levy: 0.0000341 + 0.00002, settle: 0.00002, settleMax: 50, stamp: 0.0005 };
const SZB = { rate: 0.0018, min: 38, levy: 0.0000541, settle: 0.00002, settleMax: 500, stamp: 0.0005 };
const TW = { rate: 0.002, min: 500, custodian: 800, stockTax: 0.003, fundTax: 0.001 };
const SG = { rate: 0.0008, min: { SGD: 5, USD: 4 }, levy: 0.000075, clearing: 0.000325, clearingMaxSgd: 200 };
const JP = { rate: 0.000668, min: 300 };
const AU = { rate: 0.00138, min: 20 };
const UK = { rate: 0.002, min: 15, ptm: 1.5, ptmAbove: 10000 };

const PLANS = ["pershare", "percentage"];
const planOf = (plan) => (PLANS.includes(String(plan)) ? String(plan) : PLANS[0]);

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
  const usd = toUsd(amount, from);
  const per = usdPer(to);
  return usd == null || !(per > 0) ? null : usd / per;
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
      if (loose(m.row.exchange) === wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return false;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

function marketOf(row) {
  const place = loose(row.exchange);
  const ccy = code(row.currency);
  if (place === "HKEX") return "HK";
  if ((place === "SSE" || place === "SZSE") && ccy === "CNY") return "CN";
  if (place === "SSE" && ccy === "USD") return "SHB";
  if (place === "SZSE" && ccy === "HKD") return "SZB";
  if (US_PLACES.has(place) && ccy === "USD") return "US";
  if (place === "TWSE" || place === "TPEX") return "TW";
  if (place === "SGX") return "SG";
  if (place === "TOKYO") return "JP";
  if (place === "ASX") return "AU";
  if (place === "LSE") return "UK";
  return "";
}

const fundLike = (type) => type === "ETF" || type === "ETN";
// A Taiwan depositary receipt is coded 91xxxx on TWSE.
const isTdr = (ticker) => /^91\d{4}/.test(String(ticker || ""));

// Returns { broker, levy } for the whole round trip, in the listing's
// currency, or { why } when the page prints no line for it.
function ticket(market, listing, n, notional, plan) {
  const ccy = listing.currency;
  const fund = fundLike(listing.type);
  if (market === "HK") {
    const min = HK.min[ccy];
    if (min == null) return { why: `le barème Hong Kong n'imprime pas de plancher en ${ccy}` };
    const notionalHkd = ccy === "HKD" ? notional : convert(notional, ccy, "HKD");
    if (notionalHkd == null) return { why: "pas de cours pour ramener l'ordre en HKD" };
    const stampHkd = fund ? 0 : Math.ceil(notionalHkd * HK.stamp - 1e-6);
    const stamp = ccy === "HKD" ? stampHkd : convert(stampHkd, "HKD", ccy);
    const broker = Math.max(min, notional * HK.rate) * 2;
    const levy = (notional * HK.levy + stamp) * 2;
    return { broker, levy };
  }
  if (market === "CN") {
    const broker = Math.max(CN.min, notional * CN.rate) * 2;
    const levy = fund ? notional * CN.etfLevy * 2 : notional * CN.stockLevy * 2 + notional * CN.stamp;
    return { broker, levy };
  }
  if (market === "SHB" || market === "SZB") {
    const s = market === "SHB" ? SHB : SZB;
    const broker = Math.max(s.min, notional * s.rate) * 2;
    const levy = (notional * s.levy + Math.min(s.settleMax, notional * s.settle)) * 2 + notional * s.stamp;
    return { broker, levy };
  }
  if (market === "US" && plan === "percentage") {
    // SEC and TAF are in the commission; no CAT line on this row.
    return { broker: Math.max(US_PERCENT.min, notional * US_PERCENT.rate) * 2, levy: 0 };
  }
  if (market === "US") {
    const broker = Math.max(US.min, n * US.perShare) * 2;
    const cat = Math.max(US.levyMin, n * US.cat);
    const sec = Math.max(US.levyMin, notional * US.sec);
    const taf = Math.min(US.tafMax, Math.max(US.levyMin, n * US.taf));
    return { broker, levy: cat * 2 + sec + taf };
  }
  if (market === "TW") {
    const broker = Math.max(TW.min, notional * TW.rate) * 2;
    const rate = fund || isTdr(listing.ticker) ? TW.fundTax : TW.stockTax;
    return { broker, levy: TW.custodian * 2 + notional * rate };
  }
  if (market === "SG") {
    const min = SG.min[ccy];
    if (min == null) return { why: `le barème Singapour imprime un plancher en SGD ou en USD, pas en ${ccy}` };
    const cap = ccy === "SGD" ? SG.clearingMaxSgd : convert(SG.clearingMaxSgd, "SGD", ccy);
    const broker = Math.max(min, notional * SG.rate) * 2;
    const levy = (notional * SG.levy + Math.min(cap ?? Infinity, notional * SG.clearing)) * 2;
    return { broker, levy };
  }
  if (market === "JP") return { broker: Math.max(JP.min, notional * JP.rate) * 2, levy: 0 };
  if (market === "AU") return { broker: Math.max(AU.min, notional * AU.rate) * 2, levy: 0 };
  if (market === "UK") {
    const broker = Math.max(UK.min, notional * UK.rate) * 2;
    return { broker, levy: notional > UK.ptmAbove ? UK.ptm * 2 : 0 };
  }
  return { why: `${listing.brokerExchange} n'a pas de ligne dans le barème` };
}

const BASIS = {
  HK: "commission 0,0668 %, plancher 50 HKD / 50 RMB / 6,50 USD ; HKEX, SFC, AFRC et HKSCC ; timbre 0,1 % arrondi au dollar supérieur, pas sur un ETF",
  CN: "Stock Connect, commission 0,01 %, plancher 50 RMB ; frais de bourse et de règlement ; timbre 0,05 % à la vente sur une action",
  SHB: "B Shanghai, 0,18 %, plancher 5 USD ; frais de bourse, CSRC, règlement plafonné à 50 USD ; timbre 0,05 % à la vente",
  SZB: "B Shenzhen, 0,18 %, plancher 38 HKD ; frais de bourse, règlement plafonné à 500 HKD ; timbre 0,05 % à la vente",
  US: "forfait à la part, 0,008 USD la part, plancher 1,88 USD ; SEC et TAF à la vente, CAT à chaque sens",
  USPERCENT: "plan au pourcentage, 0,1 % de l'ordre, plancher 8 USD ; SEC et TAF compris dans la commission, pas de ligne CAT",
  TW: "0,2 %, plancher 500 TWD ; 800 TWD à la banque dépositaire par ordre ; taxe à la vente 0,3 % (0,1 % ETF, ETN, TDR)",
  SG: "0,08 %, plancher 5 SGD ou 4 USD ; SGX 0,0075 % et compensation 0,0325 %",
  JP: "0,0668 %, plancher 300 JPY",
  AU: "0,138 %, plancher 20 AUD",
  UK: "0,20 %, plancher 15 GBP ; PTM 1,50 GBP au-delà de 10 000 GBP ; droit de timbre selon la table fiscale",
};

const REMARKS = {
  CN: "HKSCC portfolio fee 0.008%/year.",
  TW: "Custody 0.1%/year.",
};

function remarkOf(market, currency) {
  const lines = [];
  if (REMARKS[market]) lines.push(REMARKS[market]);
  // A currency outside the deposit list is a forced conversion, priced in
  // the total (unknown here), so it is not an "FX when cash ≠" remark.
  return lines.join("\n");
}

export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null, plan = null }) {
  const id = planOf(plan);
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "HKD",
    url: SCHEDULE.url,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Bright Smart n'existe pas encore : lancer `node brokers/brightsmart/brightsmart_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Bright Smart` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Bright Smart`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const market = marketOf(m.row);
  // No US dealer is named: the bank's own key has no Q, so the book is
  // the quoted NBBO of the ticker.
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "brightsmart",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? (m.row.mic || null),
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const cash = listingCash(listing.currency);
  const american = market === "US";
  // The plan only changes the US line: BASIS and REMARKS key it USPERCENT.
  const key = american && id === "percentage" ? "USPERCENT" : market;
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  // UK stamp is the only tax the tax map adds here. HK, China and
  // Taiwan stamps are on the commission pages and priced above; the map
  // would also lay London's stamp on a Hong Kong line of a UK issuer.
  const tax = market === "UK" ? taxesOf(listing.isin) : { known: true, buy: {}, sell: {} };
  const taxPct = market === "UK" ? Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0) : 0;
  const shared = {
    ...answer,
    listing,
    cashCurrency: !CASH.has(cash) ? "HKD" : cash === "CNY" ? "CNH" : cash,
    url: market === "HK" ? SCHEDULE.pages.HK : market === "CN" ? SCHEDULE.pages.CN : SCHEDULE.pages.GLOBAL,
    remark: remarkOf(key, listing.currency),
    basis: `Bright Smart, ordre électronique, barème relu le ${SCHEDULE.readOn}${BASIS[key] ? ` : ${BASIS[key]}` : ""}`,
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    bp: marketBp,
    perShare: marketPerShare,
  };
  if (!market) return { ...shared, why: `${listing.brokerExchange} n'a pas de ligne dans le barème Bright Smart` };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  if (notionalUsd == null) return { ...shared, why: "pas de cours pour cette devise" };
  const fees = ticket(market, listing, n, notional, id);
  if (fees.why) return { ...shared, why: fees.why };

  const brokerLocal = Number(fees.broker.toPrecision(12));
  const levyLocal = Number(fees.levy.toPrecision(12));
  const brokerFees = dollars(brokerLocal, listing.currency);
  const levyUsd = dollars(levyLocal, listing.currency);
  const taxUsd = notionalUsd * taxPct;
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: american && marketBp == null && marketPerShare != null ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd = parts.a == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  // A currency the account cannot take as a deposit is converted at the
  // unpublished house rate: an unknown cost in the total.
  const converts = !CASH.has(cash);
  const fxUsd = converts ? null : 0;
  const usd = plus(bookUsd, brokerFees, levyUsd, taxUsd, fxUsd);
  const confidence = [
    shared.basis,
    fundLike(listing.type) ? "barème ETF" : "barème action",
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? american
          ? `carnet ${marketPerShare} $ la part, NBBO coté : aucun courtier américain nommé`
          : `carnet ${marketPerShare} la part`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
    converts ? `change au cours maison non publié : ${cash} n'est pas une devise de dépôt, total inconnu` : `caisse en ${cash}, pas de change`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(converts
      ? { why: `${cash} n'est pas une devise de dépôt : change au cours maison, que Bright Smart ne publie pas, total inconnu` }
      : bookUsd == null
        ? { why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
        : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { buy: brokerLocal / 2, sell: brokerLocal / 2, currency: listing.currency },
    levy: { amount: levyLocal, currency: listing.currency },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      bourse: finite(levyUsd, 6),
      taxes: finite(taxUsd, 6),
      change: converts ? null : 0,
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
    console.log(JSON.stringify({
      ...SCHEDULE,
      default: PLANS[0],
      plans: {
        pershare: { us: US, basis: BASIS.US, remark: "" },
        percentage: { us: US_PERCENT, basis: BASIS.USPERCENT, remark: REMARKS.USPERCENT, levies: "SEC et TAF compris, pas de CAT" },
      },
      otherMarkets: "tous les marchés hors US : même barème sur les deux plans",
      cash: [...CASH].map((c) => (c === "CNY" ? "CNH" : c)),
      hk: HK,
      stockConnect: CN,
      shanghaiB: SHB,
      shenzhenB: SZB,
      taiwan: TW,
      singapore: SG,
      japan: JP,
      australia: AU,
      uk: UK,
    }, null, 2));
    return;
  }
  const [etf, place, currency] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (!etf) {
    console.error("usage : node brokers/brightsmart/brightsmart_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
    process.exit(2);
  }
  console.log(JSON.stringify(roundTrip({
    etf,
    place,
    currency,
    shares: Number(flag("shares") ?? "10"),
    price: Number(flag("price") ?? "0"),
    plan: flag("plan"),
  }), null, 2));
}

printCli();
