// What one round trip costs at LDT Brokers (Luis Domingo Trucco S.A.): buy
// n shares at price p, sell them back at once, in dollars. Buenos Aires
// shares and CEDEARs, in pesos or in dollars (MEP, cable), as the Ingematica
// board names them. Bonds, options, cauciones and funds stay out.
//
// Read on 2026-10-18. The "Aranceles" page links one sheet, "Aranceles,
// Comisiones y Recuperos según Resolución General CNV 616", which says
// "Aranceles vigentes desde Enero 2025" and "Los aranceles no incluyen IVA".
// It is a scan with no text layer; the figures below were read off it.
// There is one schedule for every channel: no separate online rate.
//   https://www.ldtbrokers.com/Informe/Legales/Aranceles
//   https://truccoweb.prod.ingecloud.com/TempFiles/fb7d292a-fcdc-47c5-bae2-a6ad1713d040.pdf
//
//   Contado, renta       Arancel mínimo 500, mínimo 0.5 %, máximo 1 % of the
//   variable             consideration, each side. The sheet does not say
//                        which client pays which rate, so the figure is the
//                        1 % ceiling, as Balanz's "hasta" is. The 500 is
//                        pesos; a dollar line takes its peso equivalent.
//                        The 0.5 % floor is the remark, 50 % under the 1 %.
//   IVA                  Not included, says the sheet, with no rate printed.
//                        A share or a CEDEAR takes the 21 % rate.
//   Market rights        Not on the sheet. BYMA bills them on every trade and
//                        the agent passes them on: BYMA's August 2026 table,
//                        contado PPT, 0.05 % on a private share or a CEDEAR,
//                        each side, plus IVA. On a dollar trade BYMA assesses
//                        them on the peso equivalent at the Banco Nación
//                        seller close; this ticket applies the same 0.05 % to
//                        the trade notional.
//                        https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a7f24c87e8bd58f712c02d1_BYMA-Derechos-Mercado-sobre-Operaciones_2026-08-14-vf.pdf
//   Same session         BYMA takes 50 % off its rights for a buy and a sell
//                        in the same session; LDT prints no commission
//                        waiver. The figure assumes another day.
//
// Not this order, so in the remark: custody ("Servicios de Custodia",
// minimum 500, maximum 20,000 pesos, plus IVA, with no period printed) and
// 2 % of the credits (dividends, coupons) including Caja de Valores;
// account opening and maintenance (no charge), a transfer of securities
// (10,000 pesos a species). Contado block (same rates) has a BYMA minimum size and is not
// on the board. There is no conversion on the ticket: a peso line settles
// in pesos, a MEP line and a cable line in dollars.
//
// Cash: the account holds pesos only (deposits.mjs). A dollar line must be
// bought with dollars, and LDT prints no rate or fee for turning pesos into
// MEP or cable dollars, so a dollar line's total is unknown.
//
//   node brokers/ldt/ldt_cost.mjs GGAL BCBA ARS --shares=10 --price=5940
//   node brokers/ldt/ldt_cost.mjs AAPL BCBA ARS --shares=10 --price=27200
//   node brokers/ldt/ldt_cost.mjs AAPLD BCBA USD --shares=10 --price=18
//   node brokers/ldt/ldt_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";
import { depositHas } from "../../deposits.mjs";

const CATALOGUE = new URL("ldt-parsed.json", import.meta.url);

const SCHEDULE = {
  page: "https://www.ldtbrokers.com/Informe/Legales/Aranceles",
  url: "https://truccoweb.prod.ingecloud.com/TempFiles/fb7d292a-fcdc-47c5-bae2-a6ad1713d040.pdf",
  market: "https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a7f24c87e8bd58f712c02d1_BYMA-Derechos-Mercado-sobre-Operaciones_2026-08-14-vf.pdf",
  readOn: "2026-10-18",
  inForce: "2025-01",
  marketOn: "2026-08-14",
  entity: "Luis Domingo Trucco S.A. (ALyC y AN propio n° 216 CNV)",
};

const IVA = 0.21;
const RATE = 0.01;
const RATE_LOW = 0.005;
const MIN_ARS = 500;
const MARKET = 0.0005;
const REMARK =
  "Commission can be up to 50% lower; the sheet does not say when.\nCustody 500 to 20,000 pesos + VAT, period not stated. Dividends and coupons pay 2%.";

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

const withIva = (amount) => amount * (1 + IVA);

// The 500-peso floor in the listing's currency (a MEP or cable line is in dollars).
const floorIn = (currency) => {
  if (code(currency) === "ARS") return MIN_ARS;
  const usd = toUsd(MIN_ARS, "ARS");
  const per = usdPer(currency);
  return usd == null || per == null ? null : usd / per;
};

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => !wantPlace || loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace)
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
    cashCurrency: "",
    url: SCHEDULE.url,
    remark: REMARK,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue LDT n'existe pas encore : lancer `node brokers/ldt/ldt_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue LDT` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez LDT`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
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
  const leaf = book.leaf;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const marketBp = bp ?? (marketPerShare != null ? null : leaf?.bp ?? null);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (value) => dollars(value, listing.currency),
  });
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const shared = {
    ...answer,
    listing,
    cashCurrency: listing.currency,
    bp: marketBp,
    perShare: marketPerShare,
    basis: `plafond contado, feuille en vigueur depuis janvier 2025 relue le ${SCHEDULE.readOn} : 1 % + IVA par exécution, minimum 500 pesos + IVA ; droits BYMA 0,05 % + IVA, tableau du ${SCHEDULE.marketOn}`,
    tax,
    ccy: QUOTE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };

  if (!depositHas("ldt", "", listing.currency)) {
    return {
      ...shared,
      why: `change obligatoire : le compte LDT ne garde que des pesos et LDT ne publie ni taux ni frais pour passer en ${listing.currency}`,
    };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const floor = floorIn(listing.currency);
  const each = floor == null ? null : withIva(Math.max(notional * RATE, floor));
  const commission = each == null ? null : each * 2;
  const rights = withIva(notional * MARKET) * 2;
  const brokerFees = commission == null ? null : dollars(commission, listing.currency);
  const bourse = dollars(rights, listing.currency);
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, bourse, taxUsd);
  const floorBites = floor != null && notional * RATE < floor;
  const confidence = [
    shared.basis,
    floorBites ? `le minimum de 500 pesos mord sous ${Math.round(MIN_ARS / RATE)} pesos d'ordre` : `1 % de ${notional.toFixed(2)} ${listing.currency}`,
    `fourchette publiée ${RATE_LOW * 100} % à ${RATE * 100} % : le chiffre est le haut`,
    "ligne dans sa devise : pas de change",
    marketPerShare != null
      ? `carnet ${marketPerShare} $ la part`
      : marketBp != null
        ? `carnet ${marketBp} bp`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    commission: { rate: RATE, low: RATE_LOW, min: MIN_ARS, minCurrency: "ARS", vat: IVA, currency: listing.currency, eachWay: true },
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet pour cette ligne"}` }
      : {}),
    ...(brokerFees == null ? { why: `pas de taux pour convertir le minimum de 500 pesos en ${listing.currency}` } : {}),
    trade: {
      shares: n,
      price: p,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: listing.currency,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      bourse: finite(bourse, 6),
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
    console.log(JSON.stringify({ ...SCHEDULE, rate: RATE, rateLow: RATE_LOW, minArs: MIN_ARS, marketRights: MARKET, iva: IVA }, null, 2));
    return;
  }
  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage : node brokers/ldt/ldt_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
    process.exit(2);
  }
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
  });
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) console.log(out.alternatives.join("\n"));
    process.exit(0);
  }
  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange}, ${l.currency}, ${(l.type || "").toLowerCase()}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(`${t.shares} parts à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}\n`);
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${out.brokerFees ?? "N/A"} $`);
    const parts = out.parts || {};
    if (parts.marché != null) console.log(`  carnet         : ${parts.marché} $`);
    if (parts.courtage != null) console.log(`  courtage       : ${parts.courtage} $`);
    if (parts.bourse) console.log(`  marché         : ${parts.bourse} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
  } else if (out.why) {
    console.log(out.why);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}

printCli();
