// What one round trip costs at Vested: buy n shares at price p, sell them
// back at once (online, regular hours, market), in dollars.
//
// The affine triple hid the $35 cap. 0.25 % of $20 000 is $50, and the
// ticket stops at $35; two legs can therefore be $70, not $100.
// `roundTrip` is given the size and charges what is charged.
//
// VF Securities, Inc. (US, CRD 315194), clearing at DriveWealth. India
// pricing page and the fees article re-read 2026-09-18. Two printed
// grids. Default is Basic (`--plan=basic`). `--plan=premium` is
// ₹4,500 / year. NRI prints the same brokerage ($4.99 / month Premium)
// and is not a third plan. The catalogue is `vested_scraping.mjs` — US
// listed plus OTC, all USD. Until that file has been run, this one
// answers that the book is missing. Vests (0.6–1 % AUM) and
// AlphaScreener are other products.
//
//   Basic, listed stocks / ETFs     0.25 %, max $35 a side
//   Premium, listed stocks / ETFs   0.15 %, max $35 a side
//   Basic, OTC / crypto ETF         0.50 % a side (no cap printed)
//   Premium, OTC / crypto ETF       0.25 % a side (no cap printed)
//
// Crypto ETFs share the OTC ticket on the help page. The catalogue does
// not keep `commissionGroup`, so a listed fund is treated as one when
// its name is a coin product (bitcoin, ether, solana, …) and not an
// "industry" / "adopters" equity basket.
//
// SEC 0.00206 % of the sale. TAF $0.000195 / $9.79. CAT is not named.
// Stamp / FTT from taxMap by ISIN. Cash is USD and every listing is
// USD, so FX stays out — LRS conversion is a funding cost with no
// printed %.
//
// Tickets already in the number stay out of the remark. Withdrawals
// ($3 under $100 INR, $5 USD; Premium's first two USD withdrawals free),
// TCS on LRS and the Premium year stay in the remark when they apply.
// Extended hours print the same commission and are this trip's rate,
// not a second book.
//
//   https://vestedfinance.com/in/pricing/
//   https://support.vestedfinance.com/portal/en/kb/vested-us-stocks/commission-and-fees-trading-withdrawal-forex/fees-charged-by-vested
//   https://support.vestedfinance.com/portal/en/kb/vested-us-stocks/features-offered/otc-securities-investing
//
//   node vested/vested_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node vested/vested_cost.mjs AAPL NASDAQ USD --shares=100 --price=230 --plan=premium
//   node vested/vested_cost.mjs BTC AMEX USD --shares=10 --price=40
//   node vested/vested_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("vested-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://vestedfinance.com/in/pricing/",
  fees: "https://support.vestedfinance.com/portal/en/kb/vested-us-stocks/commission-and-fees-trading-withdrawal-forex/fees-charged-by-vested",
  otc: "https://support.vestedfinance.com/portal/en/kb/vested-us-stocks/features-offered/otc-securities-investing",
  readOn: "2026-09-18",
  entity: "VF Securities, Inc.",
  crd: "315194",
  clearing: "DriveWealth",
};

const DEFAULT_PLAN = "basic";
const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const LISTED_CAP = 35;
const PREMIUM_YEAR = 4500;
const WITHDRAW_INR_SMALL = 3;
const WITHDRAW_USD = 5;

const PLANS = {
  basic: { id: "basic", name: "Vested Basic", listed: 0.0025, otc: 0.005, cap: LISTED_CAP },
  premium: { id: "premium", name: "Vested Premium", listed: 0.0015, otc: 0.0025, cap: LISTED_CAP },
};

const PLAN_ALIAS = {
  basic: "basic",
  free: "basic",
  standard: "basic",
  premium: "premium",
  plus: "premium",
  paid: "premium",
};

const LISTED_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS", "IEXG"]);
const LISTED_CODES = /^(NASDAQ|NYSE|AMEX|ARCA|NYSEARCA|BATS|BZX|CBOE|IEX)$/;
const CRYPTO_NAME = /\b(bitcoin|btc|ether|ethereum|solana|xrp|dogecoin|doge|litecoin|crypto)\b/i;
const CRYPTO_EQUITY = /\b(industry|adopters|companies|miners?)\b/i;
const ADR_NAMED = /\bADRs?\b|american deposit|depositary receipt/i;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const isOverTheCounter = (row) => /^(OTC|PINK|GREY|OTCBB|OTCQX|OTCQB)$/i.test(String(row?.exchange || ""));
const isCryptoEtf = (row) =>
  /^(ETF|ETN|ETC)$/i.test(String(row?.type || "")) &&
  CRYPTO_NAME.test(String(row?.name || "")) &&
  !CRYPTO_EQUITY.test(String(row?.name || ""));

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
};

const fxNote = (currency) => ({ quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(currency) });

export function planOf(name = DEFAULT_PLAN) {
  const key = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return PLANS[PLAN_ALIAS[key] || key] || null;
}

export function feeMarketOf(row, mic) {
  if (isOverTheCounter(row) || code(row?.exchange) === "OTC") return "otc";
  if (isCryptoEtf(row)) return "crypto_etf";
  const m = code(mic);
  const raw = code(row?.exchange);
  if (LISTED_MICS.has(m) || LISTED_CODES.test(raw)) return "listed";
  return null;
}

export function commissionEach({ market, plan, notional }) {
  const picked = typeof plan === "string" ? planOf(plan) : plan;
  const amt = Number(notional);
  if (!picked || !(amt > 0)) return null;
  if (market === "otc" || market === "crypto_etf") return amt * picked.otc;
  if (market === "listed") return Math.min(amt * picked.listed, picked.cap);
  return null;
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const resolved = place ? resolveVenue({ exchange: place, mic: place }) : {};
  const wantVenue = resolved.venue || null;
  const wantPlace = loose(place);
  const wantCurrency = code(currency);

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
    .filter((m) => !wantCurrency || code(m.row.currency || "USD") === wantCurrency);

  return { named, matches };
}

const listAlternatives = (named) =>
  named
    .map((r) => `${r.ticker || r.isin} ${r.currency || "USD"} @ ${r.exchange || "place non dite"}`)
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

function remarkOf({ plan, adr }) {
  const lines = [];
  if (plan?.id === "premium") lines.push(`₹${PREMIUM_YEAR.toLocaleString("en-IN")}/year.`);
  if (adr) lines.push("ADR pass-through billed as incurred.");
  return lines.join("\n");
}

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `usd` is the number the page prints; `brokerFees` is Vested's
 * commission, twice.
 */
export function roundTrip({
  etf,
  place,
  currency,
  shares,
  price,
  bp = null,
  perShare = null,
  plan = DEFAULT_PLAN,
}) {
  const picked = planOf(plan);
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    plan: picked?.id ?? plan,
    onlineBuy: true,
    cashCurrency: "USD",
  };

  if (!picked) return { ...answer, why: `formule inconnue : ${plan} (basic|premium)` };
  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue Vested n'existe pas encore : lancer `node vested/vested_scraping.mjs`",
    };
  }

  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Vested` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Vested`,
      alternatives: listAlternatives(named),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency || "USD",
    unsourced: m.unsourced,
    broker: "vested",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency) || "USD",
    brokerExchange: m.row.exchange || null,
    otc: isOverTheCounter(m.row),
    cryptoEtf: isCryptoEtf(m.row),
    adr: ADR_NAMED.test(String(m.row.name || "")),
  };

  const market = feeMarketOf(m.row, listing.mic);
  if (!market) {
    return {
      ...answer,
      listing,
      why: `${listing.brokerExchange || listing.exchange} n'a pas de palier publié chez Vested`,
    };
  }

  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const tax = taxesOf(listing.isin);
  const rates = taxRates(tax);
  const taxTotal = Object.values(rates).reduce((s, r) => s + r, 0);

  const shared = {
    ...answer,
    listing,
    feeMarket: market,
    cashCurrency: "USD",
    remark: remarkOf({ plan: picked, adr: listing.adr }),
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    basis: `barème ${picked.name}, palier ${market}, relu le ${SCHEDULE.readOn}`,
    tax,
    ccy: QUOTE,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    withdraw: { inrBelow100: WITHDRAW_INR_SMALL, usd: WITHDRAW_USD, ccy: "USD" },
  };

  const n = Number(shares);
  const p = Number(price);
  const notional = n > 0 && p > 0 ? n * p : null;
  const each = commissionEach({ market, plan: picked, notional });

  shared.commission = {
    rate: market === "listed" ? picked.listed : picked.otc,
    cap: market === "listed" ? picked.cap : null,
    each,
    currency: "USD",
    eachWay: true,
    plan: picked.id,
  };

  if (notional == null) {
    return {
      ...shared,
      why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node prices.mjs",
      confidence: confidenceOf({
        picked,
        market,
        listing,
        leaf,
        marketBp,
        marketPerShare,
        unsourced: m.unsourced,
        taxTotal,
      }),
    };
  }

  const notionalUsd = dollars(notional, listing.currency);
  const commissionUsd = each == null ? null : dollars(each * 2, "USD");
  const bookUsd =
    marketPerShare != null
      ? marketPerShare * n
      : marketBp != null && notionalUsd != null
        ? (notionalUsd * marketBp) / 1e4
        : null;
  const secUsd = notionalUsd == null ? null : notionalUsd * SEC_RATE;
  const tafUsd = n > 0 ? Math.min(n * TAF_PER_SHARE, TAF_CAP) : 0;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, commissionUsd, secUsd, tafUsd, taxUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(commissionUsd, 6),
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
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: listing.currency,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      réglementaire: finite(plus(secUsd, tafUsd), 6),
      taxes: finite(taxUsd, 6),
    },
    sell: { sec: finite(secUsd, 6), taf: finite(tafUsd, 6), tafCapped: tafUsd >= TAF_CAP },
    confidence: confidenceOf({
      picked,
      market,
      listing,
      leaf,
      marketBp,
      marketPerShare,
      unsourced: m.unsourced,
      taxTotal,
      each,
      notionalUsd,
    }),
  };
}

function confidenceOf({
  picked,
  market,
  listing,
  leaf,
  marketBp,
  marketPerShare,
  unsourced,
  taxTotal,
  each,
  notionalUsd,
}) {
  const said = [];
  said.push(
    `barème ${picked.name} ${market}, relu le ${SCHEDULE.readOn} : ` +
      (market === "listed"
        ? `${(picked.listed * 100).toFixed(2)} % par jambe, plafond ${picked.cap} $`
        : `${(picked.otc * 100).toFixed(2)} % par jambe, pas de plafond imprimé`)
  );
  if (market === "listed" && each != null && each === picked.cap) {
    said.push(`le plafond ${picked.cap} $ mord`);
  }
  if (market === "crypto_etf") {
    said.push(
      `ETF crypto : même ticket que l'OTC sur la page d'aide, lu sur le nom (${listing.ticker || listing.isin})`
    );
  }
  if (taxTotal) said.push(`taxe à l'achat ${(100 * taxTotal).toFixed(2)} % du montant, depuis taxMap.mjs`);
  said.push(
    `SEC ${SEC_RATE} du montant et TAF ${TAF_PER_SHARE} $/part à la vente, plafonnée à ${TAF_CAP} $ ; CAT n'est pas nommé`
  );
  if (marketBp != null) said.push(`carnet ${Number(marketBp.toPrecision(4))} bp`);
  else if (marketPerShare != null) said.push(`carnet Rule 605, ${marketPerShare} $ la part`);
  else {
    said.push(
      `pas de feuille de carnet : ${unsourced?.name || listing.exchange}, ${
        unsourced?.why || "pas de source"
      }`
    );
  }
  said.push(
    `compte en dollars, change LRS hors du trajet (aucun % imprimé). ` +
      `Retrait INR < 100 $ : ${WITHDRAW_INR_SMALL} $, USD : ${WITHDRAW_USD} $. ` +
      `Aucun aller-retour réel dans ce dépôt`
  );
  if (!leaf) said.push(`carnet absent pour cette ligne`);
  if (notionalUsd != null && market === "listed") {
    const raw = notionalUsd * picked.listed;
    if (raw > picked.cap) said.push(`sans plafond le ticket serait ${Number(raw.toPrecision(4))} $ par jambe`);
  }
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
          defaultPlan: DEFAULT_PLAN,
          plans: PLANS,
          listedCap: LISTED_CAP,
          sec: SEC_RATE,
          taf: { perShare: TAF_PER_SHARE, cap: TAF_CAP },
          cash: "USD",
          withdraw: { inrBelow100: WITHDRAW_INR_SMALL, usd: WITHDRAW_USD },
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
      "usage : node vested/vested_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--plan=basic|premium] [--json]\n" +
        "        node vested/vested_cost.mjs --schedule\n" +
        "  ex.   node vested/vested_cost.mjs AAPL NASDAQ USD --shares=10 --price=230\n" +
        "        node vested/vested_cost.mjs AAPL NASDAQ USD --shares=100 --price=230 --plan=premium\n" +
        "        node vested/vested_cost.mjs BTC AMEX USD --shares=10 --price=40"
    );
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
    plan: flag("plan") || DEFAULT_PLAN,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const show = (x) => (x == null ? "N/A" : x);
  const l = out.listing;
  if (!l) {
    console.log(out.why || "rien à dire");
    if (out.alternatives?.length) {
      console.log(`\nce que Vested propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}` +
      `  [${out.plan}]\n`
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
    const p = out.parts || {};
    if (p.marché != null) console.log(`  carnet         : ${p.marché} $`);
    if (p.courtage != null) console.log(`  courtage       : ${p.courtage} $`);
    if (p.réglementaire) console.log(`  réglementaire  : ${p.réglementaire} $`);
    if (p.taxes) console.log(`  taxes          : ${p.taxes} $`);
    console.log("");
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}\n`);
  }

  if (out.basis) console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);
  if (out.remark) for (const r of out.remark.split("\n")) console.log(`  · ${r}`);
  if (out.url) console.log(`\n${out.url}`);
}
