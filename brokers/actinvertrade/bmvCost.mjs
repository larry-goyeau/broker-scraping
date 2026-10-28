// Cash round trip on the Bolsa Mexicana de Valores (BMV, MIC XMEX): buy n
// shares at price p, sell them straight back, in dollars. Shared by the
// brokers whose only place is the Mexican exchange and whose catalogue is
// read by ./bmvBook.mjs (Actinver Trade, Kuspit, Bx+, INVEX Casa de Bolsa).
// Each broker file passes its own schedule; the sums are those of
// brokers/finamex/finamex_cost.mjs, the BMV file already in the repo.
//
// What each Mexican tariff prints is a brokerage rate on the amount of each
// order (compra and venta alike), sometimes a floor in pesos, and, when the
// tariff says so ("+ IVA", "más IVA"), the 16% value-added tax on that
// commission (Ley del IVA, art. 1, general rate). The IVA is part of what
// the broker bills, so it is in brokerFees, as acuantoesta_cost.mjs does in
// Argentina. A tariff that prints no IVA is taken as printed (finamex).
//
// Nothing else is billed on the order:
//   - the BMV's own trading fees and the Indeval settlement fees are paid by
//     the casa de bolsa; none of the four tariffs passes them on;
//   - Mexico has no stamp duty or transaction tax on shares or ETFs; the
//     10% ISR on the gain of a BMV sale (LISR art. 129) is on a gain, and
//     an immediate round trip at one price has none;
//   - SIC lines (foreign shares and ETFs) trade on the BMV in pesos, through
//     a Mexican broker, so no US NBBO and no 606 applies: the BMV book is
//     used for them too.
// Every catalogue line is quoted in pesos and the accounts settle in pesos,
// so nothing is converted.
//
// The book is read from spreads/ (mx-touch, the BMV touch from the IBKR
// portal); a missing leaf stays missing, so the total is N/A.
//
// schedule = {
//   broker,        display name, "Actinver Trade"
//   folder,        "actinvertrade"
//   catalogueUrl,  new URL("actinvertrade-parsed.json", import.meta.url)
//   url,           tariff page
//   readOn,        "2026-10-26"
//   rate,          brokerage per order, before IVA, e.g. 0.0025
//   minimum,       floor in pesos per order before IVA (default 0)
//   iva,           true when the tariff says "+ IVA" (adds 16%)
//   commissionMxn, optional (notionalMxn) => pesos per order before IVA,
//                  for a tariff the rate and floor cannot say; it wins
//   tariff,        French words for basis, "0,25 % + IVA par ordre"
//   remark,        English remark (owner patterns)
//   onlineBuy,     default true
// }
//
//   import { bmvRoundTrip, printCli } from "../actinvertrade/bmvCost.mjs";
//   export const roundTrip = (query) => bmvRoundTrip(SCHEDULE, query);
//   printCli(import.meta.url, roundTrip);

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

export const CASH = "MXN";
export const IVA_MX = 0.16;

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

// French percent, "0,25 %".
export function frPct(rate) {
  const v = Math.round(rate * 100 * 10000) / 10000;
  return `${String(v).replace(".", ",")} %`;
}
const frMxn = (x) => `${(Math.round(x * 100) / 100).toLocaleString("fr-FR")} MXN`;

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

export function bmvRoundTrip(schedule, query) {
  const { etf, place, currency, shares, price, bp = null, perShare = null } = query;
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: schedule.onlineBuy ?? true,
    cashCurrency: CASH,
    url: schedule.url,
    remark: schedule.remark || "",
  };
  const rows = loadRows(schedule.catalogueUrl);
  if (!rows) {
    return {
      ...answer,
      why: `le catalogue ${schedule.broker} n'existe pas encore : lancer \`node brokers/${schedule.folder}/${schedule.folder}_scraping.mjs\``,
    };
  }
  const { named, matches } = findListing(rows, { etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue ${schedule.broker}` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez ${schedule.broker}`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: schedule.folder,
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
  const vat = schedule.iva ? IVA_MX : 0;
  const minimum = schedule.minimum || 0;
  const tariff =
    schedule.tariff ||
    (schedule.rate == null
      ? `selon le barème du courtier${vat ? " + IVA 16 %" : ""}, par ordre`
      : `${frPct(schedule.rate)}${minimum ? `, minimum ${frMxn(minimum)}` : ""}${vat ? " + IVA 16 %" : ""} par ordre`);
  const shared = {
    ...answer,
    remark: [answer.remark, m.row.remark].filter(Boolean).join(" "),
    listing,
    basis: `ordre en ligne sur la Bolsa Mexicana, barème ${schedule.broker} relu le ${schedule.readOn}. Courtage ${tariff}, achat et vente.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    bp: marketBp,
    perShare: marketPerShare,
  };
  if (listing.currency !== CASH) {
    return { ...shared, why: `${schedule.broker} ne publie un barème que pour la Bolsa Mexicana en pesos ; ${listing.currency} n'est pas couvert` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const byRate = schedule.rate == null ? null : notional * schedule.rate;
  const perOrder =
    typeof schedule.commissionMxn === "function"
      ? schedule.commissionMxn(notional)
      : byRate == null
        ? null
        : Math.max(minimum, byRate);
  const eachMxn = perOrder == null ? null : perOrder * (1 + vat);
  const courtageMxn = eachMxn == null ? null : eachMxn * 2;
  const brokerFees = courtageMxn == null ? null : dollars(courtageMxn, listing.currency);
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
  const floorBites = typeof schedule.commissionMxn !== "function" && minimum > 0 && byRate != null && byRate < minimum;
  const why = [
    perOrder == null ? `aucun taux de courtage publié par ${schedule.broker}` : null,
    notionalUsd == null ? `aucun cours en dollars pour ${listing.currency} dans fx.mjs` : null,
    parts.a == null || parts.b == null
      ? `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`
      : null,
  ]
    .filter(Boolean)
    .join(" ; ");
  const confidence = [
    shared.basis,
    perOrder == null
      ? "courtage inconnu"
      : floorBites
        ? `${frPct(schedule.rate)} de ${frMxn(notional)} = ${frMxn(byRate)}, sous le minimum : ${frMxn(minimum)} par ordre`
        : `${frMxn(perOrder)} par ordre sur ${frMxn(notional)}${vat ? `, ${frMxn(eachMxn)} avec l'IVA` : ""}`,
    "droits BMV et Indeval à la charge de la casa de bolsa, non refacturés",
    "aucune taxe sur les transactions au Mexique ; ISR de 10 % sur la plus-value non compté : aller-retour au même prix, aucun gain",
    "ligne en pesos, compte en pesos : aucun change",
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} pb`
      : marketPerShare != null
        ? `carnet ${marketPerShare} MXN par titre`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(why ? { why } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: {
      buy: finite(eachMxn, 8),
      sell: finite(eachMxn, 8),
      rate: schedule.rate ?? null,
      minimum,
      vat,
      currency: listing.currency,
      eachWay: true,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      taxes: 0,
      courtageMxn: finite(courtageMxn, 6),
      ivaMxn: finite(perOrder == null ? null : perOrder * vat * 2, 6),
    },
    confidence,
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
  const plan = arg("plan", undefined);
  console.log(
    JSON.stringify(
      roundTrip({ etf, place, currency, shares: Number(arg("shares", "10")), price: Number(arg("price", "0")), ...(plan ? { plan } : {}) }),
      null,
      2,
    ),
  );
}

// node brokers/actinvertrade/bmvCost.mjs WALMEX XMEX MXN --shares=300 --price=57
// runs a demo schedule (0.25 % + IVA, Actinver Trade's first band) on the
// Actinver Trade catalogue.
printCli(import.meta.url, (query) =>
  bmvRoundTrip(
    {
      broker: "Actinver Trade (démo)",
      folder: "actinvertrade",
      catalogueUrl: new URL("actinvertrade-parsed.json", import.meta.url),
      url: "https://www.actinver.com/",
      readOn: "2026-10-26",
      rate: 0.0025,
      iva: true,
    },
    query,
  ),
);
