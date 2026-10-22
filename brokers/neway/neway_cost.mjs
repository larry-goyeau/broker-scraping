// What one round trip costs through Neway ESX, the trading app of the
// Ethiopian Securities Exchange: buy n shares of a listed company and sell
// them straight back, in dollars. The order goes to the ESX book through
// the ESX trading member the investor picks. Every catalogue line is an
// ordinary share quoted in birr (ETB) and the account holds birr, so
// nothing is converted.
//
//   https://apps.apple.com/us/app/neway-esx/id6753160438
//   read on 2026-10-21, with the March 2026 launch notes: Neway prints no
//   commission. The member charges it, and no member rate is published
//   for Neway orders; the ESX only caps it.
//   https://esx.et/wp-content/uploads/2025/09/ESX-Fees.pdf
//   read on 2026-10-21: ESX Fees Schedule, December 2024.
//     Clause 7, transaction fee     0.36 % of the value, equity Main and
//                                   Growth market. Members "collect and
//                                   transfer" it on every transaction:
//                                   taken on the buy and on the sell.
//     Clause 8, brokerage           at most 1.6 % for equity Main and
//                                   Growth market. A cap, not a rate:
//                                   the commission is unknown.
//     Clause 5                      fees are exclusive of other taxes; no
//                                   tax is named, none is added.
//   https://esx.et/wp-content/uploads/2026/05/Fees-Schedule-–-First-Amendment-May-2026.pdf
//   read the same day: First Amendment, in force 2 May 2026. Only adds a
//   0.18 % block trade fee (a pre-negotiated trade of 5 % or more of the
//   issuer's market cap, approved by the ESX: not an app order), listing
//   caps and OTC admission fees. The 0.36 % and 1.6 % are unchanged.
//   https://esx.et/wp-content/uploads/2026/07/Main-Market-Manual-1.pdf
//   (block trade criteria, minimum order of one share).
//   https://ecma.gov.et/download/ecma-fee-directive-no-996_2024-english/
//   read the same day: ECMA Fee Directive No. 996/2024, Part Five, art. 15:
//     Authority transaction fee     0.15 % of the value of the transaction
//                                   on shares, taken on each side.
//   No minimum fee, no tier, no custody or CSD fee is published.
//
// In the total: book, commission, ESX 0.36 % and ECMA 0.15 %, on the buy
// and on the sell. The commission is not published, so the total and
// brokerFees stay N/A; the birr levies are in `market` and the 1.6 % cap
// in `commission`. Remark: none. The ESX book is not stored and fx.mjs has
// no birr rate yet either.
//
//   node brokers/neway/neway_cost.mjs TELE "Ethiopian Securities Exchange" ETB --shares=100 --price=300
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, listingCash, toUsd, usdPer } from "../../fx.mjs";
import { depositHas } from "../../deposits.mjs";

const FOLDER = "neway";
const CATALOGUE = new URL("neway-parsed.json", import.meta.url);
const PAGE = "https://esx.et/wp-content/uploads/2025/09/ESX-Fees.pdf";
const AMENDMENT_PAGE = "https://esx.et/wp-content/uploads/2026/05/Fees-Schedule-%E2%80%93-First-Amendment-May-2026.pdf";
const ECMA_PAGE = "https://ecma.gov.et/download/ecma-fee-directive-no-996_2024-english/";
const APP_PAGE = "https://apps.apple.com/us/app/neway-esx/id6753160438";
const READ_ON = "2026-10-21";
const BROKER = "Neway ESX";
const EXCHANGE = "Ethiopian Securities Exchange";
const CASH = "ETB";
const COMMISSION_CAP = 0.016;
const ESX_FEE = 0.0036;
const ECMA_FEE = 0.0015;

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
    cashCurrency: CASH,
    url: PAGE,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: `le catalogue ${BROKER} n'existe pas encore : lancer \`node brokers/neway/neway_scraping.mjs\`` };
  }
  const { named, matches } = findListing({ etf, place, currency });
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
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const cashCcy = listingCash(listing.currency);
  const held = depositHas(FOLDER, null, cashCcy);
  const fxWhy = held ? null : `change forcé ${CASH}→${cashCcy} : le compte ne tient que des birrs et aucun taux de change n'est publié`;
  const shared = {
    ...answer,
    listing,
    cashCurrency: held ? cashCcy : CASH,
    basis:
      `barème de l'ESX (décembre 2024, premier amendement de mai 2026) et directive ECMA n° 996/2024, relus le ${READ_ON} : ` +
      `frais de transaction ESX 0,36 % et frais ECMA 0,15 % du montant, chaque sens sur son montant ; ` +
      `courtage du membre non publié, plafonné à 1,6 % pour les actions du marché principal et de croissance.` +
      (held ? "" : ` Change forcé ${CASH}→${cashCcy} sans taux publié.`),
    confidence:
      `${BROKER} n'imprime aucun courtage : c'est le membre de l'ESX choisi par l'investisseur qui le facture, et aucun taux n'est publié ; ` +
      `1,6 % n'est que le plafond de l'ESX, pas un taux, donc le total reste inconnu. ` +
      `Les frais ESX et ECMA sont dus « sur chaque transaction » : pris à l'achat et à la vente, aucun texte ne les répartit entre acheteur et vendeur. ` +
      `Aucune taxe, aucun minimum, aucun frais de dépositaire publiés : rien n'est ajouté. Les blocs (0,18 %) sont négociés hors carnet, pas dans l'application.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: held ? 0 : null,
    bp: marketBp,
    perShare: marketPerShare,
    sources: { app: APP_PAGE, fees: PAGE, amendment: AMENDMENT_PAGE, regulator: ECMA_PAGE },
  };
  if (loose(listing.brokerExchange) !== loose(EXCHANGE) || listing.currency !== CASH) {
    return { ...shared, why: `${BROKER} ne publie un barème que pour l'${EXCHANGE} en birrs ; ${listing.exchange} ${listing.currency} n'est pas couvert` };
  }
  if (listing.type && listing.type !== "STOCK") {
    return { ...shared, why: `seul le barème des actions est retenu ; ${listing.type} n'est pas couvert` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const capEach = notional * COMMISSION_CAP;
  const esxEach = notional * ESX_FEE;
  const ecmaEach = notional * ECMA_FEE;
  // No published member rate: the commission is unknown, not the cap.
  const commissionUsd = null;
  const leviesUsd = dollars((esxEach + ecmaEach) * 2, listing.currency);
  const fxUsd = held ? 0 : null;
  const brokerFees = plus(commissionUsd, fxUsd);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, leviesUsd);
  const why = [
    `courtage non publié : ${BROKER} n'en imprime aucun et le membre de l'ESX qui exécute l'ordre ne publie pas de taux (l'ESX le plafonne à 1,6 %)`,
    fxWhy,
    usdPer(listing.currency) == null ? `aucun cours ${listing.currency}/USD dans fx.mjs` : null,
    parts.a == null || parts.b == null ? `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` : null,
  ]
    .filter(Boolean)
    .join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(why ? { why } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: {
      rate: null,
      cap: COMMISSION_CAP,
      capBuy: finite(capEach, 8),
      capSell: finite(capEach, 8),
      currency: listing.currency,
      eachWay: true,
    },
    market: {
      esx: finite(esxEach, 8),
      ecma: finite(ecmaEach, 8),
      esxRate: ESX_FEE,
      ecmaRate: ECMA_FEE,
      eachWay: true,
      currency: listing.currency,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      réglementaire: finite(leviesUsd, 6),
      change: fxUsd,
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
  console.log(JSON.stringify(roundTrip({ etf, place, currency, shares: Number(arg("shares", "10")), price: Number(arg("price", "0")) }), null, 2));
}

printCli();
