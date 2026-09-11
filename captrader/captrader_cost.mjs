// What one round trip costs at CapTrader: buy n shares at price p, sell them
// back at once.
//
//   coût (USD) = a × toUsd(p) × n + b × n + c
//
// `a` is a fraction of the amount. `b` and `c` are dollars, the same unit the
// other `*_cost.mjs` files answer in.
//
// CapTrader GmbH (DE) is an introducing broker onto Interactive Brokers
// Ireland. The catalogue is the IBKR book (`captrader_scraping.mjs`). Custody is free.
// The published card is 0.10 % of notional on most equity venues, with a
// minimum that depends on the exchange, or 0.01 $ / share (min 2 $) in the
// United States. Europe's % × 2 sits in `a`. The US 0.01 $ stays out of `b`
// (the 2 $ min is the whole bill under 200 shares). The ticket is a floor
// (`min fees`, `c` = 0). `exactCost` answers the real step, including the
// Xetra 99 € cap and the US 1 % cap.
//
// Frankfurt and Stuttgart add a specialist line on top of the 0.10 %
// (footnotes on the Aktien page). Xetra already includes exchange fees.
//
// Conversion at the IBKR mid is left out of `a`, the same way Trading212
// leaves its 0.15 %. SEC / TAF use the same current figures as the other
// files; CapTrader's page still prints an older pair (0.0000278 / 0.000166).
//
// US-domiciled ETFs (`nonEuResident`) are not buyable for an EU retail
// account (PRIIPs). They answer `onlineBuy: false`.
//
// Live 2026-09-10, account U27604034 (EUR): 1 IWDA market, ticket bound
// AEB, both legs routed GETTEX2 @ 126.10, fees 2.00 € each way. GETTEX
// min confirmed. AEB / other_eu min still unknown (SMART left AEB).
// US still needs 2 000 € to convert; not tried again.
//
//   https://www.captrader.com/konditionen/aktien-handel/
//   https://www.captrader.com/konditionen/etf-handel/
//
//   node captrader/captrader_cost.mjs AAPL NASDAQ USD
//   node captrader/captrader_cost.mjs TTE SBF EUR
//   node captrader/captrader_cost.mjs IWDA AEB EUR --shares=1 --price=100
//   node captrader/captrader_cost.mjs --schedule
//
// `roundTripCost(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite, bookParts } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("captrader-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  stocks: "https://www.captrader.com/konditionen/aktien-handel/",
  etfs: "https://www.captrader.com/konditionen/etf-handel/",
  overview: "https://www.captrader.com/konditionen/",
  readOn: "2026-09-09",
  pageUpdated: "2026-08-18",
  entity: "CapTrader GmbH (DE), IBKR introducing broker",
};

const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const PTM = { each: 1.5, currency: "GBP", above: 10000 };
const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);

// rate of notional per side unless `perShare`. min / max in `ccy`.
const RULE = {
  us: { perShare: 0.01, min: 2, maxPct: 0.01, ccy: "USD" },
  ca: { perShare: 0.01, min: 1, ccy: "CAD" },
  xetra: { rate: 0.001, min: 4, max: 99, ccy: "EUR" },
  gettex: { rate: 0.001, min: 2, ccy: "EUR" },
  frankfurt: { rate: 0.001504, min: 7.52, ccy: "EUR" },
  stuttgart: { rate: 0.001672, min: 6.53, ccy: "EUR" },
  vienna: { rate: 0.001, min: 4, max: 120, ccy: "EUR" },
  ch: { rate: 0.001, min: 15, ccy: "CHF" },
  uk: { rate: 0.001, min: 8, ccy: "GBP" },
  jp: { rate: 0.001, min: 500, ccy: "JPY" },
  pl: { rate: 0.001, min: 20, ccy: "PLN" },
  other_eu: { rate: 0.001, min: null, ccy: "EUR" },
  otc: { rate: null, min: null, ccy: "USD" },
};

const CHECK = {
  isin: "IE00B4L5Y983",
  ticker: "IWDA",
  ticketBound: "AEB",
  venuePrinted: "GETTEX2",
  n: 1,
  buy: { price: 126.1, ticket: 2, orderId: 279822955 },
  sell: { price: 126.1, ticket: 2, orderId: 279822959 },
  cash: { start: 251, afterBuy: 122.9, end: 247 },
  commissionPaid: 4,
  on: "2026-09-10",
};

const TO_VENUES = {
  TSE: "TSX",
  TSEJ: "TSEJ",
  "BVME.ETF": "BVME",
  "ENEXT.BE": "XBRU",
  LSEIOB1: "LSE",
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
};

const fxNote = (currency) => ({
  quote: QUOTE,
  asOf: FX_AS_OF,
  listing: usdPer(currency),
});

const venueRow = (row) => ({
  ...row,
  exchange: TO_VENUES[row.exchange] || row.exchange,
});

function remarkOf({ market } = {}) {
  const r = RULE[market];
  if (market === "otc") return "OTC / Pink: different card, not this file.";
  if (!r) return "";
  if (r.min == null) return "0.10%. min depends on the venue.";
  const ccy = r.ccy === "EUR" ? "€" : r.ccy === "USD" ? "$" : r.ccy === "GBP" ? "£" : r.ccy;
  const n = r.min * 2;
  const amount = r.ccy === "USD" || r.ccy === "EUR" || r.ccy === "GBP" ? `${n} ${ccy}` : `${n} ${r.ccy}`;
  return `min fees ${amount}.`;
}

export function feeMarketOf(exchange, mic) {
  const code = loose(exchange);
  const m = String(mic || "").toUpperCase();
  if (code === "PINK" || code === "PURE" || code === "VALUE" || code === "ARCAEDGE" || /PINK|OTCM/i.test(code)) {
    return "otc";
  }
  if (US_MICS.has(m) || /^(NASDAQ|NYSE|AMEX|ARCA|BATS)$/.test(code)) return "us";
  if (code === "IBIS" || code === "IBIS2" || m === "XETR") return "xetra";
  if (code === "GETTEX" || code === "GETTEX2" || m === "XMUN" || m === "XGAT") return "gettex";
  if (code === "FWB" || code === "FWB2" || m === "XFRA") return "frankfurt";
  if (code === "SWB" || code === "SWB2" || m === "XSTU") return "stuttgart";
  if (code === "VSE" || m === "XWBO") return "vienna";
  if (code === "EBS" || m === "XSWX") return "ch";
  if (code === "LSE" || code === "LSEETF" || code === "LSEIOB1" || m === "XLON") return "uk";
  if (code === "TSE" || code === "TSX" || code === "VENTURE" || code === "AEQLIT" || m === "XTSE") return "ca";
  if (code === "TSEJ" || m === "XJPX" || m === "XTKS") return "jp";
  if (code === "WSE" || m === "XWAR") return "pl";
  if (
    /^(SBF|AEB|ENEXTBE|ISED|BVL|OSE|BVME|BVMEETF)$/.test(code) ||
    ["XPAR", "XAMS", "XBRU", "XLIS", "XMSM", "XDUB", "XMIL", "XOSL"].includes(m)
  ) {
    return "other_eu";
  }
  return "other_eu";
}


function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rows.filter((r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(venueRow(r)) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace || loose(m.row.exchange).includes(wantPlace);
    })
    .filter((m) => !wantCurrency || String(m.row.currency || "").toUpperCase() === wantCurrency);

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
    const { venue, unsourced } = listingKey(venueRow(r));
    const book = spreadLeaf(spreads, {
      isin: r.isin,
      mic: venue?.mic ?? null,
      currency: r.currency,
      unsourced,
    });
    const market = feeMarketOf(r.exchange, book.mic ?? venue?.mic);
    const slot = (out[type] ||= { n: 0, withBook: 0, byMarket: {} });
    slot.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) slot.withBook += 1;
    const mk = (slot.byMarket[market] ||= { n: 0, withBook: 0 });
    mk.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) mk.withBook += 1;
  }
  return out;
}

export function commissionEach({ shares, amount, market }) {
  const rule = RULE[market];
  if (!rule || rule.rate == null && rule.perShare == null) return null;
  if (rule.perShare != null) {
    if (shares == null || !Number.isFinite(Number(shares))) return rule.min;
    let fee = rule.perShare * Number(shares);
    if (rule.min != null) fee = Math.max(rule.min, fee);
    if (rule.maxPct != null && amount != null) fee = Math.min(fee, Number(amount) * rule.maxPct);
    return fee;
  }
  if (amount == null || !Number.isFinite(Number(amount))) return rule.min;
  let fee = Number(amount) * rule.rate;
  if (rule.min != null) fee = Math.max(rule.min, fee);
  if (rule.max != null) fee = Math.min(rule.max, fee);
  return fee;
}

export function exactCost({ shares, price, market, currency }) {
  const rule = RULE[market];
  if (!rule) return { commission: null, currency: QUOTE };
  const amount = shares != null && price != null ? Number(shares) * Number(price) : null;
  const each = commissionEach({ shares, amount, market });
  if (each == null) return { commission: null, currency: QUOTE, rule };
  return {
    commission: dollars(each * 2, rule.ccy),
    currency: QUOTE,
    native: { each, roundTrip: each * 2, currency: rule.ccy },
    rule,
  };
}

export function roundTripCost({ etf, place, currency, bp = null, perShare = null }) {
  const { named, matches } = findListing({ etf, place, currency });
  const answer = {
    a: null,
    b: 0,
    c: 0,
    ccy: QUOTE,
    floor: null,
    cap: null,
    threshold: null,
    etf,
    place,
    currency,
  };

  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue CapTrader n'existe pas encore : lancer `node captrader/captrader_scraping.mjs`",
    };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue CapTrader` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez CapTrader`,
      alternatives: listAlternatives(named),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
  });
  const listing = {
    isin: String(m.row.isin || "").toUpperCase(),
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || "").toUpperCase(),
    brokerExchange: m.row.exchange || null,
  };

  const market = feeMarketOf(m.row.exchange, listing.mic);
  const rule = RULE[market] || RULE.other_eu;
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const american = market === "us";
  const tax = taxesOf(listing.isin);
  const rates = taxRates(tax);
  const taxTotal = Object.values(rates).reduce((s, r) => s + r, 0);

  if (market === "otc") {
    return {
      ...answer,
      listing,
      feeMarket: "otc",
      remark: remarkOf({ market: "otc" }),
      why: "OTC / Pink / Arcaedge : barème distinct, non recopié ici",
      tax,
      fx: fxNote(listing.currency),
    };
  }

  const commissionPct = rule.rate != null ? rule.rate * 2 : 0;
  const knownPct = taxTotal + (american ? SEC_RATE : 0) + commissionPct;
  const mkt = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (x) => (american ? x : dollars(x, listing.currency)),
  });
  const a = plus(mkt.a, knownPct);
  const bookUsd = mkt.b;
  const floorUsd = rule.min != null ? dollars(rule.min * 2, rule.ccy) : null;

  return {
    ...answer,
    a: finite(a, 4),
    b: finite(plus(bookUsd, american ? TAF_PER_SHARE : 0), 6),
    c: 0,
    floor: floorUsd,
    listing,
    feeMarket: market,
    onlineBuy: m.row.nonEuResident !== true,
    remark: remarkOf({ market }),
    parts: {
      marché:
        marketBp != null
          ? Number((marketBp / 1e4).toPrecision(4))
          : marketPerShare != null
            ? `${marketPerShare} par part`
            : null,
      taxes: Object.keys(rates).length ? rates : null,
      réglementaire: american ? { SEC: SEC_RATE, FINRA: `${TAF_PER_SHARE} par part` } : null,
      commission: commissionPct || null,
    },
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.stocks,
    basis: `barème CapTrader ${market}, lu le ${SCHEDULE.readOn} (page mise à jour ${SCHEDULE.pageUpdated})`,
    tax,
    commission: {
      rate: rule.rate ?? null,
      perShare: rule.perShare ?? null,
      min: rule.min,
      max: rule.max ?? null,
      maxPct: rule.maxPct ?? null,
      currency: rule.ccy,
      eachWay: true,
    },
    ccy: QUOTE,
    cap: american
      ? { term: "b", part: "FINRA TAF", amount: TAF_CAP, per: "exécution" }
      : rule.max != null
        ? { commission: { amount: dollars(rule.max, rule.ccy), native: rule.max, currency: rule.ccy } }
        : null,
    threshold:
      listing.mic === "XLON"
        ? {
            c: dollars(2 * PTM.each, "GBP"),
            currency: QUOTE,
            above: PTM.above,
            aboveCurrency: "GBP",
            why: `prélèvement PTM de ${PTM.each} £ par ordre et par sens, au-delà de ${PTM.above} £`,
          }
        : null,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    check: market === "gettex" ? CHECK : null,
    confidence:
      `commission ${market} selon la carte CapTrader du ${SCHEDULE.readOn} ` +
      `(page Aktien ${SCHEDULE.pageUpdated}). ` +
      (rule.rate != null
        ? `${(rule.rate * 100).toFixed(2)} % par jambe` +
          (rule.min != null ? `, plancher ${rule.min} ${rule.ccy}` : ", plancher selon la place") +
          `. `
        : `0,01 ${rule.ccy} par part, plancher ${rule.min} ${rule.ccy}. `) +
      `a = carnet + taxes` +
      (american ? ` + SEC` : "") +
      (commissionPct ? ` + ${(commissionPct * 100).toFixed(2)} % de courtage` : "") +
      `. Ticket dans le plancher, b = ` +
      (american ? `605 + TAF` : `0`) +
      `, c = 0. ` +
      (market === "gettex"
        ? `Un aller-retour réel le ${CHECK.on} sur ${CHECK.ticker} : ticket AEB, ` +
          `SMART → ${CHECK.venuePrinted} @ ${CHECK.buy.price}, courtage ${CHECK.buy.ticket} € par jambe ` +
          `(caisse ${CHECK.cash.start} → ${CHECK.cash.end} €). `
        : `GETTEX plancher 2 € vu en live le ${CHECK.on} (IWDA SMART→GETTEX2). ` +
          (rule.min == null ? `Plancher other_eu toujours inconnu. ` : "")) +
      (leaf ? "" : `Pas de feuille de carnet pour cet ISIN / cette place. `),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const m = process.argv.find((a) => a.startsWith(`--${name}=`));
    return m ? m.split("=").slice(1).join("=") : null;
  };

  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({ ...SCHEDULE, rules: RULE, coverage: coverage() }, null, 2));
    process.exit(0);
  }

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error(
      "usage : node captrader_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--json]\n" +
        "        node captrader_cost.mjs --schedule\n" +
        "  ex.   node captrader_cost.mjs AAPL NASDAQ USD\n" +
        "        node captrader_cost.mjs TTE SBF EUR\n" +
        "        node captrader_cost.mjs IWDA AEB EUR --shares=1 --price=100"
    );
    process.exit(2);
  }

  const out = roundTripCost({
    etf,
    place,
    currency,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  if (out.a == null && !out.listing) {
    console.log(`a = null   b = ${out.b}   c = ${out.c}\n${out.why}`);
    if (out.alternatives?.length) {
      console.log(`\nce que CapTrader propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}\n`
  );

  const detail = [];
  if (out.parts?.marché != null) detail.push(`carnet ${out.parts.marché}`);
  for (const [name, rate] of Object.entries(out.parts?.taxes ?? {})) detail.push(`${name} ${rate}`);
  if (out.parts?.commission) detail.push(`courtage ${out.parts.commission}`);
  if (out.parts?.réglementaire) detail.push(`SEC ${out.parts.réglementaire.SEC}`);

  console.log(`a = ${out.a}   (au prorata${detail.length ? " : " + detail.join(" + ") : " : rien"})`);
  console.log(`b = ${out.b} $   (par part${out.b ? " : FINRA et/ou spread 605" : " : rien"})`);
  console.log(`c = ${out.c} $   (par ordre : ticket dans la remark, pas dans c)`);
  if (out.floor != null) console.log(`plancher ${out.floor} $`);
  const fx = out.fx?.listing ?? usdPer(l.currency);
  console.log(
    `\ncoût = ${out.a} × p × n × ${fx != null ? Number(fx.toPrecision(6)) : "?"} + ${out.b} × n + ${out.c}   ($ ; p en ${l.currency})`
  );
  console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);

  const n = Number(flag("shares"));
  const p = Number(flag("price"));
  if (n > 0 && p > 0) {
    const amount = n * p;
    const amountUsd = toUsd(amount, l.currency);
    const extra = out.threshold && amount >= out.threshold.above ? out.threshold.c : 0;
    const affine = amountUsd != null && out.a != null ? out.a * amountUsd + out.b * n + out.c + extra : null;
    const billed = exactCost({ shares: n, price: p, market: out.feeMarket, currency: l.currency });
    console.log(
      `\n${n} part${n > 1 ? "s" : ""} à ${p} ${l.currency} = ${amount.toFixed(2)} ${l.currency}` +
        (amountUsd != null ? ` (${amountUsd.toFixed(2)} $)` : "")
    );
    if (affine != null) console.log(`  a, b, c        : ${affine.toFixed(4)} $`);
    if (billed.commission != null) {
      console.log(
        `  commission     : ${Number(billed.commission).toFixed(4)} $` +
          (billed.native?.each != null ? ` (${Number(billed.native.each).toPrecision(4)} ${billed.native.currency} × 2)` : "")
      );
    }
  }
  if (out.url) console.log(`\n${out.url}`);
}
