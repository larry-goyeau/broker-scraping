// What one round trip costs at MAC African SGI, an Abidjan SGI (MAC SA
// group): buy n shares on the BRVM, sell them straight back, in dollars.
// Every catalogue line is a franc CFA (XOF) line and the account is held
// in XOF, so nothing is converted. Self-directed account (gestion libre).
//
// https://www.brvm.org/sites/default/files/decision_pcr_sg_da_2020_050_portant_homologation_des_tarifs_de_mac_african_sgi.pdf
// read on 2026-10-18: Décision PCR/SG/DA/2020/050 of 27 March 2020, the
// regulator's approval of MAC African's "conditions générales de
// tarification", the latest on the BRVM site (it follows 2019/072 and
// 2020/025). The site itself says its pricing is "accessible" and prints
// no grid. Secondary market:
//   Courtage, ordinary transactions   0.90 % of the transaction amount,
//                                     each side.
//   Courtage, "sur dossier"           0.80 %, not an online order.
//   Conservation                      0.50 % of the portfolio up to 500
//                                     million FCFA, 0.35 % to 1 billion,
//                                     0.25 % above; no period printed.
//   Tenue de compte                   10,000 FCFA a line ("Forfait par
//                                     ligne"), no period printed.
//   Transfer of securities            34,375 FCFA a line (not a trade).
// The exchange lines are the BRVM's own, https://www.brvm.org/fr/node/312
// read the same day: BRVM 0.2 % and DC/BR 0.1 % of the transaction,
// payable by the buyer and by the seller. They are in usd, not in
// brokerFees. The tariff prints no tax on the commission, but an Ivorian
// SGI's commission pays the TOB, "10 % sur une base hors taxes" (Code
// général des impôts, art. 395 and 401), and the other Abidjan SGIs file
// their courtage HT (Bridge Securities, ASWA, BSIC Capital; NSIA Finance
// prints a 10 % TOB line). It is added on the commission, each side, with
// the levies; not on the BRVM and DC/BR lines.
//   https://a-tla.org/cote-divoire/code-general-des-impots
// The BRVM book is not stored, so the total stays unknown until it is.
//
//   node brokers/macafrican/macafrican_cost.mjs SNTS BRVM XOF --shares=10 --price=25000
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("macafrican-parsed.json", import.meta.url);
const PAGE = "https://www.brvm.org/sites/default/files/decision_pcr_sg_da_2020_050_portant_homologation_des_tarifs_de_mac_african_sgi.pdf";
const BRVM_PAGE = "https://www.brvm.org/fr/node/312";
const READ_ON = "2026-10-18";
const BROKER = "MAC African";
const COURTAGE = 0.009;
const BRVM = 0.002;
const DCBR = 0.001;
const TOB = 0.1;
const CASH = "XOF";
const REMARK = "Custody 0.50% of the portfolio up to 500M FCFA (0.35%, 0.25% above), period not stated. Account keeping 10,000 FCFA a line, period not stated.";

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
    remark: REMARK,
  };
  if (!catalogue) {
    return { ...answer, why: `le catalogue ${BROKER} n'existe pas encore : lancer \`node brokers/macafrican/macafrican_scraping.mjs\`` };
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
    broker: "macafrican",
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
  const shared = {
    ...answer,
    listing,
    basis:
      `tarifs homologués ${BROKER} relus le ${READ_ON} : courtage 0,90 % du montant chaque sens. ` +
      `TOB 10 % sur le courtage. Commissions BRVM 0,2 % et DC/BR 0,1 % du montant, à l'achat et à la vente.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    bp: marketBp,
    perShare: marketPerShare,
    sources: { fees: PAGE, market: BRVM_PAGE },
  };
  if (listing.currency !== CASH || listing.mic !== "XBRV") {
    return { ...shared, why: `${BROKER} ne publie un barème que pour la BRVM en francs CFA ; ${listing.exchange} ${listing.currency} n'est pas couvert` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const each = notional * COURTAGE;
  const marketEach = notional * (BRVM + DCBR);
  const brokerFees = dollars(each * 2, listing.currency);
  const tobEach = each * TOB;
  const levies = dollars((marketEach + tobEach) * 2, listing.currency);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, levies);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { rate: COURTAGE, each, buy: each, sell: each, currency: listing.currency, eachWay: true },
    market: { brvm: notional * BRVM, dcbr: notional * DCBR, tob: tobEach, eachWay: true, currency: listing.currency },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      réglementaire: finite(levies, 6),
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
