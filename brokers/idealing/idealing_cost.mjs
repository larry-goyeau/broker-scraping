// What one round trip costs at iDealing.com (London): buy n shares online
// and sell them straight back, in dollars. Every line in the catalogue is a
// London line, dealt online through the RSP gateway (off-book retail
// service providers). The cash accounts are sterling and euros
// (deposits.mjs).
//
// Read on 2026-10-19, "Services & Prices", effective 6 February 2026:
//   https://www.idealing.com/en/help/services_and_prices
//   "A basic commission charge of £4.99 per online trade for off-book LSE
//   listed securities." The per-instrument commission schedule
//   (https://www.idealing.com/commissionschedule, "View Schedule" on each
//   line) prints the same RSP_GATEWAY GBP 4.99 a trade on every sterling line
//   read, RSP_GATEWAY EUR 14.50 on the euro lines dealt on the London feed,
//   and RSP_GATEWAY USD 14.95 or 16.50 depending on the line. The direct
//   order-book route (LSE_ORDERBOOK, 0.05 % with a £4.99 floor plus £1.70 a
//   fill) is never cheaper and is not this trip.
//   Two tariffs for a Standard account, one row each (`plan`):
//     smartwealth  Tariff 1, Smart Wealth: no surcharge; custody £0.20 a
//                  security a month (the remark)
//     adminfree    Tariff 2, Admin Free: a per-trade surcharge on top of the
//                  commission, £2.00 (200 GBX), €3.00 or $3.80 by trade
//                  currency; no custody fee
//   Prices exclude VAT where applicable; dealing commission is VAT-exempt.
//
// Other charges in the total, each side: UK stamp (SDRT 0.5 %, Irish 1 %)
// from taxMap.mjs on the purchase; the PTM levy, £1.50 on a trade over
// £10,000 in a company incorporated in the UK, Channel Islands or Isle of
// Man (a share, not a fund or an exchange-traded product). "Trade Reporting
// charges ... where applicable" print no rate; an RSP, as systematic
// internaliser, reports its own trades, so none is added.
//
// FX: a buy needs cash in the trade currency ("in the relevant currency"),
// and only sterling and euros can be paid in. No conversion rate is
// printed, so a dollar line, which forces one, is N/A. A sterling or euro
// line is held without converting; cash in the other one needs a
// conversion, which is the remark. Currencies are "Cash" instruments: the
// commission schedule (https://www.idealing.com/commissionschedule, read
// 2026-10-19) prints one row for EUR and for USD, RSP_GATEWAY, 4.99 GBP an
// order, and none for GBP. No rate or spread is printed for either.
// A euro line on the "NONE" price feed (not the London feed) prints no euro
// commission on most schedules read and is N/A. A catalogue row that carries
// its own `rsp` commissions ({GBP, EUR, USD} a trade) is priced on those.
//
//   node brokers/idealing/idealing_cost.mjs HSBA XLON GBX --shares=100 --price=1100
//   node brokers/idealing/idealing_cost.mjs VUSA XLON GBP --shares=10 --price=100 --plan=adminfree
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, toUsd, usdPer, listingCash } from "../../fx.mjs";
import { taxesOf, taxRates, taxGap } from "../../taxMap.mjs";
import { depositHas } from "../../deposits.mjs";

// Buying euros is a £4.99 Cash trade at an unprinted rate; buying sterling
// has no printed charge at all.
const fxNote = (ccy) => (ccy === "EUR" ? `FX trade £4.99 + spread when cash ≠ EUR.` : fxRemark("", ccy));
const FOLDER = "idealing";
const CATALOGUE = new URL("idealing-parsed.json", import.meta.url);
const PAGE = "https://www.idealing.com/en/help/services_and_prices";
const SCHEDULE = "https://www.idealing.com/commissionschedule";
const READ_ON = "2026-10-19";
const BASE = "GBP";

// Commission a trade, by trade currency, through the RSP gateway.
const RSP = { GBP: 4.99, EUR: 14.5 };
const PTM = { levy: 1.5, above: 10000, countries: new Set(["GB", "JE", "GG", "IM"]) };

const PLANS = {
  smartwealth: { id: "smartwealth", label: "Smart Wealth", surcharge: { GBP: 0, EUR: 0, USD: 0 }, remark: "Custody is £0.20 a line a month." },
  adminfree: { id: "adminfree", label: "Admin Free", surcharge: { GBP: 2, EUR: 3, USD: 3.8 }, remark: "" },
};
const DEFAULT_PLAN = "smartwealth";

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

export function planOf(name = DEFAULT_PLAN) {
  const key = String(name || DEFAULT_PLAN).trim().toLowerCase().replace(/[^a-z]/g, "");
  return PLANS[key] || null;
}

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

// The price feed the instrument master names: "LSE" (or "IDEAL") is the
// London feed, "NONE" no streaming feed.
function feedOf(row) {
  const parts = String(row.raw || "").split(" | ");
  return parts.length >= 2 ? code(parts[parts.length - 2]) : "";
}

// The RSP commission a trade in the trade currency, or null with why.
function commissionOf(row, tradeCcy) {
  const own = row.rsp && Number(row.rsp[tradeCcy]);
  if (own > 0) return { fee: own };
  if (tradeCcy === "GBP") return { fee: RSP.GBP };
  if (tradeCcy === "EUR") {
    if (feedOf(row) === "NONE") {
      return { fee: null, why: "ligne en euros hors flux de Londres : le barème de l'instrument n'imprime pas de commission en euros" };
    }
    return { fee: RSP.EUR };
  }
  return { fee: null, why: `pas de commission ${tradeCcy} publiée pour toutes les lignes (14,95 ou 16,50 selon l'instrument)` };
}

export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null, plan = DEFAULT_PLAN }) {
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
    cashCurrency: BASE,
    url: PAGE,
    remark: "",
  };
  if (!picked) return { ...answer, why: `formule inconnue : ${plan} (smartwealth|adminfree)` };
  if (!catalogue) {
    return { ...answer, why: "le catalogue iDealing n'existe pas encore : lancer `node brokers/idealing/idealing_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue iDealing` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez iDealing`,
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
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const tradeCcy = listingCash(listing.currency);
  const held = depositHas(FOLDER, null, tradeCcy);
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const shared = {
    ...answer,
    listing,
    cashCurrency: held ? tradeCcy : BASE,
    remark: [[picked.remark, m.row.remark].filter(Boolean).join(" "), held ? fxNote(tradeCcy) : ""].filter(Boolean).join("\n"),
    basis:
      `iDealing ${picked.label}, Services & Prices relus le ${READ_ON} (en vigueur au 6 février 2026) ` +
      `et barème par instrument (${SCHEDULE}). Passerelle RSP hors carnet, commission par ordre.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    bp: marketBp,
    perShare: marketPerShare,
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  if (notionalUsd == null) return { ...shared, why: `aucun cours en dollars pour ${listing.currency} dans fx.mjs` };

  const { fee, why: feeWhy } = commissionOf(m.row, tradeCcy);
  const surcharge = picked.surcharge[tradeCcy] ?? null;
  const eachCcy = fee == null || surcharge == null ? null : fee + surcharge;
  const commissionUsd = eachCcy == null ? null : dollars(eachCcy * 2, tradeCcy);
  // A dollar line needs dollars, and no rate is printed for buying them.
  const fxUsd = held ? 0 : null;
  const brokerFees = plus(commissionUsd, fxUsd);

  const tax = taxesOf(listing.isin);
  const gap = taxGap(listing.isin, listing.type, listing.mic);
  const taxPct = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const gbpUsd = usdPer("GBP");
  const notionalGbp = gbpUsd > 0 ? notionalUsd / gbpUsd : null;
  const ptmEach =
    listing.type === "STOCK" && PTM.countries.has((listing.isin || "").slice(0, 2)) && notionalGbp > PTM.above ? PTM.levy : 0;
  const ptmUsd = dollars(ptmEach * 2, "GBP");
  const taxUsd = gap ? null : notionalUsd * taxPct + ptmUsd;

  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd = parts.a == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const why = [
    !held ? `change forcé vers ${tradeCcy} : le compte ne reçoit que GBP et EUR et iDealing ne publie aucun taux de change` : null,
    feeWhy || null,
    bookUsd == null ? `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` : null,
    gap,
  ].filter(Boolean);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(usd == null && why.length ? { why: why.join(" ; ") } : {}),
    tax,
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: {
      each: eachCcy,
      eachWay: true,
      currency: tradeCcy,
      rsp: fee,
      surcharge,
      ptm: ptmEach,
      plan: picked.id,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      change: fxUsd,
      taxes: finite(taxUsd, 6),
    },
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
  console.log(
    JSON.stringify(
      roundTrip({
        etf,
        place,
        currency,
        shares: Number(arg("shares", "10")),
        price: Number(arg("price", "0")),
        plan: arg("plan", DEFAULT_PLAN),
      }),
      null,
      2
    )
  );
}

printCli();
