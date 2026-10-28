// What one round trip costs at UniCredit Bank Hungary: buy n shares (or ETF /
// ETC units) on the Budapest Stock Exchange (BÉT, including the BETa foreign
// lines) in eBanking or the mBanking app and sell them back, in dollars. 116
// lines trade in forint, 4 shares in euro.
//
// https://www.unicreditbank.hu/content/dam/cee2020-pws-hu/Maganszemelyek/Megtakaritasok/2026/202610/Lakossagi%20KL_Ertekpapir_forgalom_Teljesitesi_Rend_260930_261001.pdf
// "Lakossági kondíciós lista – értékpapír forgalom és teljesítési rend", in
// force from 2026-10-01 (published 2026-09-30), read on 2026-10-26. Page 1,
// "Megbízási díjak a másodlagos forgalomban (az ügylet teljesítési értéke
// alapján)", each buy and each sell:
//   "Budapesti Értéktőzsdére (BÉT) bevezetett értékpapírok esetében (kivéve
//    certifikátok) 1% min. HUF 3.000"
//   "Budapesti Értéktőzsdére (BÉT) bevezetett, EUR-ban denominált részvények
//    esetében 1% min. EUR 8"
// One price for every channel: the list names no separate eBanking, mBanking,
// Telefonbank or branch rate, so the online order pays the same. No exchange,
// clearing or third-party line is printed for BÉT orders; "Értékpapírszámla-
// vezetés Ingyenes" (the securities account itself is free).
// Custody ("Értékpapír letéti díj"): dematerialised securities up to EUR
// 100,000 "0,26% / év min. HUF 941,- / negyedév", 0.1% above, on the
// quarter-end market value. That is the remark.
//
// Cash: the securities account is tied to the client's HUF, EUR and USD
// current accounts, one per currency, and orders settle from them:
//   https://www.unicreditbank.hu/hu/maganszemelyek/napi_penzugyek/elektronikus_bankolas/mbanking_ertekpapirszamlanyitas.html
//   "Az mBanking szolgáltatásban felsorolt folyószámlák (HUF, EUR, USD) közül
//    meg kell jelölni ... amelyeket az értékpapírszámlához kíván kapcsolni"
// Every line trades in HUF or EUR, so nothing is converted in the number.
// Converting uses the bank's "devizaárfolyam" for individuals (the
// CashPurchaseRate / CashSaleRate columns of its rate service, as the
// exchange_rate.html page shows them): on 2026-10-22 EUR 354.67 / 376.13 Ft
// around a 365.40 middle rate, 2.94% each way. That is the FX remark.
//   https://www.unicreditbank.hu/hu/maganszemelyek/exchange_rate.html
//
// Left out: auction orders (0.3%, 10 million Ft minimum), transfers, physical
// delivery, stop-limit orders (Telefonbank only); certificates and non-HUF
// lines other than EUR shares (the bank takes no orders on them, already out
// of the catalogue).
//
//   node brokers/unicredithungary/unicredithungary_cost.mjs OTP XBUD HUF --shares=10 --price=32000
//   node brokers/unicredithungary/unicredithungary_cost.mjs GSPARK XBUD EUR --shares=100 --price=9.5
//   node brokers/unicredithungary/unicredithungary_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, listingCash, toUsd, usdPer } from "../../fx.mjs";
import { depositHas } from "../../deposits.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const FOLDER = "unicredithungary";
const CATALOGUE = new URL("unicredithungary-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.unicreditbank.hu/hu/maganszemelyek/napi_penzugyek/elektronikus_bankolas/mbanking_befektetes.html",
  tariff:
    "https://www.unicreditbank.hu/content/dam/cee2020-pws-hu/Maganszemelyek/Megtakaritasok/2026/202610/Lakossagi%20KL_Ertekpapir_forgalom_Teljesitesi_Rend_260930_261001.pdf",
  fx: "https://www.unicreditbank.hu/hu/maganszemelyek/exchange_rate.html",
  inForce: "2026-10-01",
  readOn: "2026-10-26",
  fxReadOn: "2026-10-22",
  entity: "UniCredit Bank Hungary Zrt., eBanking / mBanking",
};

const RATE = 0.01;
// Minimum per order in the listing's currency.
const MIN = { HUF: 3000, EUR: 8 };
// Cash accounts the securities account settles from (mBanking account-opening
// page); deposits.mjs has no entry for this folder yet.
const DEPOSITS = ["HUF", "EUR", "USD"];
// Bank deviza rate vs its middle rate, EUR, 2026-10-22: (376.12814 - 365.4) / 365.4.
const FX_PCT = 2.94;
const CUSTODY = "Custody is 0.26% a year.";
const FX_NOTE = (currency) => fxRemark(String(FX_PCT), currency);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};
const holds = (ccy) => DEPOSITS.includes(ccy) || depositHas(FOLDER, null, ccy);

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
      if (loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return false;
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
    cashCurrency: "HUF",
    url: SCHEDULE.url,
    remark: CUSTODY,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue UniCredit Hongrie n'existe pas encore : lancer `node brokers/unicredithungary/unicredithungary_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue UniCredit Hongrie` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez UniCredit Hongrie`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
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
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const cash = listingCash(listing.currency);
  const held = holds(cash);
  const min = MIN[cash] ?? null;
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? (marketBp != null ? null : book.leaf?.perShare ?? null);
  const tax = taxesOf(listing.isin);
  const taxPct = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const shared = {
    ...answer,
    listing,
    cashCurrency: held ? cash : "HUF",
    remark: [CUSTODY, FX_NOTE(listing.currency)].join(" "),
    bp: marketBp,
    perShare: marketPerShare,
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: FX_PCT / 100,
    basis:
      `Kondíciós lista (értékpapír forgalom) du ${SCHEDULE.inForce}, relue le ${SCHEDULE.readOn} : ` +
      `BÉT 1 %, minimum 3 000 Ft (actions en euro : 1 %, minimum 8 €), à l'achat et à la vente, ` +
      `même tarif en ligne et en agence ; aucun frais de bourse ni de tiers imprimé`,
  };
  if (!held || min == null) {
    return { ...shared, why: `UniCredit Hongrie ne prend pas d'ordre BÉT en ${cash} : aucun tarif publié pour cette ligne` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const side = Math.max(notional * RATE, min);
  const floorBites = notional * RATE < min;
  const brokerFees = dollars(side * 2, listing.currency);
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxPct;
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const confidence = [
    shared.basis,
    floorBites
      ? `le minimum de ${min} ${cash} mord : ${(notional * RATE).toFixed(2)} ${cash} calculés`
      : `${(RATE * 100).toFixed(2)} % de ${notional.toFixed(2)} ${listing.currency} = ${side.toFixed(2)} par sens`,
    `ligne en ${cash}, devise de dépôt (comptes HUF, EUR, USD liés au compte-titres) : pas de change ; ` +
      `sinon cours devise de la banque, ${FX_PCT} % de l'écart au cours moyen (relevé le ${SCHEDULE.fxReadOn})`,
    "garde 0,26 % / an (min. 941 Ft par trimestre, 0,1 % au-delà de 100 000 €) en remarque",
    marketBp != null
      ? `carnet ${marketBp} bp (table MiFID II pré-négociation de la BÉT)`
      : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${listing.ticker} sur ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet pour cette ligne"}` }
      : {}),
    commission: { rate: RATE, min, minCurrency: cash, eachWay: true, currency: listing.currency },
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      taxes: finite(taxUsd, 6),
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
    console.log(JSON.stringify({ ...SCHEDULE, rate: RATE, min: MIN, deposits: DEPOSITS, fxPct: FX_PCT }, null, 2));
    return;
  }
  const [etf, place, currency] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (!etf) {
    console.error("usage : node brokers/unicredithungary/unicredithungary_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
    process.exit(2);
  }
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    bp: flag("bp") ? Number(flag("bp")) : null,
  });
  console.log(JSON.stringify(out, null, 2));
}

printCli();
