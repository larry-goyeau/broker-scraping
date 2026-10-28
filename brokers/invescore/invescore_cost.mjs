// What one round trip costs at InvesCore Capital (member broker of the
// Mongolian Stock Exchange): buy n shares on the MSE through the broker's
// online trading system (https://trade.icapital.mn/) and sell them straight
// back, in dollars. Every MSE line is quoted in tugriks and the client's
// cash sits in tugriks on the broker's nominal account (deposits.mjs), so
// nothing is converted.
//
// https://icapital.mn/help-us/%d1%82%d2%af%d0%b3%d1%8d%d1%8d%d0%bc%d1%8d%d0%bb-%d0%b0%d1%81%d1%83%d1%83%d0%bb%d1%82-%d1%85%d0%b0%d1%80%d0%b8%d1%83%d0%bb%d1%82?lang=en
// read on 2026-10-26 (FAQ):
//   "Do I have to pay a commission to enter the trade? There is a 1%
//   commission for trading." (Mongolian page: "Арилжаанд оролцоход 1%-ийн
//   шимтгэлтэй байдаг.")
//   "Commission is charged only when the order is executed, not when it is
//   placed."
// The 1% is taken on each executed order, buy and sell. No minimum, no
// separate exchange (MSE) or depository (MCSD) fee is printed, so the 1% is
// the whole trading charge. The terms of service
// (https://icapital.mn/1310?lang=en, 8.14.3) take "the fees listed in the
// general fee conditions" on each trade; that schedule is not on the site,
// the FAQ figure is the one published. Orders go online
// (https://icapital.mn/service/%d0%b1%d1%80%d0%be%d0%ba%d0%b5%d1%80?lang=en).
//
// In the total: the MSE book, 1% on both sides. No remark. Left out: the
// one-time account opening fee (amount not printed), bank charges on
// withdrawals; tax on dividends and gains is not a trading cost.
//
// The MSE book is not stored and fx.mjs has no MNT rate yet, so the total
// stays unknown until both exist.
//
//   node brokers/invescore/invescore_cost.mjs APU XULA MNT --shares=1000 --price=1000
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const BROKER = "InvesCore Capital";
const FOLDER = "invescore";
const CASH = "MNT";
const URL_FEES =
  "https://icapital.mn/help-us/%d1%82%d2%af%d0%b3%d1%8d%d1%8d%d0%bc%d1%8d%d0%bb-%d0%b0%d1%81%d1%83%d1%83%d0%bb%d1%82-%d1%85%d0%b0%d1%80%d0%b8%d1%83%d0%bb%d1%82?lang=en";
const READ_ON = "2026-10-26";
const RATE = 0.01;
const CATALOGUE = new URL("invescore-parsed.json", import.meta.url);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};
const frPct = (rate) => `${String(Math.round(rate * 100 * 10000) / 10000).replace(".", ",")} %`;

let rowsCache;
function loadRows() {
  if (rowsCache === undefined) {
    rowsCache = null;
    if (fs.existsSync(CATALOGUE)) {
      const catalogue = JSON.parse(fs.readFileSync(CATALOGUE, "utf8"));
      rowsCache = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
      if (rowsCache.length) warmListingIndex(rowsCache);
    }
  }
  return rowsCache;
}

function findListing(rows, { etf, place, currency }) {
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

export function roundTrip(query) {
  const { etf, place, currency, shares, price, bp = null, perShare = null } = query;
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: CASH,
    url: URL_FEES,
    remark: "",
  };
  const rows = loadRows();
  if (!rows) {
    return { ...answer, why: `le catalogue ${BROKER} n'existe pas encore : lancer \`node brokers/${FOLDER}/${FOLDER}_scraping.mjs\`` };
  }
  const { named, matches } = findListing(rows, { etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue ${BROKER}` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez ${BROKER}`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
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
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? m.row.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const shared = {
    ...answer,
    remark: [answer.remark, m.row.remark].filter(Boolean).join(" "),
    listing,
    basis:
      `ordre en ligne par trade.icapital.mn, FAQ ${BROKER} relue le ${READ_ON} : ` +
      `commission ${frPct(RATE)} sur chaque ordre exécuté, chaque sens ; aucun minimum ni frais de bourse ou de dépositaire publiés à part.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    bp: marketBp,
    perShare: marketPerShare,
  };
  if (listing.currency !== CASH) {
    return { ...shared, why: `${BROKER} ne publie un barème que pour la bourse de Mongolie en tugriks ; ${listing.currency} n'est pas couvert` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const perSide = notional * RATE;
  const commissionMnt = perSide * 2;
  const brokerFees = dollars(commissionMnt, listing.currency);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees);
  const why = [
    notionalUsd == null ? `aucun cours en dollars pour ${listing.currency} dans fx.mjs` : null,
    parts.a == null || parts.b == null
      ? `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`
      : null,
  ]
    .filter(Boolean)
    .join(" ; ");
  const confidence = [
    shared.basis,
    `${frPct(RATE)} de ${Math.round(notional)} MNT = ${Math.round(perSide)} MNT par sens`,
    "le 1 % est lu comme tout compris : la FAQ ne cite aucun autre frais de transaction",
    "frais d'ouverture de compte (une fois, montant non publié) non comptés",
    "impôt sur la plus-value non compté : aller-retour au même prix, aucun gain",
    "ligne MNT, compte en tugriks : aucun change",
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} pb`
      : marketPerShare != null
        ? `carnet ${marketPerShare} MNT par titre`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(why ? { why } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: {
      buy: finite(perSide, 8),
      sell: finite(perSide, 8),
      rate: RATE,
      currency: listing.currency,
      eachWay: true,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      taxes: 0,
      courtageMnt: finite(commissionMnt, 6),
    },
    confidence,
  };
}

export function printCli(callerUrl, fn) {
  let called = false;
  try {
    called = callerUrl === pathToFileURL(process.argv[1]).href;
  } catch {
    called = false;
  }
  if (!called) return;
  const arg = (flag, fallback) => {
    const hit = process.argv.find((item) => item.startsWith(`--${flag}=`));
    return hit ? hit.slice(flag.length + 3) : fallback;
  };
  const [etf, place, currency] = process.argv.slice(2).filter((item) => !item.startsWith("--"));
  console.log(JSON.stringify(fn({ etf, place, currency, shares: Number(arg("shares", "10")), price: Number(arg("price", "0")) }), null, 2));
}

printCli(import.meta.url, roundTrip);
