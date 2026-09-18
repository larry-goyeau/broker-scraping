// What one round trip costs at EasyEquities: buy n shares at price p, sell
// them back at once, online simple order, in dollars.
//
// The affine triple hid the ticket. Brokerage is 0.25 % plus settlement,
// VAT 15 % on those costs, and a 1 c / 1 p floor that lived only in
// `floor` / `min fees`. A one-rand JSE fill was missing 2 c. FINRA's
// 9.79 $ TAF cap sat in `cap` the same way. `roundTrip` is given the
// size and charges what is charged.
//
// First World Trader (Pty) Ltd t/a EasyEquities (ZA). ZAR & TFSA profile
// of 12 February 2026; USD Nov 2024; AUD / GBP / EUR March 2026. Re-read
// 2026-09-15 — unchanged since the 10th. Default is the online simple
// order on the wallet of the listing currency. Advanced (0.35 %), recurring
// (0.10 %), telephone and baskets are not this trip. TFSA prints the same
// stock tickets as the ZAR account.
//
//   every wallet     0.25 % brokerage, + 15 % VAT on costs
//   ZA               + 0.0795 % settlement + 0.00031 % IPL (both ways)
//                    + STT 0.25 % on a STOCK buy
//   US / AU / GB / EU
//                    + 0.31 % clearing both ways
//   US               + current SEC / TAF (their printed 0.00218 % / 0.0029 %
//                    are stale / a % stand-in)
//   GB               stamp 0.50 % on a STOCK buy (taxMap, else printed)
//   IE               stamp 1 % on a Dublin STOCK buy
//
// What is in the number: brokerage + settlement + VAT, each way, at the
// 1 c / 1 p floor when it binds (rounded to the nearest cent / penny);
// IPL both ways on JSE; STT / UK / Irish stamp / FTT on a purchase;
// current SEC and TAF on an American sale, TAF capped at 9.79 $; the
// market spread, once.
//
// EasyFX is a transfer between wallets (0.50 % + VAT, rate 0.70 % above
// WM/R on ZAR pairs), not a charge on every fill. Thrive 25 R / month is
// a holding cost. Both stay in the remark.
//
// EasyCrypto (spot, same group) is a different book. Help centre, re-read
// 2026-09-15: 0.25 % execution + 0.075 % settlement + VAT each way. No
// published ticket minimum. Token admin 1.5 % p.a. + VAT sits in the NAV.
//
// Catalogue 2 198 lines — 1 695 stocks, 368 ETFs, 94 crypto.
// No live trip: the coefficients are the printed %.
//
//   https://www.easyequities.co.za/pricing
//   https://resources.easyequities.co.za/EasyEquities_CostProfile.pdf
//   https://resources.easyequities.co.za/EasyEquities_CostProfile_USTrading.pdf
//   https://resources.easyequities.co.za/EasyEquities_CostProfile_AUSTrading.pdf
//   https://resources.easyequities.co.za/EasyEquities_CostProfile_UKTrading.pdf
//   https://resources.easyequities.co.za/EasyEquities_CostProfile_EURTrading.pdf
//   https://support.easycrypto.co.za/support/solutions/articles/13000092725-what-are-your-fees-
//
//   node easyequities/easyequities_cost.mjs AAPL NASDAQ USD --shares=1 --price=230
//   node easyequities/easyequities_cost.mjs VOD JSE ZAR --shares=10 --price=120
//   node easyequities/easyequities_cost.mjs VOD LSE GBP --shares=10 --price=0.8
//   node easyequities/easyequities_cost.mjs BTC CRYPTO --amount=1000
//   node easyequities/easyequities_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, fxRemark } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("easyequities-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://www.easyequities.co.za/pricing",
  zar: "https://resources.easyequities.co.za/EasyEquities_CostProfile.pdf",
  usd: "https://resources.easyequities.co.za/EasyEquities_CostProfile_USTrading.pdf",
  aud: "https://resources.easyequities.co.za/EasyEquities_CostProfile_AUSTrading.pdf",
  gbp: "https://resources.easyequities.co.za/EasyEquities_CostProfile_UKTrading.pdf",
  eur: "https://resources.easyequities.co.za/EasyEquities_CostProfile_EURTrading.pdf",
  crypto: "https://support.easycrypto.co.za/support/solutions/articles/13000092725-what-are-your-fees-",
  readOn: "2026-09-15",
  previouslyRead: "2026-09-10",
  cryptoReadOn: "2026-09-15",
  cryptoPreviouslyRead: "2026-09-11",
  zarRevised: "2026-02-12",
  foreignRevised: "2026-03",
  entity: "EasyEquities (First World Trader, ZA)",
};

const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const VAT = 0.15;
const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);

const RULE = {
  za: {
    comm: 0.0025,
    extra: 0.000795,
    ipl: 0.0000031,
    stt: 0.0025,
    min: 0.01,
    minCcy: "ZAR",
  },
  us: { comm: 0.0025, extra: 0.0031, min: null, minCcy: "USD" },
  au: { comm: 0.0025, extra: 0.0031, min: null, minCcy: "AUD" },
  gbp: { comm: 0.0025, extra: 0.0031, stamp: 0.005, min: 0.01, minCcy: "GBP" },
  eur: { comm: 0.0025, extra: 0.0031, irish: 0.01, min: 0.01, minCcy: "EUR" },
  crypto: { comm: 0.0025, extra: 0.00075, min: null, minCcy: null },
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const isStock = (listing) => String(listing?.type || "").toUpperCase() === "STOCK";
const roundCent = (n) => Math.round(Number(n) * 100) / 100;

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
};

const fxNote = (currency) => ({
  quote: QUOTE,
  asOf: FX_AS_OF,
  listing: usdPer(currency),
});

const codeMarket = (query) => {
  const parts = String(query || "").toUpperCase().split(".");
  if (parts[0] !== "EQU" || !parts[1]) return null;
  return { ZA: "za", US: "us", AU: "au", GBP: "gbp", DE: "eur", NL: "eur" }[parts[1]] || null;
};

export function feeMarketOf(row, mic) {
  const type = String(row?.type || "").toUpperCase();
  const code = loose(row?.exchange);
  if (type === "CRYPTO" || code === "CRYPTO" || code === "EC") return "crypto";
  const fromCode = codeMarket(row?.query);
  if (fromCode) return fromCode;
  const m = String(mic || "").toUpperCase();
  const ccy = String(row?.currency || "").toUpperCase();
  if (US_MICS.has(m) || /^(NASDAQ|NYSE|AMEX|ARCA|BATS|USA)$/.test(code) || ccy === "USD") return "us";
  if (code === "JSE" || m === "XJSE" || ccy === "ZAR") return "za";
  if (code === "ASX" || m === "XASX" || ccy === "AUD") return "au";
  if (m === "XLON" || code === "LSE" || code === "UK" || ccy === "GBP" || ccy === "GBX") return "gbp";
  if (["XETR", "XPAR", "XAMS", "XBRU", "XMIL", "XMSM", "GETTEX"].includes(m) || /^(XETR|EURONEXT|GETTEX)$/.test(code) || ccy === "EUR") {
    return "eur";
  }
  return null;
}

function sidePct(rule) {
  return (rule.comm + (rule.extra || 0)) * (1 + VAT);
}

function remarkOf(market, currency) {
  if (market === "crypto") return "";
  return ["Thrive 25 R/month.", fxRemark("0.5", currency)].join("\n");
}

function stampOf({ market, listing, tax }) {
  if (market === "crypto" || String(listing?.type || "").toUpperCase() === "CRYPTO") {
    return { pct: 0, rates: {}, source: null };
  }
  const rates = taxRates(tax);
  const fromMap = Object.values(rates).reduce((s, r) => s + r, 0);
  if (fromMap) return { pct: fromMap, rates, source: "taxMap" };
  if (market === "za" && isStock(listing) && RULE.za.stt) {
    return { pct: RULE.za.stt, rates: { STT: RULE.za.stt }, source: "za" };
  }
  if (market === "gbp" && isStock(listing) && (listing.mic === "XLON" || /LSE|UK/i.test(listing.brokerExchange || ""))) {
    return { pct: RULE.gbp.stamp, rates: { stamp: RULE.gbp.stamp }, source: "ee" };
  }
  if (market === "eur" && isStock(listing) && (listing.mic === "XMSM" || listing.mic === "XDUB")) {
    return { pct: RULE.eur.irish, rates: { stamp: RULE.eur.irish }, source: "ee" };
  }
  return { pct: 0, rates: {}, source: null };
}

/**
 * One side, in the wallet currency. ZA / GBP / EUR floor at 1 c or 1 p and
 * round to the nearest unit. US / AU / crypto have no published minimum.
 */
export function commissionSide({ amount, market }) {
  const rule = RULE[market];
  if (!rule || amount == null || !Number.isFinite(Number(amount))) return null;
  const rate = sidePct(rule);
  const raw = Number(amount) * rate;
  const rounded = rule.min != null ? roundCent(raw) : raw;
  const charged = rule.min != null ? Math.max(rule.min, rounded) : rounded;
  return {
    charged,
    raw,
    floored: rule.min != null && rounded < rule.min,
    currency: rule.minCcy || (market === "crypto" ? "USD" : null),
    rate,
  };
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rows.filter(
    (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked
  );
  const exactCode = wantPlace ? named.filter((r) => loose(r.exchange) === wantPlace) : [];
  const pool = exactCode.length ? exactCode : named;
  const matches = pool
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (exactCode.length) return true;
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
    const { venue, unsourced } = listingKey(r);
    const book = spreadLeaf(spreads, {
      isin: r.isin,
      mic: venue?.mic ?? null,
      currency: r.currency,
      unsourced,
    });
    const market = feeMarketOf(r, book.mic ?? venue?.mic) || "?";
    const slot = (out[type] ||= { n: 0, withBook: 0, byMarket: {} });
    slot.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) slot.withBook += 1;
    const mk = (slot.byMarket[market] ||= { n: 0, withBook: 0 });
    mk.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) mk.withBook += 1;
  }
  return out;
}

/**
 * The whole bill for buying `shares` at `price` (or putting `amount` into a
 * coin) and selling straight back. `brokerFees` is brokerage + settlement +
 * VAT, not STT / IPL / SEC / TAF.
 */
export function roundTrip({ etf, place, currency, shares, price, amount, bp = null, perShare = null }) {
  const answer = {
    usd: null,
    brokerFees: null,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: null,
  };

  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue EasyEquities n'existe pas encore : lancer `node easyequities/easyequities_scraping.mjs`",
    };
  }

  let { named, matches } = findListing({ etf, place, currency });
  if (amount != null && matches.length > 1) {
    const coins = matches.filter((hit) => feeMarketOf(hit.row) === "crypto");
    if (coins.length) matches = coins;
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue EasyEquities` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez EasyEquities`,
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
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || "").toUpperCase() || null,
    brokerExchange: m.row.exchange || null,
    query: m.row.query || null,
  };

  const market = feeMarketOf(m.row, listing.mic);
  const rule = RULE[market];
  if (!rule) {
    return {
      ...answer,
      listing,
      why: `${listing.brokerExchange || listing.exchange} n'a pas de palier publié`,
    };
  }

  const wallet = rule.minCcy || listing.currency || (market === "crypto" ? "USD" : null);
  listing.currency = listing.currency || wallet;
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const american = market === "us";
  const tax = taxesOf(listing.isin);
  const stamp = stampOf({ market, listing, tax });
  const crypto = market === "crypto";

  const shared = {
    ...answer,
    cashCurrency: wallet,
    listing,
    feeMarket: market,
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? (crypto ? SCHEDULE.crypto : SCHEDULE.source),
    tax,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    remark: remarkOf(market, listing.currency),
  };

  const basis = crypto
    ? `barème EasyCrypto, help centre relu le ${SCHEDULE.cryptoReadOn} : 0.25 % + 0.075 % + TVA`
    : `barème EasyEquities ${market}, cost profile relu le ${SCHEDULE.readOn} : ${(rule.comm * 100).toFixed(2)} %` +
      (rule.extra ? ` + ${(rule.extra * 100).toFixed(4)} %` : "") +
      ` + TVA ${(VAT * 100).toFixed(0)} %`;

  const n = Number(shares);
  const p = Number(price);
  const cash = Number(amount);
  const notional = n > 0 && p > 0 ? n * p : crypto && cash > 0 ? cash : null;

  if (notional == null) {
    return {
      ...shared,
      basis,
      why: crypto
        ? "aucun montant pour cette ligne"
        : !(n > 0)
          ? "aucun nombre de parts"
          : "aucun prix pour cette ligne : lancer node prices.mjs",
      confidence: confidenceOf({ rule, market, listing, leaf, marketBp, marketPerShare, unsourced: m.unsourced, stamp }),
    };
  }

  const notionalUsd = toUsd(notional, listing.currency);
  const bookUsd =
    marketBp != null && notionalUsd != null
      ? (notionalUsd * marketBp) / 1e4
      : marketPerShare != null
        ? marketPerShare * n
        : null;

  const buy = commissionSide({ amount: notional, market });
  const sell = commissionSide({ amount: notional, market });
  const buyUsd = buy ? dollars(buy.charged, wallet) : null;
  const sellUsd = sell ? dollars(sell.charged, wallet) : null;
  const brokerFees = plus(buyUsd, sellUsd);

  const taxUsd = stamp.pct && notionalUsd != null ? notionalUsd * stamp.pct : 0;
  const iplUsd = rule.ipl && notionalUsd != null ? notionalUsd * rule.ipl * 2 : 0;
  const secUsd = american ? (notionalUsd == null ? null : notionalUsd * SEC_RATE) : 0;
  const tafUsd = american ? Math.min(TAF_CAP, TAF_PER_SHARE * n) : 0;

  const usd = plus(bookUsd, brokerFees, taxUsd, iplUsd, secUsd, tafUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? {
          why:
            `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ` +
            `${m.unsourced?.why || "pas de source de spread"}`,
        }
      : {}),
    trade: {
      shares: n > 0 ? n : null,
      price: p > 0 ? p : null,
      amount: crypto ? notional : null,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: listing.currency,
    },
    buy: {
      commission: finite(buyUsd, 6),
      native: buy ? { ...buy, charged: finite(buy.charged, 6), raw: finite(buy.raw, 6) } : null,
      taxes: finite(taxUsd, 6),
      taxRates: Object.keys(stamp.rates).length ? stamp.rates : null,
    },
    sell: {
      commission: finite(sellUsd, 6),
      native: sell ? { ...sell, charged: finite(sell.charged, 6), raw: finite(sell.raw, 6) } : null,
      sec: finite(secUsd, 6),
      taf: finite(tafUsd, 6),
    },
    parts: {
      marché: finite(bookUsd, 6),
      commission: finite(brokerFees, 6),
      taxes: finite(taxUsd, 6),
      réglementaire: finite(plus(iplUsd, secUsd, tafUsd), 6),
    },
    commission: {
      rate: rule.comm,
      extra: rule.extra || 0,
      vat: VAT,
      min: rule.min,
      currency: wallet,
      eachWay: true,
    },
    basis,
    confidence: confidenceOf({
      rule,
      market,
      listing,
      leaf,
      marketBp,
      marketPerShare,
      unsourced: m.unsourced,
      stamp,
      buy,
      n,
      american,
      tafUsd,
    }),
  };
}

function confidenceOf({
  rule,
  market,
  listing,
  leaf,
  marketBp,
  marketPerShare,
  unsourced,
  stamp,
  buy,
  n,
  american,
  tafUsd,
}) {
  const said = [];
  if (market === "crypto") {
    said.push(
      `EasyCrypto, help centre relu le ${SCHEDULE.cryptoReadOn} (inchangé depuis le ${SCHEDULE.cryptoPreviouslyRead})`
    );
    said.push(
      `exécution ${(rule.comm * 100).toFixed(2)} % + règlement ${(rule.extra * 100).toFixed(3)} % par sens, ` +
        `TVA ${(VAT * 100).toFixed(0)} % (taux du cost profile ZA — la page dit seulement « + VAT »)`
    );
    said.push(`pas de plancher publié. Admin 1,5 % / an des tokens hors du total`);
  } else {
    said.push(
      `EasyEquities ${market}, cost profile relu le ${SCHEDULE.readOn} (inchangé depuis le ${SCHEDULE.previouslyRead})`
    );
    said.push(
      buy?.floored
        ? `le plancher mord : ${Number(buy.raw.toPrecision(3))} ${rule.minCcy} calculés, ${rule.min} ${rule.minCcy} facturés par sens`
        : `courtage ${(rule.comm * 100).toFixed(2)} %` +
          (rule.extra ? ` + extra ${(rule.extra * 100).toFixed(4)} %` : "") +
          ` par sens, TVA ${(VAT * 100).toFixed(0)} %`
    );
    if (rule.ipl) said.push(`IPL ${(rule.ipl * 100).toFixed(5)} % par sens, hors TVA`);
  }
  if (stamp?.pct) {
    said.push(
      `taxe à l'achat ${(100 * stamp.pct).toFixed(2)} % du montant` +
        (stamp.source === "taxMap" ? `, depuis taxMap.mjs` : ` (${stamp.source})`)
    );
  }
  if (american) {
    said.push(
      `vente américaine : SEC ${SEC_RATE} du montant et TAF FINRA ${TAF_PER_SHARE} $ la part (plafond ${TAF_CAP} $), ` +
        `pas le 0,00218 % / 0,0029 % du PDF US` +
        (tafUsd != null && n != null && TAF_PER_SHARE * n > TAF_CAP
          ? ` — le plafond mord : ${Number(tafUsd.toPrecision(4))} $`
          : "")
    );
  }
  if (marketBp != null) said.push(`carnet publié ${Number(marketBp.toPrecision(4))} bp, aller-retour`);
  else if (marketPerShare != null) said.push(`carnet Rule 605, ${marketPerShare} $ la part, moyenne 100–499 parts`);
  else {
    said.push(
      `aucun carnet : ${unsourced?.name || listing.exchange}, ${unsourced?.why || "pas de source"}. ` +
        `Le total est N/A faute de mesure, pas faute de frais`
    );
  }
  said.push(
    market === "crypto"
      ? `hors total : transferts internes EE ↔ EasyCrypto gratuits. Aucun aller-retour réel dans ce dépôt`
      : `hors total : EasyFX 0,50 % + TVA (virement entre wallets), Thrive 25 R / mois, ` +
        `avancé 0,35 %, récurrent 0,10 %, téléphone. Aucun aller-retour réel dans ce dépôt`
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
          vat: VAT,
          rules: Object.fromEntries(
            Object.entries(RULE).map(([k, v]) => [
              k,
              { ...v, sideInclVat: sidePct(v), roundTripInclVat: sidePct(v) * 2 },
            ])
          ),
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
      "usage : node easyequities_cost.mjs <ticker|ISIN|EQU.US.AAPL> [place] [devise] [--shares=n] [--price=p] [--amount=] [--json]\n" +
        "        node easyequities_cost.mjs --schedule\n" +
        "  ex.   node easyequities_cost.mjs AAPL NASDAQ USD --shares=1 --price=230\n" +
        "        node easyequities_cost.mjs VOD JSE ZAR --shares=10 --price=120\n" +
        "        node easyequities_cost.mjs BTC CRYPTO --amount=1000"
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

  const l = out.listing;
  if (!l) {
    console.log(out.why || "rien à dire");
    if (out.alternatives?.length) {
      console.log(`\nce qu'EasyEquities propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange || "—"}${l.mic ? ` (${l.mic})` : ""}, ${l.currency || "?"}${l.type ? `, ${l.type.toLowerCase()}` : ""}\n`
  );

  if (out.trade?.notional != null) {
    const t = out.trade;
    console.log(
      `${t.shares ? `${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ` : ""}` +
        `${t.notional.toFixed(2)} ${t.currency}` +
        (t.notionalUsd != null ? ` (${t.notionalUsd.toFixed(2)} $)` : "")
    );
    console.log();
  }

  console.log(`aller-retour     : ${out.usd == null ? `N/A${out.why ? ` — ${out.why}` : ""}` : `${out.usd} $`}`);
  console.log(`frais du courtier: ${out.brokerFees == null ? "N/A" : `${out.brokerFees} $`}`);
  if (out.parts) {
    for (const [name, v] of Object.entries(out.parts)) {
      if (v != null) console.log(`  ${name.padEnd(15)}: ${v} $`);
    }
  }
  console.log();
  if (out.basis) console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);
  if (out.remark) for (const r of out.remark.split("\n")) console.log(`  · ${r}`);
  if (out.url) console.log(`\n${out.url}`);
}
