// Cash round trip on Borsa İstanbul (XIST, lira) for the BIST members whose
// cost files import this one (Halk Yatırım, Vakıf Yatırım, İntegral, ICBC
// Turkey, Destek, Trive, Strateji, IKON, Allbatross, Alternatif, Anadolu,
// Bulls, Galata, Başkent, Enpara, Vakıf Katılım, Hayat Finans, Dünya Katılım,
// Metro: see the header of each broker file). Buy n shares at price p, sell
// them back at once, in dollars. Same output shape as
// ../ahlatci/ahlatci_cost.mjs, ../gcm/gcm_cost.mjs, ../ziraat/ziraat_cost.mjs
// and ../hsbctr/hsbctr_cost.mjs, which it generalises.
//
// Market-wide figures, each side of the trade:
//   BIST borsa payı   0.25 bps of the amount, shares and BYF alike. "Pay
//                     Piyasası Borsa Payı ve Diğer Ücretlere İlişkin Toplu
//                     Çizelge" (updated 28.03.2025), line A "Pay Piyasasındaki
//                     tüm pazarlarda (varant ve sertifika işlemleri hariç)
//                     gerçekleştirilen işlemler 0,25" and line Ç "BYF
//                     İşlemleri 0,25" (bps of the traded value).
//                     https://www.borsaistanbul.com/files/borsa-payi-ve-diger-ucretler-tarifesi.pdf
//   Takasbank         takas payı "Milyonda 4" on shares, "Milyonda 1" on BYF
//                     (Pay Piyasası ücret tarifesi of 03.02.2026, as read for
//                     ../slayz/slayz_cost.mjs; GCM prints the same 0.000004
//                     "Takas payı" on pay senedi işlemleri).
//                     https://www.takasbank.com.tr/documents/mevzuat/pay-piyasasi-ucret-tarifesi-03_02_2026.pdf
//   BSMV              5 %, the banking and insurance transactions tax on a
//                     brokerage commission and on the fees passed on (Slayz
//                     "Tüm komisyon ve ücretlere ilave olarak %5 oranında
//                     BSMV"; Ak Yatırım "%5 (yüzde beş) oranında BSMV").
//   No stamp duty or transaction tax on a BIST share or BYF; the tax map is
//   still read (taxMap.mjs). Withholding (stopaj) is on gains: a trip at one
//   price has none. MKK custody (about 0.008 % a year) is not a trip cost.
//   Lot: one share; no fractions (lot altı not sold online).
//
// schedule (all amounts in lira, rates as fractions):
//   folder, broker, entity, url, readOn        as in the other files
//   sources        { name: url } printed by --schedule (optional)
//   rate           commission each way, or
//   bands          [{ upTo, rate }] sorted, upTo inclusive (Infinity last)
//   bandOn         "day": the band is set by the day's volume, the buy and
//                  the immediate sale together (Ziraat); "month": a monthly
//                  scale, one trip is the first band (GCM) — the default
//   minimum        { amount, per: "trade" | "day" } floor on the commission:
//                  "trade" on each leg (Ziraat 0.90 TL), "day" on the sum of
//                  the two legs (GCM 5 TL)
//   perTrade       fixed lira on each leg outside the commission (HSBC's MKK
//                  kayıt ücreti 0.21 TL); goes to the taxes part, with BSMV
//   levies         "added"     BIST borsa payı + Takasbank passed on, with
//                              BSMV (the tariff says so: Ahlatcı, Slayz)
//                  "takasOnly" borsa payı inside the rate, takas payı on top
//                              (GCM "Komisyon oranlarına Borsa Payı dâhildir")
//                  "none"      the tariff names no pass-through (Ziraat,
//                              HSBC) — the default
//                  { borsaPayi, takas } a broker's own printed figures
//                              (takas a number, or { STOCK, ETF })
//   bsmv           0.05 by default; bsmvPrinted false adds the note that 5 %
//                  is the statutory rate, not the broker's print
//   bsmvOnLevies   default true
//   lowest         a lower printed rate (volume scale, campaign): the remark
//                  "Fees might be x% lower.", x the cut of the commission
//                  itself, (top − lowest) / top (buy and sell alike, BSMV
//                  cancels out)
//   remark         a remark string instead (wins over lowest); "" for none
//   onlineBuy      default true
//   cash           deposit currencies (deposits.mjs), default ["TRY"]; every
//                  BIST line is lira, a deposit currency: no FX ever
//   types          the row types the tariff covers, default STOCK and ETF
//   basis          the French basis sentence (written by the broker file)
//   notes          extra French confidence notes
//
// bistCost(schedule, query) → the same object as ahlatci's roundTrip. In the
// total: book + commission (with minimum) and its BSMV (brokerFees) + levies
// and per-trade fees with their BSMV + tax map (taxes part).
//
// Helpers also exported: BORSA_PAYI, TAKAS, BSMV, bandRate, legs, lowerPct,
// roundPct, printCli(roundTrip, schedule).

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

export const BSMV = 0.05;
export const BORSA_PAYI = 0.000025;
export const TAKAS = Object.freeze({ STOCK: 0.000004, ETF: 0.000001 });
export const SOURCES = Object.freeze({
  borsaPayi: "https://www.borsaistanbul.com/files/borsa-payi-ve-diger-ucretler-tarifesi.pdf",
  takas: "https://www.takasbank.com.tr/documents/mevzuat/pay-piyasasi-ucret-tarifesi-03_02_2026.pdf",
});
const CASH = "TRY";

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const fr = (x) => String(Number(x.toPrecision(6))).replace(".", ",");
const frPct = (rate) => `${fr(rate * 100)} %`;

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

// One catalogue per folder, read once.
const CATALOGUES = new Map();
function catalogueOf(folder) {
  if (CATALOGUES.has(folder)) return CATALOGUES.get(folder);
  const file = new URL(`../${folder}/${folder}-parsed.json`, import.meta.url);
  const parsed = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
  const rows = Array.isArray(parsed) ? parsed : parsed?.rows || [];
  if (rows.length) warmListingIndex(rows);
  const out = { parsed, rows };
  CATALOGUES.set(folder, out);
  return out;
}

function findListing(rows, { etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place, currency }).venue : null;
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

// The rate of the band holding `volume` (lira).
export function bandRate(bands, volume) {
  const hit = bands.find((b) => volume <= b.upTo);
  return (hit || bands[bands.length - 1]).rate;
}

// The commission rate of one trip and the volume that set it.
function tripRate(schedule, notional) {
  if (schedule.bands?.length) {
    if (schedule.bandOn === "day") {
      const volume = notional * 2;
      return { rate: bandRate(schedule.bands, volume), volume };
    }
    return { rate: schedule.bands[0].rate, volume: null };
  }
  return { rate: schedule.rate, volume: null };
}

// Both legs' commission in lira, before BSMV, with the floor.
export function legs(notional, rate, minimum = null) {
  const each = notional * rate;
  if (!minimum?.amount) return { commission: each * 2, floored: false };
  if (minimum.per === "day") {
    const sum = each * 2;
    return { commission: Math.max(minimum.amount, sum), floored: sum < minimum.amount };
  }
  return { commission: Math.max(minimum.amount, each) * 2, floored: each < minimum.amount };
}

// Each-side levy rates for a row type.
function levyRates(levies, type) {
  const etf = type === "ETF";
  if (levies === "added") return { borsaPayi: BORSA_PAYI, takas: etf ? TAKAS.ETF : TAKAS.STOCK };
  if (levies === "takasOnly") return { borsaPayi: 0, takas: etf ? TAKAS.ETF : TAKAS.STOCK };
  if (levies && typeof levies === "object") {
    const t = levies.takas;
    return {
      borsaPayi: levies.borsaPayi ?? 0,
      takas: t == null ? 0 : typeof t === "number" ? t : etf ? t.ETF ?? t.STOCK ?? 0 : t.STOCK ?? 0,
    };
  }
  return { borsaPayi: 0, takas: 0 };
}

// A relative cut in percent: whole when 10 or more, one decimal below.
export function roundPct(x) {
  return x >= 10 ? Math.round(x) : Number(x.toFixed(1));
}

// The cut of the commission itself from `top` to `lowest`, in percent
// (0.2 % → 0.05 % = 75): the same on each leg, BSMV included or not.
export function lowerPct(top, lowest) {
  return top > 0 ? roundPct(((top - lowest) / top) * 100) : 0;
}

function remarkOf(schedule) {
  if (typeof schedule.remark === "string") return schedule.remark;
  const top = schedule.bands?.length ? schedule.bands[0].rate : schedule.rate;
  if (schedule.lowest != null && schedule.lowest < top) {
    const pct = lowerPct(top, schedule.lowest);
    return pct > 0 ? `Fees might be ${pct}% lower.` : "";
  }
  return "";
}

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `usd` is the number the page prints. `brokerFees` is the commission, with
 * its floor and its BSMV.
 */
export function bistCost(schedule, { etf, place, currency, shares, price, bp = null, perShare = null }) {
  const folder = schedule.folder;
  const broker = schedule.broker;
  const bsmv = schedule.bsmv ?? BSMV;
  const bsmvOnLevies = schedule.bsmvOnLevies ?? true;
  const types = new Set(schedule.types || ["STOCK", "ETF"]);
  const cash = schedule.cash || [CASH];
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: schedule.onlineBuy ?? true,
    cashCurrency: cash.length === 1 ? cash[0] : cash,
    url: schedule.url,
    remark: remarkOf(schedule),
  };
  const { parsed, rows } = catalogueOf(folder);
  if (!parsed) {
    return { ...answer, why: `le catalogue ${broker} n'existe pas encore : lancer \`node brokers/${folder}/${folder}_scraping.mjs\`` };
  }
  const { named, matches } = findListing(rows, { etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue ${broker}` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez ${broker}`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: folder,
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency) || CASH,
    brokerExchange: m.row.exchange || null,
  };
  if (listing.currency !== CASH) {
    return { ...answer, listing, why: `${listing.currency} n'est pas une ligne du barème pay piyasası (lire seulement)` };
  }
  if (!types.has(listing.type)) {
    return { ...answer, listing, why: `le barème ${broker} ne couvre pas les lignes ${listing.type || "?"}` };
  }
  const levy = levyRates(schedule.levies ?? "none", listing.type);
  const perTrade = schedule.perTrade || 0;
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (x) => dollars(x, listing.currency),
  });
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const shared = {
    ...answer,
    listing,
    basis: schedule.basis,
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const { rate, volume } = tripRate(schedule, notional);
  const { commission, floored } = legs(notional, rate, schedule.minimum);
  const levies = notional * (levy.borsaPayi + levy.takas) * 2 + perTrade * 2;
  const commissionUsd = dollars(commission * (1 + bsmv), CASH);
  const leviesUsd = dollars(levies * (bsmvOnLevies ? 1 + bsmv : 1), CASH);
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : plus(leviesUsd, notionalUsd * taxTotal);
  const usd = plus(bookUsd, commissionUsd, taxUsd);
  const levyWords =
    levy.borsaPayi || levy.takas
      ? `borsa payı ${fr(levy.borsaPayi * 1e4)} bp et takas payı ${fr(levy.takas * 1e6)} par million chaque sens${bsmvOnLevies ? ", BSMV en sus" : ""}`
      : "aucun borsa payı BIST ni frais Takasbank refacturé par le barème";
  const confidence = [
    shared.basis,
    volume != null ? `volume du jour (les deux sens) ${fr(volume)} TL : ${frPct(rate)} par sens` : null,
    schedule.minimum?.amount
      ? floored
        ? `minimum de ${fr(schedule.minimum.amount)} TL ${schedule.minimum.per === "day" ? "par jour atteint sur les deux sens" : "par opération atteint"}`
        : `au-dessus du minimum ${schedule.minimum.per === "day" ? "journalier" : "par opération"}`
      : null,
    levyWords,
    perTrade ? `${fr(perTrade)} TL par opération en sus` : null,
    schedule.bsmvPrinted === false ? `BSMV : ${broker} ne l'imprime pas, ${frPct(bsmv)} est le taux légal` : null,
    ...(schedule.notes || []),
    "ligne en lires, devise de dépôt : pas de change",
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? `carnet ${marketPerShare} TRY la part`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ]
    .filter(Boolean)
    .join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(commissionUsd, 6),
    commission: {
      rate,
      ...(schedule.lowest != null ? { lowest: schedule.lowest } : {}),
      ...(schedule.minimum?.amount ? { minimum: schedule.minimum } : {}),
      ...(perTrade ? { perTrade } : {}),
      currency: CASH,
      eachWay: true,
      bsmv,
      borsaPayi: levy.borsaPayi,
      takas: levy.takas,
    },
    bp: marketBp,
    perShare: marketPerShare,
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${listing.ticker} sur ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence,
  };
}

// The command line of a broker file: `printCli(roundTrip, SCHEDULE, import.meta.url)`.
export function printCli(roundTrip, schedule, moduleUrl) {
  let direct = false;
  try {
    direct = moduleUrl === pathToFileURL(process.argv[1]).href;
  } catch {
    direct = false;
  }
  if (!direct) return;
  const flag = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({ ...schedule, market: { borsaPayi: BORSA_PAYI, takas: TAKAS, bsmv: BSMV, sources: SOURCES } }, null, 2));
    process.exit(0);
  }
  const [etf, place, currency] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!etf) {
    console.error(`usage : node brokers/${schedule.folder}/${schedule.folder}_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]`);
    process.exit(2);
  }
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
  });
  console.log(JSON.stringify(out, null, 2));
}
