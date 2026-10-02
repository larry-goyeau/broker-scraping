// What one round trip costs at Zesty: buy n shares at price p, or put a
// number of dollars into a coin, and sell straight back. The answer is one
// number in dollars. `brokerFees` is what Zesty keeps.
//
// Re-read 2026-10-01. The fee article was updated 2026-07-22.
//
//   Chile     0.15% + VAT a side. The page says IVA and does not reprint
//             the rate. Chilean VAT is 19%.
//   US        0.30% a side. No fixed fee.
//   Crypto    0.40% a side. No fixed fee.
//
// US shares are operated and custodied by Alpaca Securities, so the US
// book is Alpaca's Rule 606 and the regulators Zesty passes through are
// Alpaca's: FINRA CAT on the sale, FINRA TAF on the shares sold, SEC on
// the sale. Zesty names those three and prints no rate. Each is rounded
// up to the next cent, which is why a small sale shows one to three cents.
// The peso-dollar spread is a conversion, not this trip: dollars can sit
// on the account.
//
// Santiago and the coins have no book here, so the total stays unknown
// and the commission is the fee column.
//
//   https://help.zestyfinance.com/es/articles/9227889-que-comisiones-se-cobran-en-zesty
//   https://help.zestyfinance.com/es/articles/15937647-que-son-los-gastos-de-gestion-que-aparecen-en-mi-actividad
//   https://files.alpaca.markets/disclosures/library/BrokFeeSched.pdf
//
//   node brokers/zesty/zesty_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/zesty/zesty_cost.mjs SQM-B BCS CLP --shares=10 --price=20000
//   node brokers/zesty/zesty_cost.mjs BTC CRYPTO USD --amount=1000
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("zesty-parsed.json", import.meta.url);
const SPREADS = new URL("../../spreads/spread.json", import.meta.url);

const SCHEDULE = {
  fees: "https://help.zestyfinance.com/es/articles/9227889-que-comisiones-se-cobran-en-zesty",
  regulators: "https://help.zestyfinance.com/es/articles/15937647-que-son-los-gastos-de-gestion-que-aparecen-en-mi-actividad",
  alpaca: "https://files.alpaca.markets/disclosures/library/BrokFeeSched.pdf",
  readOn: "2026-10-01",
  feesAsOf: "2026-07-22",
  alpacaAsOf: "2026-09-01",
  usEntity: "Alpaca Securities LLC",
  chileEntity: "Vector Capital",
};

const US = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS", "OTCM"]);

const CHILE = 0.0015;
const IVA = 0.19;
const US_COMMISSION = 0.003;
const CRYPTO = 0.004;

// Alpaca's card. Zesty passes them through and does not print a rate.
const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const CAT_PER_SHARE = 0.000003;
const CAT_OTC_EQUIV = 0.01;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const isCrypto = (row) => row?.type === "CRYPTO" || loose(row?.exchange) === "CRYPTO";
const ceilCent = (x) => (x > 0 ? Math.ceil(x * 100 - 1e-9) / 100 : 0);

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantPlace = loose(place);
  const wantCurrency = loose(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const coins = named.filter(isCrypto);
  if (coins.length && (!wantPlace || wantPlace === "CRYPTO")) {
    const pool = wantCurrency ? coins.filter((r) => loose(r.currency) === wantCurrency) : coins;
    const picked = pool.length ? pool : coins;
    return { named, matches: picked.map((r) => ({ row: r, ...listingKey(r) })) };
  }
  const equities = named.filter((r) => !isCrypto(r));
  const want = place ? listingKey({ exchange: place, mic: place }) : {};
  const matches = equities
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (want.venue && m.venue) return m.venue.mic === want.venue.mic;
      return loose(m.row.exchange) === wantPlace;
    })
    .filter((m) => !wantCurrency || loose(m.row.currency) === wantCurrency);
  return { named, matches };
}

/**
 * The whole bill for buying `shares` at `price`, or putting `amount` dollars
 * into a coin, and selling straight back. `usd` is what the page prints.
 * `brokerFees` is Zesty's commission.
 */
export function roundTrip({ etf, place, currency, shares, price, amount }) {
  const answer = { usd: null, brokerFees: null, etf, place, currency, onlineBuy: true, cashCurrency: "USD" };
  if (!catalogue) {
    return { ...answer, why: "the Zesty catalogue is not written yet: run `node brokers/zesty/zesty_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} is not in the Zesty catalogue` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} is not listed on that venue in that currency at Zesty`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const crypto = isCrypto(m.row);
  const mic = m.venue?.mic ?? (US.has(loose(m.row.exchange)) ? loose(m.row.exchange) : null);
  const us = !crypto && US.has(mic || loose(m.row.exchange));
  const book = us
    ? spreadLeaf(spreads, {
        isin: m.row.isin,
        mic,
        currency: m.row.currency || "USD",
        unsourced: m.unsourced,
        broker: "zesty",
        ticker: m.row.ticker,
      })
    : { leaf: null, mic: null };
  const listing = {
    isin: String(m.row.isin || "").toUpperCase() || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: crypto ? null : book.mic ?? mic,
    exchange: crypto ? "Crypto" : m.venue?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || (us ? "USD" : "CLP")).toUpperCase(),
    brokerExchange: m.row.exchange || null,
  };
  const leaf = book.leaf;
  const marketBp = us ? leaf?.bp ?? null : null;
  const marketPerShare = us ? leaf?.perShare ?? null : null;
  const otc = mic === "OTCM" || loose(m.row.exchange) === "OTCM";

  const shared = {
    ...answer,
    listing,
    bp: marketBp,
    perShare: marketPerShare,
    cashCurrency: crypto || us ? "USD" : "CLP",
    url: crypto || !us ? SCHEDULE.fees : SCHEDULE.regulators,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
  };

  const n = Number(shares);
  const p = Number(price);
  const a = Number(amount);
  if (crypto ? !(a > 0) && !(n > 0 && p > 0) : !(n > 0 && p > 0)) {
    return {
      ...shared,
      why: crypto
        ? "no amount for this coin"
        : !(n > 0)
          ? "no share count"
          : "no price for this line: run node assets/prices.mjs",
    };
  }

  const notional = crypto && a > 0 ? a : n * p;
  const notionalUsd = crypto && a > 0 ? a : toUsd(notional, listing.currency);
  const rate = crypto ? CRYPTO : us ? US_COMMISSION : CHILE * (1 + IVA);
  const brokerFees = notionalUsd == null ? null : notionalUsd * rate * 2;

  let sec = 0;
  let taf = 0;
  let cat = 0;
  if (us && notionalUsd != null) {
    sec = ceilCent(notionalUsd * SEC_RATE);
    taf = ceilCent(Math.min(n * TAF_PER_SHARE, TAF_CAP));
    cat = ceilCent(n * CAT_PER_SHARE * (otc ? CAT_OTC_EQUIV : 1));
  }
  const bookUsd =
    notionalUsd == null
      ? null
      : marketBp != null
        ? (notionalUsd * marketBp) / 1e4
        : marketPerShare != null
          ? marketPerShare * n
          : null;
  const usd = us ? plus(bookUsd, brokerFees, sec, taf, cat) : null;

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(usd == null
      ? {
          why: us
            ? `no book for ${m.unsourced?.name || listing.exchange}: ${m.unsourced?.why || "no 605 leaf"}`
            : undefined,
        }
      : {}),
    trade: {
      shares: crypto && a > 0 ? null : n,
      price: crypto && a > 0 ? null : p,
      amount: crypto && a > 0 ? a : null,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: crypto && a > 0 ? "USD" : listing.currency,
    },
    buy: { commission: finite(brokerFees == null ? null : brokerFees / 2, 6) },
    sell: {
      commission: finite(brokerFees == null ? null : brokerFees / 2, 6),
      ...(us ? { sec, taf, cat } : {}),
    },
    parts: {
      market: finite(bookUsd, 6),
      commission: finite(brokerFees, 6),
      regulatory: us ? finite(plus(sec, taf, cat), 6) : 0,
    },
    basis: us
      ? `Zesty ${US_COMMISSION * 100}% a side, re-read ${SCHEDULE.readOn}; FINRA and SEC passed through at Alpaca's rates of ${SCHEDULE.alpacaAsOf}`
      : crypto
        ? `Zesty crypto ${CRYPTO * 100}% a side, re-read ${SCHEDULE.readOn}`
        : `Zesty Chile ${CHILE * 100}% + VAT ${IVA * 100}% a side, re-read ${SCHEDULE.readOn}`,
    confidence: us
      ? "commission 0.30% a side; CAT, TAF and SEC on the sale, each rounded up to the next cent; Alpaca 606 on the US book"
      : "no book; commission only",
  };
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
          chile: { rate: CHILE, vat: IVA },
          us: { rate: US_COMMISSION, sec: SEC_RATE, tafPerShare: TAF_PER_SHARE, tafCap: TAF_CAP, catPerShare: CAT_PER_SHARE },
          crypto: { rate: CRYPTO },
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
      "usage: node brokers/zesty/zesty_cost.mjs <ticker|ISIN> [venue] [currency] [--shares=n] [--price=p] [--amount=usd]"
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
  });
  if (!out.listing) {
    console.log(out.why || "nothing to say");
    if (out.alternatives?.length) console.log(out.alternatives.join("\n"));
    process.exit(0);
  }
  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange || "—"}, ${l.currency}${l.type ? `, ${l.type}` : ""}\n`);
  console.log(`round trip : ${out.usd == null ? `N/A — ${out.why || ""}` : `${out.usd} $`}`);
  console.log(`broker fees: ${out.brokerFees == null ? "N/A" : `${out.brokerFees} $`}`);
  if (out.parts) {
    for (const [name, v] of Object.entries(out.parts)) {
      if (v != null) console.log(`  ${name.padEnd(12)}: ${v} $`);
    }
  }
  if (out.basis) console.log(`\n  ${out.basis}`);
  if (out.confidence) console.log(`  ${out.confidence}`);
}
