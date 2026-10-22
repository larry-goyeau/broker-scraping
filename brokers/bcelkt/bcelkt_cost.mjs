// What one round trip costs at BCEL-KT Securities: buy n shares on the
// Lao Securities Exchange and sell them straight back, in dollars. The
// online path is the Home Trading System (HTS), which the trading page
// names next to the counter, the phone and e-mail. LSX shares are quoted
// in kip and the account holds kip (deposits.mjs), so nothing is
// converted.
//
// https://www.bcel-kt.com/index.php?id=11&r=site%2Fdisplay
// read on 2026-10-21. The trading page prints two fee tables:
//   Normal trading       0.34 % buy, 0.34 % sell. Counter, phone and
//                        e-mail orders. Not online, so it stays out.
//   Through HTS          0.306 % buy, 0.306 % sell. This is the rate used.
//   Trading unit         100 shares. A quantity, not a charge.
// No minimum fee is printed. Neither the broker nor the exchange's trade
// procedure (http://lsx.com.la/en/product/stock-trding/basic-trade-procedure)
// prints an exchange, clearing or regulator levy on top, so none is added.
// No transaction tax is listed for Lao shares in taxes.mjs.
//
// In the total: the LSX book crossed and 0.306 % each side. Remark: none.
// The LSX book is not stored and fx.mjs has no kip rate, so the total
// stays unknown until both are.
//
//   node brokers/bcelkt/bcelkt_cost.mjs BCEL XLAO LAK --shares=100 --price=3890
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { depositHas } from "../../deposits.mjs";

const CATALOGUE = new URL("bcelkt-parsed.json", import.meta.url);
const PAGE = "https://www.bcel-kt.com/index.php?id=11&r=site%2Fdisplay";
const READ_ON = "2026-10-21";
const RATE = 0.00306;
const LOT = 100;
const BASE = "LAK";
const REMARK = "";

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
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
      return loose(m.row.exchange) === wantPlace;
    })
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
    cashCurrency: BASE,
    url: PAGE,
    remark: REMARK,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue BCEL-KT n'existe pas encore : lancer `node brokers/bcelkt/bcelkt_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue BCEL-KT` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez BCEL-KT`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "bcelkt",
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
  const cash = depositHas("bcelkt", null, listing.currency) ? listing.currency : BASE;
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const shared = {
    ...answer,
    cashCurrency: cash,
    remark: [REMARK, m.row.remark].filter(Boolean).join(" "),
    listing,
    basis:
      `page de négociation BCEL-KT relue le ${READ_ON}. ` +
      `Ordre en ligne par le Home Trading System : 0,306 % du montant, à l'achat et à la vente, aucun minimum publié ; aucun autre frais par ordre publié.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    bp: marketBp,
    perShare: marketPerShare,
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const commissionLocal = notional * RATE * 2;
  const brokerFees = dollars(commissionLocal, listing.currency);
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
  const why =
    usd != null
      ? null
      : notionalUsd == null
        ? `aucun cours en dollars pour ${listing.currency} dans fx.mjs`
        : `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`;
  const confidence = [
    shared.basis,
    "aucune redevance du LSX ni de la LSC publiée par le courtier ou la bourse",
    `ligne ${listing.currency}, payée en ${cash} : aucun change`,
    `quotité de ${LOT} titres${n % LOT ? ` : ${n} titres n'en est pas un multiple` : ""}`,
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} pb`
      : marketPerShare != null
        ? `carnet ${marketPerShare} ${listing.currency} par titre`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(why ? { why } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { buy: RATE, sell: RATE, minimum: 0, lot: LOT, currency: listing.currency },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      taxes: 0,
      courtageLocal: finite(commissionLocal, 6),
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
  const arg = (flag, fallback) => {
    const hit = process.argv.find((item) => item.startsWith(`--${flag}=`));
    return hit ? hit.slice(flag.length + 3) : fallback;
  };
  const [etf, place, currency] = process.argv.slice(2).filter((item) => !item.startsWith("--"));
  console.log(JSON.stringify(roundTrip({ etf, place, currency, shares: Number(arg("shares", "10")), price: Number(arg("price", "0")) }), null, 2));
}

printCli();
