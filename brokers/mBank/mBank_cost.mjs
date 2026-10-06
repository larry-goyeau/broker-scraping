// What one round trip costs at mBank eMakler: buy n shares at price p, sell
// them back at once, in dollars. Internet orders. The phone line is another
// rate and stays out.
//
// Tariff in force from 20 March 2026, re-read 2026-09-27.
//
//   Poland (GPW and NewConnect), table 3.1
//     shares, ETF, ETC, ETN     0.39 % min 5 zł per order
//     futures and bonds are not this catalogue
//   Abroad, table 7.1
//     every foreign line        0.29 % min 14 zł per order
//
// The 27 June 2026 regulation settles every foreign trade in zlotys, at
// the broker's mid-Reuters rate plus a 0.1 % margin, each way. That margin
// is in the number. The paid brokerage account, which holds EUR, USD and
// GBP, is another product.
//
// Custody of 0.15 % a year on foreign instruments above 1 000 000 zł is not
// a ticket, and neither is the 50 zł account fee for a client who refuses
// electronic mail. IKE and IKZE are another account. Stamp comes from the
// tax map. The tariff names no SEC fee.
//
// Foreign orders go to KBC Bank NV. The execution-policy annex of 13 July
// 2026 also names KBC Securities N.V., Cowen Execution Services Ltd,
// Jane Street Financial Ltd, ATA Invest and J.P. Morgan SE. None of those
// is a US broker-dealer, so no Rule 606 mix is applied.
//
//   https://pdf.mbank.pl/mbankpl/of/gielda/emakler/taryfa_oplat_i_prowizji_biura_maklerskiego_mbanku_w_ramach_uslugi_emakler_obowiazujaca_od_20.03.2026r.pdf
//   https://www.mdm.pl/bm/rynki-zagraniczne
//   https://www.mdm.pl/bm/szczegolne-zasady-wykonywania-zlecen-na-rynkach-zagranicznych
//   https://www.mdm.pl/bm/g/Isam9U_G3kKYobhIiplKJg
//
//   node brokers/mBank/mBank_cost.mjs PLPKO0000016 GPW PLN --shares=10 --price=50
//   node brokers/mBank/mBank_cost.mjs AAPL XNYS USD --shares=10 --price=230
//   node brokers/mBank/mBank_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, listingCash } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("mBank-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://pdf.mbank.pl/mbankpl/of/gielda/emakler/taryfa_oplat_i_prowizji_biura_maklerskiego_mbanku_w_ramach_uslugi_emakler_obowiazujaca_od_20.03.2026r.pdf",
  foreign: "https://www.mdm.pl/bm/rynki-zagraniczne",
  fx: "https://www.mdm.pl/bm/szczegolne-zasady-wykonywania-zlecen-na-rynkach-zagranicznych",
  rules: "https://pdf.mbank.pl/mbankpl/of/gielda/emakler/regulamin_emakler_obowiazujacy_od_27.06.2026.pdf",
  execution: "https://www.mdm.pl/bm/g/Isam9U_G3kKYobhIiplKJg",
  readOn: "2026-09-27",
  tariffOn: "2026-03-20",
  entity: "Biuro maklerskie mBanku, eMakler",
  venue: "KBC Bank NV",
};

const POLISH_RATE = 0.0039;
const POLISH_MIN = 5;
const FOREIGN_RATE = 0.0029;
const FOREIGN_MIN_PLN = 14;
const FX_EACH = 0.001;
const CASH = "PLN";

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

function polishMarket(exchange) {
  const ex = loose(exchange);
  return ex === "GPW" || ex === "XWAR" || ex === "NEWCONNECT";
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

function commissionOf(polish) {
  if (polish) return { rate: POLISH_RATE, min: POLISH_MIN, label: "0.39 % min 5 zł" };
  return { rate: FOREIGN_RATE, min: FOREIGN_MIN_PLN, label: "0.29 % min 14 zł" };
}

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `usd` is the number the page prints. `brokerFees` is the ticket.
 */
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
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue mBank n'existe pas encore : lancer `node brokers/mBank/mBank_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue mBank` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez mBank`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "mbank",
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
  const polish = polishMarket(listing.brokerExchange);
  const rule = commissionOf(polish);
  const converts = listingCash(listing.currency) !== CASH;
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const shared = {
    ...answer,
    listing,
    cashCurrency: CASH,
    remark: "",
    url: SCHEDULE.url,
    basis: `taryfa eMakler du ${SCHEDULE.tariffOn}, relue le ${SCHEDULE.readOn} : ${rule.label} par ordre`,
    tax,
    ccy: QUOTE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    toUsd: (x) => dollars(x, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null
      ? null
      : parts.b == null
        ? null
        : parts.a * notionalUsd + parts.b * n;
  const one = (() => {
    const raw = dollars(notional * rule.rate, listing.currency);
    const floor = dollars(rule.min, CASH);
    if (raw == null || floor == null) return null;
    return Math.max(raw, floor);
  })();
  const commissionUsd = plus(one, one);
  const fxUsd = converts && notionalUsd != null ? notionalUsd * FX_EACH * 2 : converts ? null : 0;
  const brokerFees = plus(commissionUsd, fxUsd);
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const confidence = [
    shared.basis,
    polish ? "marché polonais" : `exécution ${SCHEDULE.venue}, règlement en PLN`,
    converts ? "marge de change 0,1 % à l'aller et au retour" : "ligne en PLN : pas de change",
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? `carnet ${marketPerShare} $ la part`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    commission: { rate: rule.rate, min: rule.min, currency: CASH, eachWay: true },
    bp: marketBp,
    perShare: marketPerShare,
    ...(bookUsd == null
      ? {
          why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`,
        }
      : {}),
    trade: {
      shares: n,
      price: p,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: listing.currency,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      ...(converts ? { change: finite(fxUsd, 6) } : {}),
      taxes: finite(taxUsd, 6),
    },
    confidence,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };

  if (process.argv.includes("--schedule")) {
    console.log(
      JSON.stringify(
        {
          ...SCHEDULE,
          cash: CASH,
          poland: "0.39 % min 5 PLN",
          foreign: "0.29 % min 14 PLN",
          conversion: "0.1 % each way on a foreign line",
          rule606: null,
        },
        null,
        2
      )
    );
    process.exit(0);
  }

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage : node brokers/mBank/mBank_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
    process.exit(2);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const show = (x) => (x == null ? "N/A" : x);
  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) console.log(out.alternatives.join("\n"));
    process.exit(0);
  }
  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}, ${(l.type || "").toLowerCase()}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(`${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}\n`);
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${show(out.brokerFees)} $`);
    const parts = out.parts || {};
    if (parts.marché != null) console.log(`  carnet         : ${parts.marché} $`);
    if (parts.courtage != null) console.log(`  courtage       : ${parts.courtage} $`);
    if (parts.change != null) console.log(`  change         : ${parts.change} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}`);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}
