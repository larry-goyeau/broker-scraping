// Cash round trip on the Indonesia Stock Exchange (IDX, XIDX): buy n shares
// at price p, sell them back at once, in dollars. Shared by the brokers
// whose only place is IDX (Stockbit, Mirae Asset, SimInvest, Samuel, Sucor,
// Bahana, Phintraco and the others of the same group, see idxBook.mjs).
// Each broker file passes the two online figures its own page prints; this
// file adds them up on the fill, the way brokers/bni, brokers/bri,
// brokers/indopremier, brokers/cgsid, brokers/rhbid and brokers/fac count
// a trip. Same output as those files.
//
// What an IDX trip is made of (each broker prints its own mix):
//   broker commission   the broker's own rate
//   VAT                 on the commission and on the levy. 12% on a base of
//                       11/12 of the fee, so 11% in effect (PMK 131/2024).
//   levy                BEI 0.018%, KPEI 0.009%, KSEI 0.003% (0.03%), plus
//                       VAT, plus the 0.01% KPEI guarantee fund: 0.0433% of
//                       the fill, each side. Ajaib's fee page prints the
//                       levy "(BEI, KPEI, KSEI)" at 0.0433%; the 0.018% and
//                       0.003% lines are the two IDX and KSEI waive for
//                       members on ETF trades (1 July 2024 to 31 December
//                       2026, a rebate to the broker, not to the client).
//                         https://ajaib.co.id/biaya
//                         https://market.bisnis.com/read/20240706/7/1779914/bei-dan-ksei-siapkan-insentif-ke-anggota-bursa-yang-jual-beli-etf
//   sale tax            0.1% of the gross sale of a share, final income
//                       tax withheld by the broker (PP 41/1994, PP 14/1997).
//                       Not on an ETF unit: Stockbit prints its ETF sell at
//                       0.15% "fee jual tidak dikenakan PPh".
//   e-Meterai           Rp 10,000 on a trade confirmation above Rp 10,000,000
//                       (UU 10/2020, PMK 134/2021). One confirmation covers a
//                       day's trades, so a same-day trip carries one stamp.
//                       Left out unless the broker's page prints it, like the
//                       IDX files above (Pluang prints it and adds it).
//                         https://help.stockbit.com/id/article/transaksi-saham-berapa-biaya-trading-di-stockbit-sekuritas-1lbkyq9/
//
// Almost every Indonesian broker prints an all-in buy and sell, the sell
// 0.10 points above the buy (the sale tax). Those two figures go in as they
// are. A page that prints the commission alone goes through allIn().
// The account is in rupiah and every line is IDR: no FX. A lot is 100
// shares; the share count is taken as given, as in the files above.
//
// brokerFees is everything on both sides, tax and stamp included. The book
// is read from spreads/ (spreads/idx-touch.mjs); a missing book stays
// missing.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CASH = "IDR";

// Final income tax on a sale of listed shares.
export const SALE_TAX = 0.001;
// VAT in effect on a broker fee: 12% x 11/12.
export const VAT = 0.11;
// BEI 0.018% + KPEI 0.009% + KSEI 0.003%, before VAT.
export const EXCHANGE_FEES = 0.0003;
// KPEI guarantee fund, no VAT.
export const GUARANTEE_FUND = 0.0001;
// The levy as brokers print it: 0.0433%.
export const LEVY = Number((EXCHANGE_FEES * (1 + VAT) + GUARANTEE_FUND).toPrecision(12));
// e-Meterai on a confirmation above Rp 10,000,000.
export const STAMP = 10_000;
export const STAMP_ABOVE = 10_000_000;

export function pct(text) {
  return Number((Number(text) / 100).toPrecision(12));
}

// French percent, "0,15 %".
export function frPct(rate) {
  const v = Math.round(rate * 100 * 10000) / 10000;
  return `${String(v).replace(".", ",")} %`;
}

// One side's rate from a commission printed alone: commission, VAT on it
// (vat: false when the page says the rate already includes it), the levy
// (levy: false when the page says it is included), and on a share sale the
// tax (saleTax: true).
export function allIn(commission, { vat = true, levy = true, saleTax = false } = {}) {
  const rate = commission * (vat ? 1 + VAT : 1) + (levy ? LEVY : 0) + (saleTax ? SALE_TAX : 0);
  return Number(rate.toPrecision(12));
}

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};
const rupiah = (amount) => `Rp ${Math.round(amount).toLocaleString("fr-FR")}`;

const loaded = new Map();
function loadRows(catalogueUrl) {
  const key = String(catalogueUrl);
  if (!loaded.has(key)) {
    let rows = null;
    if (fs.existsSync(catalogueUrl)) {
      const catalogue = JSON.parse(fs.readFileSync(catalogueUrl, "utf8"));
      rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
      if (rows.length) warmListingIndex(rows);
    }
    loaded.set(key, rows);
  }
  return loaded.get(key);
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

// The plan a query asks for, or the schedule's default. Unknown names fall
// back to the default, as bux and N26 do.
export function planOf(schedule, name) {
  if (!schedule.plans) return null;
  const id = String(name || schedule.defaultPlan || "").trim().toLowerCase();
  return schedule.plans[id] ? { id, ...schedule.plans[id] } : { id: schedule.defaultPlan, ...schedule.plans[schedule.defaultPlan] };
}

// schedule: {
//   broker, folder, catalogueUrl, url, readOn,
//   buy, sell              all-in online rates for a share (sell with the tax)
//   etfBuy?, etfSell?      when the page prints other figures for an ETF
//   minBuy?, minSell?      floor of one side's whole charge, in rupiah
//   side?(notional, leg, listing)   rupiah for one side, for a page whose
//                          charge is not rate x fill (leg "buy" | "sell");
//                          overrides buy/sell/min
//   stamp?                 false (default) | "daily" (one Rp 10,000 stamp
//                          when buy + sell > Rp 10,000,000, same-day TC) |
//                          "perSide" (each side above Rp 10,000,000, as
//                          Pluang prints it)
//   basis                  French: the account and channel, e.g. "compte
//                          régulier, ordre en ligne"; the figures are added
//   remark?                string, or (ctx) => string with ctx { plan,
//                          listing, buy, sell, notional }
//   onlineBuy?             default true
//   plans?, defaultPlan?   { id: { label, ...any key above } }; the query's
//                          `plan` picks one, its keys win over the schedule's
// }
export function idxRoundTrip(schedule, query) {
  const { etf, place, currency, shares, price, bp = null, perShare = null } = query;
  const plan = planOf(schedule, query.plan);
  const s = plan ? { ...schedule, ...plan } : schedule;
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    ...(plan ? { plan: plan.id } : {}),
    onlineBuy: s.onlineBuy ?? true,
    cashCurrency: CASH,
    url: s.url,
    remark: typeof s.remark === "string" ? s.remark : "",
  };
  const rows = loadRows(s.catalogueUrl);
  if (!rows) {
    return {
      ...answer,
      why: `le catalogue ${s.broker} n'existe pas encore : lancer \`node brokers/${s.folder}/${s.folder}_scraping.mjs\``,
    };
  }
  const { named, matches } = findListing(rows, { etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue ${s.broker}` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez ${s.broker}`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: s.folder,
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
  const isEtf = listing.type === "ETF";
  const buy = isEtf && s.etfBuy != null ? s.etfBuy : s.buy;
  const sell = isEtf && s.etfSell != null ? s.etfSell : s.sell;
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const figures = s.side
    ? ""
    : ` Achat ${frPct(buy)}${s.minBuy ? `, au moins ${rupiah(s.minBuy)}` : ""}. Vente ${frPct(sell)}${s.minSell ? `, au moins ${rupiah(s.minSell)}` : ""}.`;
  const head = `${s.basis ? `${s.basis}, ` : ""}${plan?.label ? `${plan.label}, ` : ""}barème relu le ${s.readOn}.${figures}`;
  const shared = {
    ...answer,
    listing,
    basis: head,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    bp: marketBp,
    perShare: marketPerShare,
  };
  if (listing.currency !== CASH || listing.mic !== "XIDX") {
    return { ...shared, why: `${listing.brokerExchange || listing.exchange} n'est pas au barème IDX de ${s.broker}` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const leg = (which) =>
    s.side
      ? s.side(notional, which, listing)
      : Math.max(notional * (which === "buy" ? buy : sell), (which === "buy" ? s.minBuy : s.minSell) || 0);
  const buySide = leg("buy");
  const sellSide = leg("sell");
  if (buySide == null || sellSide == null) return { ...shared, why: `aucun taux publié pour ${rupiah(notional)}` };
  const stamps =
    s.stamp === "daily" ? (2 * notional > STAMP_ABOVE ? 1 : 0) : s.stamp === "perSide" ? (notional > STAMP_ABOVE ? 2 : 0) : 0;
  const ticket = buySide + sellSide + stamps * STAMP;
  const brokerFees = dollars(ticket, listing.currency);
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
  const remark =
    typeof s.remark === "function" ? s.remark({ plan: plan?.id ?? null, listing, buy, sell, notional }) : answer.remark;

  return {
    ...shared,
    basis: stamps ? `${head} e-Meterai ${rupiah(stamps * STAMP)}.` : head,
    remark,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: s.side
      ? { buy: Number((buySide / notional).toPrecision(12)), sell: Number((sellSide / notional).toPrecision(12)), currency: listing.currency }
      : { buy, sell, currency: listing.currency },
  };
}

export function printCli(callerUrl, roundTrip) {
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
  console.log(
    JSON.stringify(
      roundTrip({ etf, place, currency, shares: Number(arg("shares", "10")), price: Number(arg("price", "0")), plan: arg("plan", undefined) }),
      null,
      2
    )
  );
}
