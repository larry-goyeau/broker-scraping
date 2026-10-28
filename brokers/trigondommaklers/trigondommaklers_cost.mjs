// What one round trip costs at Trigon Dom Maklerski: buy n shares at
// price p, sell them back, in dollars. The order goes through the internet
// (DoAkcji 2.0). The Call Center and branch columns are other channels and
// stay out.
//
// "Tabela prowizji i opłat za świadczenie usług maklerskich", in force
// from 1 May 2021, the one linked from the regulations page, read on
// 2026-10-26:
//   https://cdn.prod.website-files.com/665ef65b5b3c9f72b25a006f/67e132b4d34a31e7956eb628_tpio_20210501%20(1).pdf
//   https://www.trigon.pl/dom-maklerski/klient-indywidualny/regulacje
//
// Table I, line 1: shares, rights, certificates, "jednostek indeksowych
// ... oraz pozostałych papierów wartościowych innych niż obligacje". One
// line for every catalogue row (GPW main market, NewConnect, GlobalConnect,
// ETF/ETN/ETC, all in złoty). Internet column, by the client's turnover in
// the previous calendar quarter, "od wartości transakcji, nie mniej niż
// 6 zł":
//   up to 499,999.99 zł         0.39 %   <- this ticket (a new client)
//   500,000 - 2,999,999.99 zł   0.27 %
//   3,000,000 zł and more       0.23 %
// The table says its fees already include the GPW, KDPW and other
// intermediaries' charges, so nothing is added for them.
//
// Line 1.2, "Transakcje odwrotne akcjami i prawami do akcji" (day trading:
// the sale of shares bought in the same session): 0.19 % online. This
// ticket keeps the position, so it is the remark on a share, at this
// order's value, together with the turnover bands.
//
// Cash is złoty only (deposits to Erste Bank Polska PLN accounts) and
// every catalogue line is PLN: no FX. No stamp or transaction tax on a
// Polish line (taxMap).
//
// Left out: the account fee (60 zł a year with electronic communication,
// 90 zł without), custody (free up to 500,000 zł of holdings, else
// 0.0019 % a month), the DDM surcharge for an order left to the broker's
// discretion (up to 1 %, not an online order), block trades (negotiated),
// quote services (1 best offer free with one trade a month) and transfers.
// None is a fee on one online trade.
//
//   node brokers/trigondommaklers/trigondommaklers_cost.mjs PKO GPW PLN --shares=30 --price=60
//   node brokers/trigondommaklers/trigondommaklers_cost.mjs --schedule
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

const CATALOGUE = new URL("trigondommaklers-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://cdn.prod.website-files.com/665ef65b5b3c9f72b25a006f/67e132b4d34a31e7956eb628_tpio_20210501%20(1).pdf",
  page: "https://www.trigon.pl/dom-maklerski/klient-indywidualny/regulacje",
  readOn: "2026-10-26",
  tariffOn: "2021-05-01",
};

const RATE = 0.0039;
const MIN_PLN = 6;
const SAME_DAY_RATE = 0.0019;
const BANDS = [
  { from: "500,000 zł", rate: 0.0027 },
  { from: "3,000,000 zł", rate: 0.0023 },
];

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};
// How much lower `reduced` is than `base`, in percent of `base`: whole from
// 10 up, one decimal below.
const cutPct = (base, reduced) => {
  const x = (100 * (base - reduced)) / base;
  return x >= 10 ? Math.round(x) : Math.round(x * 10) / 10;
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
      return loose(m.row.exchange) === wantPlace || loose(m.row.exchange).includes(wantPlace);
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

const side = (notional, rate) => Math.max(notional * rate, MIN_PLN);

// Remark at this order's value: the same-day sale (shares only, line 1.2)
// and the turnover bands, each as the cut of one side's commission itself
// (0.39% → 0.19% is 51%; the minimum counts).
function remarkOf(type, notional) {
  const base = side(notional, RATE);
  const out = [];
  if (type === "STOCK" && notional > 0) {
    const cut = cutPct(base, side(notional, SAME_DAY_RATE));
    if (cut > 0) out.push(`Same day sell fees are ${cut}% lower.`);
  }
  const bands = notional > 0
    ? BANDS.map((b) => ({ ...b, cut: cutPct(base, side(notional, b.rate)) })).filter((b) => b.cut > 0)
    : BANDS.map((b) => ({ ...b, cut: cutPct(RATE, b.rate) }));
  if (bands.length) {
    out.push(
      bands
        .map((b, i) => (i === 0 ? `${b.from} or more traded the previous quarter: fees are ${b.cut}% lower` : `${b.from} or more: ${b.cut}% lower`))
        .join("; ") + "."
    );
  }
  return out.join(" ");
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
    cashCurrency: "PLN",
    url: SCHEDULE.url,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Trigon n'existe pas encore : lancer `node brokers/trigondommaklers/trigondommaklers_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Trigon` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Trigon`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "trigondommaklers",
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
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const shared = {
    ...answer,
    listing,
    remark: remarkOf(listing.type, 0),
    basis: `tabela du ${SCHEDULE.tariffOn}, relue le ${SCHEDULE.readOn}, internet : 0,39 % min 6 zł par ordre (premier palier de chiffre d'affaires)`,
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };
  if (listing.currency !== "PLN") {
    return { ...shared, why: `la tabela ne porte que des montants en złoty, pas de ligne en ${listing.currency}` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0) || !(p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (x) => dollars(x, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const one = dollars(side(notional, RATE), "PLN");
  const brokerFees = plus(one, one);
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const confidence = [
    shared.basis,
    "ordre internet, position gardée plus d'une séance, client sous 500 000 zł de chiffre d'affaires le trimestre précédent",
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? `carnet ${marketPerShare} $ la part`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    remark: remarkOf(listing.type, notional),
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    bp: marketBp,
    perShare: marketPerShare,
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { rate: RATE, min: MIN_PLN, currency: "PLN", eachWay: true, sameDaySellRate: listing.type === "STOCK" ? SAME_DAY_RATE : null },
    parts: { marché: finite(bookUsd, 6), courtage: finite(brokerFees, 6), taxes: finite(taxUsd, 6) },
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
  const arg = (flag, fallback) => {
    const hit = process.argv.find((item) => item.startsWith(`--${flag}=`));
    return hit ? hit.slice(flag.length + 3) : fallback;
  };
  if (process.argv.includes("--schedule")) {
    console.log(
      JSON.stringify(
        {
          ...SCHEDULE,
          poland: "0.39 % min 6 zł, internet, first turnover band",
          bands: "0.27 % from 500,000 zł, 0.23 % from 3,000,000 zł of previous-quarter turnover",
          sameDaySell: "0.19 % (shares and rights)",
          rule606: null,
        },
        null,
        2
      )
    );
    return;
  }
  const [etf, place, currency] = process.argv.slice(2).filter((item) => !item.startsWith("--"));
  console.log(
    JSON.stringify(
      roundTrip({ etf, place, currency, shares: Number(arg("shares", "10")), price: Number(arg("price", "0")) }),
      null,
      2
    )
  );
}

printCli();
