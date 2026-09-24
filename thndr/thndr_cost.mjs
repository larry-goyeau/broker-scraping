// What one round trip costs at Thndr: buy n shares at price p, sell them
// back at once, in dollars.
//
// The affine triple hid the EGP 2 ticket, the FRA 1 EGP floor and the US
// $0.20 + 0.1 % + $0.0015 / share stack. `roundTrip` is given the size and
// charges what is charged.
//
// Two companies, re-read 2026-09-17 from the Intercom cards. Egypt is
// Thndr Securities Brokerage (FRA 804). US and UAE are Thndr Financial
// Ltd (FSRA ADGM 240002), US routed through Alpaca. The catalogue is
// `thndr_scraping.mjs` — US via Alpaca plus EGX. Until that file has
// been run, this one answers that the book is missing. ADX is on the
// fee card and not yet in the catalogue.
//
//   EGX stocks / ETF     EGP 2 + 0.1 % a side
//     EGX / MCDR         0.01 % a side, cap EGP 5,000
//     FRA                0.005 % a fill, min EGP 1, cap EGP 250
//     risk insurance     0.005 % a side, cap EGP 5,000
//     stamp (T0)         0.025 % a side; T1/T2 is 0.05 %
//   US stocks / ETF      $0.20 + 0.1 % + $0.0015 / share a side
//     third-party        $0.000199 / share a side
//     SEC / TAF          sell only, current levies
//   ADX stocks / ETF     AED 0.49 + 0.1 % a side
//     third-party        0.03125 % a side
//     VAT                0.00125 % a side
//
// Mutual funds are 0 and are not in this catalogue. Gold is 1 % a side
// and is a fund, so it stays out. Thndr Trader (EGP 245 / month, 50
// Egypt trades) stays out of the number: a round trip is two orders and
// the grant is a monthly quota, same as Revolut. Third-party Egypt
// levies are never waived. Trader UAE (AED 39 / month) is data only.
//
// SEC / TAF use the current levies, not the stale $5.10 / $1,000,000
// and $0.000119 / $5.95 the US card still prints. CAT is not named.
// Stamp / FTT from taxMap by ISIN sit on top of the published Egypt
// damgha (taxMap has no EGX line today). One fill is assumed, so FRA
// bites once a side.
//
// Three wallets: EGP on EGX, USD on the US book, AED on ADX. FX stays
// out when the listing is the cash the matching wallet holds. Funding
// a wallet from another currency is not per order.
//
// Tickets already in the number stay out of the remark. The Trader
// grant, T1/T2 stamp and MCDR custody sit in the remark.
//
//   https://support.thndr.app/en/articles/638558-thndr-order-fees
//   https://support.thndr.app/en/articles/680040-us-thndr-order-fees
//   https://support.thndr.app/en/articles/680053-uae-uae-transaction-fees
//   https://support.thndr.app/en/articles/657048-thndr-trader-subscription
//
//   node thndr/thndr_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node thndr/thndr_cost.mjs COMI EGX EGP --shares=10 --price=80
//   node thndr/thndr_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("thndr-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  fees: "https://support.thndr.app/en/articles/638558-thndr-order-fees",
  us: "https://support.thndr.app/en/articles/680040-us-thndr-order-fees",
  uae: "https://support.thndr.app/en/articles/680053-uae-uae-transaction-fees",
  trader: "https://support.thndr.app/en/articles/657048-thndr-trader-subscription",
  traderUae: "https://support.thndr.app/en/articles/680052-uae-thndr-trader-uae",
  acat: "https://support.thndr.app/en/articles/680037-us-how-to-transfer-shares-between-thndr-and-another-broker-us-market",
  readOn: "2026-09-17",
  egyptEntity: "Thndr Securities Brokerage",
  usEntity: "Thndr Financial Ltd",
  carrierName: "Alpaca Securities LLC",
};

const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const CENT = 0.01;
const SEC_ON_PAGE = 0.0000051;
const TAF_ON_PAGE = { perShare: 0.000119, cap: 5.95 };

const EG_FIXED = 2;
const EG_PCT = 0.001;
const EG_EXCHANGE = 0.0001;
const EG_EXCHANGE_CAP = 5000;
const EG_FRA = 0.00005;
const EG_FRA_MIN = 1;
const EG_FRA_CAP = 250;
const EG_RISK = 0.00005;
const EG_STAMP_T0 = 0.00025;
const EG_STAMP_T1 = 0.0005;
const EG_CUSTODY = 0.0001;
const TRADER_EGP = 245;
const TRADER_FREE = 50;

const US_FIXED = 0.2;
const US_PCT = 0.001;
const US_PER_SHARE = 0.0015;
const US_THIRD = 0.000199;
const ACAT_OUT = 25;

const AE_FIXED = 0.49;
const AE_PCT = 0.001;
const AE_THIRD = 0.0003125;
const AE_VAT = 0.0000125;
const TRADER_AED = 39;
const AE_WITHDRAW_IN = 10.5;

const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS", "IEXG", "OTCM"]);
const US_EX = /^(NASDAQ|NYSE|AMEX|ARCA|NYSEARCA|BATS|BZX|CBOE|IEX|OTC)$/;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const up = (value) =>
  value == null || Number.isNaN(value) ? null : value > 0 ? Math.ceil(value / CENT - 1e-9) * CENT : 0;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const isCrypto = (row) => code(row?.type) === "CRYPTO" || /^CRYPTO$/i.test(String(row?.exchange || ""));

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
};

const fxNote = (currency) => ({ quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(currency) });

export function feeMarketOf(row, mic) {
  if (isCrypto(row)) return "crypto";
  const raw = code(row?.exchange);
  const m = code(mic);
  if (raw === "EGX" || raw === "CASE" || m === "XCAI") return "egx";
  if (raw === "ADX" || m === "XADS") return "adx";
  if (US_MICS.has(m) || US_EX.test(raw)) return "us";
  return null;
}

export function egyptBroker(notional) {
  if (!(Number(notional) > 0)) return null;
  return EG_FIXED + Number(notional) * EG_PCT;
}

export function egyptThird(notional) {
  if (!(Number(notional) > 0)) return null;
  const n = Number(notional);
  return {
    egx: clamp(n * EG_EXCHANGE, 0, EG_EXCHANGE_CAP),
    mcdr: clamp(n * EG_EXCHANGE, 0, EG_EXCHANGE_CAP),
    fra: clamp(n * EG_FRA, EG_FRA_MIN, EG_FRA_CAP),
    risk: clamp(n * EG_RISK, 0, EG_EXCHANGE_CAP),
    stamp: n * EG_STAMP_T0,
  };
}

export function usBroker(notional, shares) {
  if (!(Number(notional) > 0) || !(Number(shares) > 0)) return null;
  return US_FIXED + Number(notional) * US_PCT + Number(shares) * US_PER_SHARE;
}

export function uaeBroker(notional) {
  if (!(Number(notional) > 0)) return null;
  return AE_FIXED + Number(notional) * AE_PCT;
}

function cashOf(market) {
  if (market === "egx") return "EGP";
  if (market === "adx") return "AED";
  return "USD";
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const resolved = place ? resolveVenue({ exchange: place, mic: place }) : {};
  const wantVenue = resolved.venue || null;
  const wantPlace = loose(place);
  const wantCurrency = code(currency);

  const named = rowsNamed(rows, asked, (r) => {
    if (isCrypto(r) && loose(r.ticker) === asked) return true;
    return loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked;
  });
  const crypto = named.filter(isCrypto);
  if (crypto.length && (!place || /crypto/i.test(String(place)))) {
    return { named, matches: crypto.map((r) => ({ row: r, ...listingKey(r) })) };
  }

  const exactCode = wantPlace ? named.filter((r) => loose(r.exchange) === wantPlace) : [];
  const priced = named.filter((r) => feeMarketOf(r) != null);
  const pool = exactCode.length ? exactCode : priced.length ? priced : named;
  const matches = pool
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (exactCode.length) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace || loose(m.row.exchange).includes(wantPlace);
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);

  return { named, matches };
}

const listAlternatives = (named) =>
  named
    .map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "place non dite"}`)
    .slice(0, 12);

function coverage() {
  if (!rows.length) return null;
  const out = {};
  for (const r of rows) {
    const type = r.type || "?";
    const { venue, unsourced } = listingKey(r);
    const book = spreadLeaf(spreads, {
      isin: r.isin,
      mic: venue?.mic ?? null,
      currency: r.currency,
      unsourced,
    });
    const market = feeMarketOf(r, book.mic ?? venue?.mic) || "?";
    const slot = (out[type] ||= { n: 0, withBook: 0, crypto: 0, byMarket: {} });
    slot.n += 1;
    if (isCrypto(r)) slot.crypto += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) slot.withBook += 1;
    const mk = (slot.byMarket[market] ||= { n: 0, withBook: 0 });
    mk.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) mk.withBook += 1;
  }
  return out;
}

function remarkOf(market) {
  const lines = [];
  if (market === "egx") {
    lines.push(
      `Thndr Trader (EGP ${TRADER_EGP}/month) waives brokerage on the first ${TRADER_FREE} Egypt trades.`
    );
    lines.push(`Stamp 0.025% each way on a same-session trip; T1/T2 is 0.05% each way.`);
    lines.push(`MCDR custody 0.01%/year on 31 Dec stock value.`);
  } else if (market === "adx") {
    lines.push(`Thndr Trader UAE (AED ${TRADER_AED}/month) is data only.`);
    lines.push(`UAE withdrawal ${AE_WITHDRAW_IN} AED inside the UAE.`);
  }
  return lines.join("\n");
}

/**
 * The whole bill for buying `shares` at `price` and selling them straight
 * back. `usd` is the number the page prints; `brokerFees` is only Thndr's
 * own line (EGP 2 + 0.1 %, the US $0.20 stack, or AED 0.49 + 0.1 %), twice.
 */
export function roundTrip({
  etf,
  place,
  currency,
  shares,
  price,
  amount = null,
  bp = null,
  perShare = null,
}) {
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "USD",
  };

  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue Thndr n'existe pas encore : lancer `node thndr/thndr_scraping.mjs`",
    };
  }

  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Thndr` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Thndr`,
      alternatives: listAlternatives(named),
    };
  }

  const m = matches[0];
  const crypto = isCrypto(m.row);
  const book = crypto
    ? { leaf: null, mic: null }
    : spreadLeaf(spreads, {
        isin: m.row.isin,
        mic: m.venue?.mic ?? null,
        currency: m.row.currency,
        unsourced: m.unsourced,
        broker: "thndr",
        ticker: m.row.ticker,
      });
  const market = feeMarketOf(m.row, book.mic ?? m.venue?.mic);
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: crypto
      ? "Thndr"
      : m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency) || cashOf(market),
    brokerExchange: m.row.exchange || null,
  };

  const leaf = book.leaf;
  const n = Number(shares);
  const p = Number(price);
  const cash = Number(amount);
  const notional = crypto && cash > 0 ? cash : n > 0 && p > 0 ? n * p : null;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const tax = crypto ? { rates: {} } : taxesOf(listing.isin);
  const rates = { ...taxRates(tax) };
  delete rates.PTM_LEVY;
  delete rates.PTM;
  const taxPct = Object.values(rates).reduce((sum, rate) => sum + rate, 0);
  const cashCurrency = cashOf(market);

  const shared = {
    ...answer,
    listing,
    feeMarket: market,
    cashCurrency,
    remark: market ? remarkOf(market) : "",
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? (market === "us" ? SCHEDULE.us : market === "adx" ? SCHEDULE.uae : SCHEDULE.fees),
    basis: `barème Thndr ${market || "?"}, relu le ${SCHEDULE.readOn}`,
    tax,
    ccy: QUOTE,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
  };

  if (crypto || !market) {
    return {
      ...shared,
      why: crypto
        ? "pas de barème crypto chez Thndr"
        : `pas de barème Thndr pour ${m.row.exchange || "cette place"}`,
      confidence: confidenceOf({ market, listing, leaf, marketBp, marketPerShare, unsourced: m.unsourced, taxPct }),
    };
  }

  if (notional == null) {
    return {
      ...shared,
      why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node prices.mjs",
      confidence: confidenceOf({ market, listing, leaf, marketBp, marketPerShare, unsourced: m.unsourced, taxPct }),
    };
  }

  const notionalUsd = dollars(notional, listing.currency);
  const bookUsd =
    marketPerShare != null
      ? marketPerShare * n
      : marketBp != null && notionalUsd != null
        ? (notionalUsd * marketBp) / 1e4
        : null;
  const mapTaxUsd = notionalUsd == null ? 0 : notionalUsd * taxPct;

  let brokerEach = null;
  let brokerCcy = cashCurrency;
  let thirdUsd = 0;
  let stampUsd = 0;
  let secUsd = 0;
  let tafUsd = 0;
  let egypt = null;
  let uae = null;

  if (market === "egx") {
    brokerEach = egyptBroker(notional);
    brokerCcy = "EGP";
    egypt = egyptThird(notional);
    if (egypt) {
      thirdUsd = plus(
        dollars(egypt.egx, "EGP"),
        dollars(egypt.mcdr, "EGP"),
        dollars(egypt.fra, "EGP"),
        dollars(egypt.risk, "EGP")
      );
      thirdUsd = thirdUsd == null ? null : thirdUsd * 2;
      stampUsd = dollars(egypt.stamp * 2, "EGP");
    }
  } else if (market === "us") {
    brokerEach = usBroker(notional, n);
    brokerCcy = "USD";
    const thirdEach = n * US_THIRD;
    thirdUsd = thirdEach * 2;
    secUsd = notionalUsd == null ? null : up(notionalUsd * SEC_RATE);
    const tafRaw = Math.min(n * TAF_PER_SHARE, TAF_CAP);
    tafUsd = up(tafRaw);
  } else if (market === "adx") {
    brokerEach = uaeBroker(notional);
    brokerCcy = "AED";
    uae = {
      third: Number(notional) * AE_THIRD,
      vat: Number(notional) * AE_VAT,
    };
    thirdUsd = dollars(uae.third * 2, "AED");
    stampUsd = dollars(uae.vat * 2, "AED");
  }

  const brokerFees = brokerEach == null ? null : dollars(brokerEach * 2, brokerCcy);
  const usd = plus(bookUsd, brokerFees, thirdUsd, stampUsd, mapTaxUsd, secUsd, tafUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? {
          why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${
            m.unsourced?.why || "pas de feuille de carnet"
          }`,
        }
      : {}),
    trade: {
      shares: n,
      price: p,
      amount: null,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: listing.currency,
    },
    commission: {
      each: brokerEach,
      currency: brokerCcy,
      eachWay: true,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      réglementaire: finite(plus(thirdUsd, secUsd, tafUsd), 6),
      taxes: finite(plus(stampUsd, mapTaxUsd), 6),
    },
    egypt,
    uae,
    sell:
      market === "us"
        ? {
            sec: finite(secUsd, 6),
            taf: finite(tafUsd, 6),
            tafCapped: n * TAF_PER_SHARE >= TAF_CAP,
            thirdEach: finite(n * US_THIRD, 6),
          }
        : null,
    confidence: confidenceOf({
      market,
      listing,
      leaf,
      marketBp,
      marketPerShare,
      unsourced: m.unsourced,
      taxPct,
      n,
      notional,
      brokerEach,
      egypt,
    }),
  };
}

function confidenceOf({
  market,
  listing,
  leaf,
  marketBp,
  marketPerShare,
  unsourced,
  taxPct,
  n,
  notional,
  brokerEach,
  egypt,
}) {
  const said = [];
  if (market === "egx") {
    said.push(
      `courtage EGX ${EG_FIXED} EGP + ${100 * EG_PCT} % par ordre, relu le ${SCHEDULE.readOn} ` +
        `sur ${SCHEDULE.egyptEntity}`
    );
    said.push(
      `EGX / MCDR ${100 * EG_EXCHANGE} % plafonnés à ${EG_EXCHANGE_CAP} EGP, FRA ${100 * EG_FRA} % ` +
        `(min ${EG_FRA_MIN} EGP, max ${EG_FRA_CAP} EGP) une exécution par jambe, assurance ${100 * EG_RISK} %, ` +
        `droit de timbre T0 ${100 * EG_STAMP_T0} % (T1/T2 ${100 * EG_STAMP_T1} % hors du nombre)`
    );
    if (egypt) {
      said.push(
        `tiers ${Number((egypt.egx + egypt.mcdr + egypt.fra + egypt.risk).toPrecision(4))} EGP par sens, ` +
          `timbre ${Number(egypt.stamp.toPrecision(4))} EGP par sens`
      );
    }
    said.push(
      `Thndr Trader ${TRADER_EGP} EGP / mois, ${TRADER_FREE} ordres Égypte hors du nombre ` +
        `(quota mensuel, un aller-retour en consomme deux)`
    );
    said.push(`garde MCDR ${100 * EG_CUSTODY} % / an hors du trajet`);
  } else if (market === "us") {
    said.push(
      `courtage US ${US_FIXED} $ + ${100 * US_PCT} % + ${US_PER_SHARE} $/part par ordre, ` +
        `tiers ${US_THIRD} $/part les deux sens, relu le ${SCHEDULE.readOn}`
    );
    said.push(
      `SEC ${SEC_RATE} du montant à la vente (taux courant, la page imprime encore ${SEC_ON_PAGE}), ` +
        `TAF ${TAF_PER_SHARE} $/part plafonnée à ${TAF_CAP} $ — la page imprime encore ` +
        `${TAF_ON_PAGE.perShare} $ / ${TAF_ON_PAGE.cap} $`
    );
    said.push(
      `Thndr n'exécute pas : elle introduit chez ${SCHEDULE.carrierName}. CAT absent de la carte`
    );
  } else if (market === "adx") {
    said.push(
      `courtage ADX ${AE_FIXED} AED + ${100 * AE_PCT} % par ordre, tiers ${100 * AE_THIRD} %, ` +
        `TVA ${100 * AE_VAT} %, relu le ${SCHEDULE.readOn}`
    );
  } else if (market === "crypto") {
    said.push(`pas de barème crypto publié`);
  } else {
    said.push(`place hors barème Thndr`);
  }
  if (brokerEach != null) {
    said.push(`ticket ${Number(brokerEach.toPrecision(4))} ${market === "egx" ? "EGP" : market === "adx" ? "AED" : "$"} par sens`);
  }
  if (taxPct) said.push(`taxe de transfert ${(100 * taxPct).toFixed(2)} % prise dans taxMap.mjs`);
  if (market === "crypto") said.push(`pas de carnet`);
  else if (marketPerShare != null) said.push(`carnet Rule 605, ${marketPerShare} $ la part`);
  else if (marketBp != null) said.push(`carnet ${Number(marketBp.toPrecision(4))} bp`);
  else {
    said.push(
      `pas de feuille de carnet : ${unsourced?.name || listing.exchange}, ${
        unsourced?.why || "pas de source"
      }`
    );
  }
  if (!leaf && market !== "crypto") said.push(`carnet absent pour cette ligne`);
  said.push(
    `compte ${market === "egx" ? "EGP" : market === "adx" ? "AED" : "USD"}, ` +
      `la ligne est déjà dans cette devise, pas de change. Aucun aller-retour réel dans ce dépôt`
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
          egyptRates: {
            fixed: EG_FIXED,
            pct: EG_PCT,
            exchange: EG_EXCHANGE,
            exchangeCap: EG_EXCHANGE_CAP,
            fra: { rate: EG_FRA, min: EG_FRA_MIN, cap: EG_FRA_CAP },
            risk: EG_RISK,
            stampT0: EG_STAMP_T0,
            stampT1: EG_STAMP_T1,
            custody: EG_CUSTODY,
            trader: { egp: TRADER_EGP, free: TRADER_FREE },
          },
          usRates: {
            fixed: US_FIXED,
            pct: US_PCT,
            perShare: US_PER_SHARE,
            third: US_THIRD,
            acat: ACAT_OUT,
          },
          adxRates: {
            fixed: AE_FIXED,
            pct: AE_PCT,
            third: AE_THIRD,
            vat: AE_VAT,
            trader: TRADER_AED,
            withdrawIn: AE_WITHDRAW_IN,
          },
          sec: { used: SEC_RATE, onPage: SEC_ON_PAGE },
          taf: { used: { perShare: TAF_PER_SHARE, cap: TAF_CAP }, onPage: TAF_ON_PAGE },
          cash: { egx: "EGP", us: "USD", adx: "AED" },
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
      "usage : node thndr/thndr_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]\n" +
        "        node thndr/thndr_cost.mjs --schedule\n" +
        "  ex.   node thndr/thndr_cost.mjs AAPL NASDAQ USD --shares=10 --price=230\n" +
        "        node thndr/thndr_cost.mjs COMI EGX EGP --shares=10 --price=80"
    );
    process.exit(2);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    amount: flag("amount") ? Number(flag("amount")) : null,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const show = (x) => (x == null ? "N/A" : x);

  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) {
      console.log(`\nce que Thndr propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange || "—"}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}` +
      `  [${out.feeMarket}]\n`
  );

  if (out.trade) {
    const t = out.trade;
    console.log(
      `${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}` +
        (t.notionalUsd != null ? ` (${t.notionalUsd.toFixed(2)} $)` : "") +
        "\n"
    );
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${show(out.brokerFees)} $`);
    const parts = out.parts || {};
    if (parts.marché != null) console.log(`  carnet         : ${parts.marché} $`);
    if (parts.courtage != null) console.log(`  courtage       : ${parts.courtage} $`);
    if (parts.réglementaire) console.log(`  réglementaire  : ${parts.réglementaire} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
    console.log("");
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}\n`);
  }

  console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);
  if (out.remark) for (const r of out.remark.split("\n")) console.log(`  · ${r}`);
  if (out.url) console.log(`\n${out.url}`);
}
