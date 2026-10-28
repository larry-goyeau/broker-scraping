// What one round trip costs at Altshuler Shaham Trade (the self-directed
// trading arm of the Altshuler Shaham group, a TASE member): buy n shares at
// price p on the Tel Aviv Stock Exchange, a US exchange or OTC Markets in
// ALTrade+, sell them back at once, in dollars.
//
// Read 2026-10-26.
// The joining offer ("אלטשולר שחם טרייד – מבצע הצטרפות", benefits page and
// its rules, תקנון): open to every new private client who deposits at least
// ₪5,000, "החל מיום 26.10.2026 ועד להחלטה אחרת של החברה" (from 26.10.2026
// until the company decides otherwise), with no end date per client. A
// client opening an account today pays:
//   US shares and ETFs ("קנייה / מכירה מניות ו-ETF'S בארה"ב")
//                    1 cent a share, minimum $6, each buy and each sell.
//   TASE shares, ETFs and tracking funds ("מניות, קרנות סל וקרנות מחקות
//   בישראל", ETFs on the continuous track)
//                    0.07 %, minimum ₪2.9, each side.
// The full tariff (תעריפון מלא) prices what the offer does not name:
//   7(ב) Pink sheets 1 cent a share, minimum $9  -> OTC Pink Limited and
//                    OTCID (Pink Current renamed) lines.
//   7(ג) OTC         1 cent a share, minimum $25 -> OTCQX and OTCQB lines.
//   (The full tariff's own rates for the rest: TASE 0.15 % min ₪3.5, ETFs
//   0.15 % min ₪16 (continuous track ₪3.5); US 1 cent a share min $9, or $11
//   flat, or 0.15 % min $9, by track. They are not the new client's price.)
//   "ייתכנו חיובים נוספים ... לרבות SEC, TAF, ECN, ORF, TAX": no figures, so
//   0 like the other files. Off-hours or ECN/market-maker routing adds 1
//   cent a share (an order choice, not this trip). Custody is waived for
//   new clients ("פטור מלא ללא הגבלת זמן").
// FX (tariff part 5): no exchange commission, a conversion spread "עד
// 0.7%" of the rate. The account holds shekels, dollars and euros
// (deposits.mjs), so no line converts by force: "FX 0.7% when cash ≠ CCY."
// Israel has no stamp duty; a US FTT comes from taxMap.mjs by ISIN.
//
// Books: TASE (XTAE) from spreads/; OTC lines the OTC Markets touch. US: no
// US broker is named on any page, so the quoted NBBO.
//
//   https://www.as-invest.co.il/trade/trading_benefits/
//   https://www.as-invest.co.il/media/p1pb1i2x/תקנון-אלטשולר-שחם-טרייד.pdf
//   https://www.as-invest.co.il/media/oqdfpafo/תעריפון-מלא-אלטשולר-שחם-טרייד.pdf
//   https://www.as-invest.co.il/trade/currency_exchange/
//
//   node brokers/altshuler/altshuler_cost.mjs ANLT.F1 XTAE ILS --shares=100 --price=20
//   node brokers/altshuler/altshuler_cost.mjs ABRA XTAE ILS --shares=10000 --price=5
//   node brokers/altshuler/altshuler_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/altshuler/altshuler_cost.mjs AAGAF OTCM USD --shares=1000 --price=1
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, listingCash, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates, taxGap } from "../../taxMap.mjs";
import { depositHas } from "../../deposits.mjs";

const FOLDER = "altshuler";
const CATALOGUE = new URL("altshuler-parsed.json", import.meta.url);
const PAGES = {
  offer: "https://www.as-invest.co.il/trade/trading_benefits/",
  tariff: "https://www.as-invest.co.il/media/oqdfpafo/%D7%AA%D7%A2%D7%A8%D7%99%D7%A4%D7%95%D7%9F-%D7%9E%D7%9C%D7%90-%D7%90%D7%9C%D7%98%D7%A9%D7%95%D7%9C%D7%A8-%D7%A9%D7%97%D7%9D-%D7%98%D7%A8%D7%99%D7%99%D7%93.pdf",
};
const READ_ON = "2026-10-26";
const FX_SPREAD = "0.7";

// Each side.
const TASE = { rate: 0.0007, min: 2.9 }; // ILS
const US = { perShare: 0.01, min: 6 }; // USD, joining offer
const PINK = { perShare: 0.01, min: 9 }; // tariff 7(ב)
const OTC = { perShare: 0.01, min: 25 }; // tariff 7(ג)
const US_MICS = new Set(["XNAS", "XNYS", "XASE", "ARCX", "BATS", "TXSE"]);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  if (amount == null || Number.isNaN(amount)) return null;
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

// The OTC Markets tier printed in the catalogue row ("OTC Pink Limited",
// "OTC OTCID", "OTC OTCQB", "OTC OTCQX").
function otcTier(row) {
  const tier = String(row?.raw || "").split(" | ")[2] || "";
  if (/OTCQX|OTCQB/i.test(tier)) return "otc";
  return "pink";
}

function marketOf(row, mic) {
  const m = code(mic || row?.mic);
  if (m === "XTAE") return "tase";
  if (m === "OTCM") return otcTier(row);
  if (US_MICS.has(m)) return "us";
  return null;
}

/** One side's commission in the listing currency. */
export function commissionSide(market, { shares, notional }) {
  if (market === "tase") return Math.max(TASE.min, notional * TASE.rate);
  const t = market === "us" ? US : market === "pink" ? PINK : market === "otc" ? OTC : null;
  return t ? Math.max(t.min, shares * t.perShare) : null;
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
      if (loose(m.row.mic) === wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

const BASIS = {
  tase: `offre d'entrée Altshuler Shaham Trade (nouveaux clients, dès 5 000 ₪, sans date de fin), relue le ${READ_ON} : actions, ETF et fonds indiciels de la TASE 0,07 %, minimum 2,9 ₪, à l'achat et à la vente`,
  us: `offre d'entrée Altshuler Shaham Trade (nouveaux clients, dès 5 000 ₪, sans date de fin), relue le ${READ_ON} : actions et ETF américains 1 cent la part, minimum 6 USD, à l'achat et à la vente ; SEC, TAF et ECN sans montant (0)`,
  pink: `tarif complet Altshuler Shaham Trade, relu le ${READ_ON}, 7(ב) Pink sheets : 1 cent la part, minimum 9 USD par ordre ; SEC, TAF et ECN sans montant (0)`,
  otc: `tarif complet Altshuler Shaham Trade, relu le ${READ_ON}, 7(ג) OTC : 1 cent la part, minimum 25 USD par ordre ; SEC, TAF et ECN sans montant (0)`,
};

export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "",
    url: PAGES.offer,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Altshuler n'existe pas encore : lancer `node brokers/altshuler/altshuler_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Altshuler` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Altshuler`,
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
  const rowMic = code(m.venue?.mic ?? m.row.mic);
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? rowMic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const market = marketOf(m.row, rowMic);
  const american = market === "us";
  const settle = listingCash(listing.currency);
  const held = depositHas(FOLDER, null, settle);
  const fxLine = held ? fxRemark(FX_SPREAD, listing.currency) : "";
  const shared = {
    ...answer,
    listing,
    cashCurrency: held ? settle : "",
    url: market === "pink" || market === "otc" ? PAGES.tariff : PAGES.offer,
    basis: BASIS[market] || `barème Altshuler Shaham Trade relu le ${READ_ON}`,
    remark: fxLine,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };
  const ccyOk = market === "tase" ? listing.currency === "ILS" : listing.currency === "USD";
  if (!market || !ccyOk) {
    return { ...shared, why: `${listing.brokerExchange || listing.exchange} ${listing.currency} n'a pas de ligne dans le barème Altshuler` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const side = commissionSide(market, { shares: n, notional });
  const commissionUsd = dollars(2 * side, listing.currency);
  const fxUsd = held ? 0 : null;
  const brokerFees = plus(commissionUsd, fxUsd);

  const tax = taxesOf(listing.isin);
  const taxPct = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const gap = taxGap(listing.isin, listing.type, listing.mic);
  const taxUsd = gap || notionalUsd == null ? null : notionalUsd * taxPct;

  let marketBp = bp ?? (american ? null : book.leaf?.bp ?? null);
  let marketPerShare = perShare ?? (american ? null : book.leaf?.perShare ?? null);
  if (american && bp == null && perShare == null) {
    marketPerShare = usBookPerShare({ broker: FOLDER, ticker: listing.ticker, fallback: book.leaf?.perShare ?? null });
  }
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: american && marketPerShare != null ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (v) => dollars(v, listing.currency),
  });
  const bookUsd =
    parts.a == null || parts.b == null || notionalUsd == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, commissionUsd, taxUsd, fxUsd);

  const unknown = [
    held ? null : `${listing.currency} n'est pas une devise de dépôt et Altshuler n'imprime pas de change forcé`,
    bookUsd == null
      ? american
        ? `pas de carnet 605 pour ${listing.ticker || etf}`
        : `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`
      : null,
    gap,
  ].filter(Boolean);
  const floor = market === "tase" ? TASE.min : market === "us" ? US.min : market === "pink" ? PINK.min : OTC.min;

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    bp: marketBp,
    perShare: marketPerShare,
    ...(unknown.length ? { why: unknown.join(" ; ") } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { buy: side, sell: side, currency: listing.currency, eachWay: true, floored: side === floor },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      taxes: finite(taxUsd, 6),
      change: finite(fxUsd, 6),
    },
    tax,
    confidence: [
      shared.basis,
      side === floor ? "minimum par ordre appliqué" : null,
      american ? "pas de courtier américain nommé : NBBO coté" : null,
      market === "pink" || market === "otc" ? `palier OTC Markets lu dans le catalogue : ${String(m.row.raw || "").split(" | ")[2] || "?"}` : null,
      "aucun aller-retour réel chez Altshuler dans ce dépôt",
    ]
      .filter(Boolean)
      .join(" ; "),
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
  if (!etf) {
    console.error("usage : node brokers/altshuler/altshuler_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
    process.exit(2);
  }
  console.log(JSON.stringify(roundTrip({ etf, place, currency, shares: Number(arg("shares", "10")), price: Number(arg("price", "0")) }), null, 2));
}

printCli();
