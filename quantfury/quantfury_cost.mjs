// What one round trip costs at Quantfury: buy n shares at price p, sell them
// back at once.
//
//   coût (USD) = a × toUsd(p) × n + b × n + c
//
// `a` is a fraction of the amount. `b` and `c` are dollars, the same unit the
// other `*_cost.mjs` files answer in.
//
// Quantfury charges nothing, and says so in the one place that binds it: the
// client agreement, §13, "provided without commissions, leverage fees, and/or
// any other kind of fee to clients; and all trading positions are available to
// trade and invest at the real time spot bid and ask prices of the relevant
// exchange". So `c` is 0, there is no ticket to put in it, and the whole cost
// of a trip is the book the client crosses: buy at the ask, sell at the bid.
//
// That is not a broker absorbing a cost, it is the business model. Quantfury
// pairs a client's buy at the ask with another client's sell at the bid and
// keeps the difference, on prices it does not widen. The spread the client
// pays is therefore the exchange's own, which is exactly what `spread.json`
// and the Rule 605 tape already measure — so `a` and `b` are the book and
// nothing else is added on top.
//
// What is deliberately not zero:
//
//   taxes       A transfer tax follows the instrument, not the price list.
//               British stamp duty is owed by whoever acquires the shares and
//               the French and Italian FTT by whoever acquires the line,
//               wherever the two orders met. Quantfury publishes no tax line
//               and §56 leaves every tax to the client, so these rates come
//               from the tax map, not from a charge anyone has seen debited.
//               On a London share the 0.5 % dwarfs the book many times over.
//
// What is zero and sourced, rather than merely unseen:
//
//   commission  §13 above, and the pricing page: no trade commission.
//   change      No conversion fee. The eight base currencies (USD, EUR, CHF,
//               BRL, MXN, ARS, COP …) cover every currency in this catalogue,
//               and what conversion there is sits in the rate, not in a line.
//   SEC / TAF   Those are levied on US exchanges and FINRA members for covered
//               sales. Quantfury is a Bahamas entity (SCB) matching its own
//               clients, not a US broker-dealer passing a fee through, and it
//               publishes no such pass-through. Unlike stamp duty, this is a
//               charge on the venue, not a tax on the buyer.
//   portage     No overnight or borrowing fee, even with leverage. The
//               catalogue holds only unleveraged lines anyway — the scraper
//               keeps t=1 shares, t=5 spot crypto and t=6 funds, and drops
//               the futures and currency contracts.
//
// The crypto lines used to be the one place `a = 0` understated the bill, for
// want of a tape. `spread.mjs` now reads both books this broker names, Binance
// and Coinbase, so a coin costs what the spot market charged to cross it — BTC
// 0.0013 bp, ADA around 5 — and only a coin neither exchange lists against the
// dollar is left N/A, which is not the same as free.
//
// A client owns what he buys without leverage and may transfer it out (§11),
// so this is a real holding, not a contract on one.
//
//   https://quantfury.com/trading-and-investing-conditions/
//   https://quantfury.com/business-model/
//   https://quantfury.com/quantfury-client-agreement.pdf
//
//   node quantfury/quantfury_cost.mjs AAPL
//   node quantfury/quantfury_cost.mjs HSBA LSE GBP --shares=100
//   node quantfury/quantfury_cost.mjs TTE EURONEXT EUR --shares=10 --price=60
//   node quantfury/quantfury_cost.mjs BTC
//   node quantfury/quantfury_cost.mjs --schedule
//
// `roundTripCost(...)` reads files, not the network.

import fs from "node:fs";
import { cryptoId, listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite, bookParts } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("quantfury-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  conditions: "https://quantfury.com/trading-and-investing-conditions/",
  model: "https://quantfury.com/business-model/",
  agreement: "https://quantfury.com/quantfury-client-agreement.pdf",
  readOn: "2026-09-12",
  entity: "Quantfury Trading Americas Limited",
  regulator: "Securities Commission of The Bahamas",
};

// Every one of these is a published zero, not an unknown treated as free.
const COMMISSION_EACH = 0;
const TICKET = 0;
const FX_MARKUP = 0;
const SEC_RATE = 0;
const TAF_PER_SHARE = 0;

const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);
const US_EX = new Set(["NASDAQ", "NYSE", "AMEX", "ARCA", "CBOE", "BATS", "OTC"]);

const CRYPTO_REMARK = "Écart Binance/Coinbase non publié ici.";

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const isCrypto = (row) => row?.type === "CRYPTO" || /^CRYPTO$/i.test(String(row?.exchange || ""));
const cryptoBase = (ticker) => String(ticker || "").split("/")[0].toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
};

const fxNote = (currency) => ({
  quote: QUOTE,
  asOf: FX_AS_OF,
  listing: usdPer(currency),
});

export function isAmerican(row, mic) {
  return US_MICS.has(String(mic || "").toUpperCase()) || US_EX.has(loose(row?.exchange));
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rows.filter((r) => {
    if (loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked) return true;
    return isCrypto(r) && loose(cryptoBase(r.ticker)) === asked;
  });

  const crypto = named.filter(isCrypto);
  if (crypto.length && (!place || /crypto/i.test(place))) {
    const row =
      (wantCurrency && crypto.find((r) => String(r.currency).toUpperCase() === wantCurrency)) ||
      crypto.find((r) => String(r.currency).toUpperCase() === "USD") ||
      crypto[0];
    const { venue, unsourced } = listingKey(row);
    return { named, matches: [{ row, venue, unsourced }] };
  }

  const matches = named
    .filter((r) => !isCrypto(r))
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      // The catalogue files Paris, Amsterdam, Brussels and Lisbon under the
      // one operator name Quantfury prints.
      if (
        wantVenue &&
        ["XPAR", "XAMS", "XBRU", "XLIS"].includes(wantVenue.mic) &&
        loose(m.row.exchange) === "EURONEXT"
      ) {
        return true;
      }
      return loose(m.row.exchange) === wantPlace || loose(m.row.exchange).includes(wantPlace);
    })
    .filter((m) => !wantCurrency || String(m.row.currency || "").toUpperCase() === wantCurrency);

  return { named, matches };
}

const listAlternatives = (named) =>
  named
    .map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "place non dite"}`)
    .slice(0, 12);

function coverage() {
  if (!rows.length) return null;
  const out = {};
  for (const r of rows) {
    const type = r.type || "?";
    const { venue, unsourced } = listingKey(r);
    const book = isCrypto(r)
      ? { leaf: null, mic: null }
      : spreadLeaf(spreads, {
          isin: r.isin,
          mic: venue?.mic ?? null,
          currency: r.currency,
          unsourced,
        });
    const slot = (out[type] ||= { n: 0, withBook: 0, taxed: 0 });
    slot.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) slot.withBook += 1;
    if (Object.keys(taxRates(taxesOf(r.isin))).length) slot.taxed += 1;
  }
  return out;
}

function taxParts(isin) {
  const tax = taxesOf(isin);
  const rates = taxRates(tax);
  // The PTM levy is a flat pound on large London tickets, not a rate on the
  // amount, and Quantfury never fronts it.
  delete rates.PTM_LEVY;
  const taxTotal = Object.values(rates).reduce((sum, rate) => sum + rate, 0);
  return { tax, rates, taxTotal };
}

export function roundTripCost({ etf, place, currency, bp = null, perShare = null }) {
  const { named, matches } = findListing({ etf, place, currency });
  const answer = {
    a: null,
    b: null,
    c: TICKET,
    ccy: QUOTE,
    floor: null,
    cap: null,
    threshold: null,
    etf,
    place,
    currency,
  };

  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue Quantfury n'existe pas encore : lancer `node quantfury/quantfury_scraping.mjs`",
    };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Quantfury` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Quantfury`,
      alternatives: listAlternatives(named),
    };
  }

  const m = matches[0];
  const crypto = isCrypto(m.row);
  // A coin is looked up by its base rather than by an ISIN it does not have. Quantfury
  // names Binance and Coinbase as the prices it pairs clients on, and `spreadLeaf`
  // answers with the wider of the two, which is the book a client could have met.
  const book = spreadLeaf(spreads, {
    isin: crypto ? cryptoId(cryptoBase(m.row.ticker)) : m.row.isin,
    mic: crypto ? null : (m.venue?.mic ?? null),
    currency: m.row.currency,
    unsourced: m.unsourced,
  });

  const listing = {
    isin: String(m.row.isin || "").toUpperCase() || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || "").toUpperCase(),
    brokerExchange: m.row.exchange || null,
  };

  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const american = isAmerican(m.row, listing.mic);
  const { tax, rates, taxTotal } = crypto
    ? { tax: null, rates: {}, taxTotal: 0 }
    : taxParts(listing.isin);

  const mkt = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    // No crypto sentinel any more: a coin whose book was read carries it, and one
    // neither exchange lists is unknown rather than free. Passing the sentinel would
    // turn that second case into a zero, which is what this file used to do.
    unsourced: crypto ? null : m.unsourced,
    toUsd: (x) => (american ? x : dollars(x, listing.currency)),
  });

  return {
    ...answer,
    a: finite(plus(mkt.a, taxTotal, SEC_RATE, COMMISSION_EACH * 2, FX_MARKUP), 4),
    b: finite(plus(mkt.b, TAF_PER_SHARE), 6),
    c: TICKET,
    listing,
    feeMarket: crypto ? "crypto" : american ? "us" : "autre",
    remark: crypto && marketBp == null ? CRYPTO_REMARK : "",
    parts: {
      marché:
        marketBp != null
          ? Number((marketBp / 1e4).toPrecision(4))
          : marketPerShare != null
            ? `${marketPerShare} par part`
            : null,
      taxes: Object.keys(rates).length ? rates : null,
      réglementaire: null,
      commission: 0,
      change: null,
    },
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.conditions,
    basis: `conditions Quantfury (aucun frais), lues le ${SCHEDULE.readOn}`,
    tax,
    commission: {
      rate: COMMISSION_EACH,
      min: 0,
      cap: null,
      flat: null,
      currency: QUOTE,
      eachWay: true,
    },
    ccy: QUOTE,
    fx: fxNote(listing.currency),
    fxIfConverted: FX_MARKUP,
    confidence: confidenceOf({ crypto, leaf, marketBp, marketPerShare, taxTotal, tax, american }),
  };
}

// Nothing here is billed, so the exact cost of a trip is the book alone. It is
// kept so the CLI can print the same shape as the brokers that do bill.
export function exactCost({ shares, price, bp = null, perShare = null }) {
  const amount = shares * price;
  const market = ((bp ?? 0) / 1e4) * amount + (perShare ?? 0) * shares;
  return {
    commission: 0,
    market: finite(market, 6),
    currency: QUOTE,
  };
}

function confidenceOf({ crypto, leaf, marketBp, marketPerShare, taxTotal, tax, american }) {
  const lines = [
    `aucun frais publié chez Quantfury : ni commission, ni change, ni portage (accord client §13, lu le ${SCHEDULE.readOn})`,
  ];

  if (crypto && marketBp != null) {
    lines.push(
      "crypto : Quantfury reprend le spot Binance / Coinbase, et le coût est la touche de ces carnets, lue à la plus large des deux quand les deux cotent la pièce"
    );
  } else if (crypto) {
    lines.push(
      "crypto : ni Binance ni Coinbase ne cote cette pièce contre le dollar, donc le carnet reste N/A plutôt que 0"
    );
  } else if (marketBp == null && marketPerShare == null) {
    lines.push("pas de feuille de carnet pour cet ISIN / cette place : le spread reste N/A");
  } else {
    lines.push(
      `le coût est le carnet croisé, ${american ? "mesuré sur la bande 605" : "lu dans spread.json"}, ` +
        "puisque Quantfury exécute au bid et à l'ask de la place sans les élargir"
    );
  }

  if (taxTotal > 0) {
    lines.push(
      `taxe de transfert ${(100 * taxTotal).toFixed(2)} % ${tax?.country ? `(${tax.country}) ` : ""}` +
        "prise dans la carte des taxes : Quantfury n'en publie aucune et laisse l'impôt au client (§56), " +
        "mais le droit suit le titre et non le tarif du courtier" +
        (marketBp ? `, et il pèse ${((1e4 * taxTotal) / marketBp).toFixed(0)} fois le carnet` : "")
    );
  }

  lines.push("ni SEC ni TAF : entité bahaméenne appariant ses propres clients, pas un courtier américain qui répercute");
  lines.push("aucun aller-retour réel dans ce dépôt");
  if (!crypto && !leaf) lines.push("carnet absent, le chiffre ci-dessus ne tient qu'aux taxes");

  return lines.join(" ; ");
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
          commissionEachWay: COMMISSION_EACH,
          ticket: TICKET,
          fxMarkup: FX_MARKUP,
          secRate: SEC_RATE,
          tafPerShare: TAF_PER_SHARE,
          coverage: coverage(),
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
    console.error(
      "usage : node quantfury_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--json]\n" +
        "        node quantfury_cost.mjs --schedule\n" +
        "  ex.   node quantfury_cost.mjs AAPL\n" +
        "        node quantfury_cost.mjs HSBA LSE GBP --shares=100\n" +
        "        node quantfury_cost.mjs TTE EURONEXT EUR --shares=10 --price=60"
    );
    process.exit(2);
  }

  const out = roundTripCost({
    etf,
    place,
    currency,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const show = (x) => (x == null ? "N/A" : x);

  if (out.a == null && !out.listing) {
    console.log(`a = N/A   b = ${show(out.b)}   c = ${show(out.c)}\n${out.why}`);
    if (out.alternatives?.length) {
      console.log(`\nce que Quantfury propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}\n`);

  // A book quoted per share belongs to `b`; only a book quoted as a fraction
  // of the amount belongs next to `a`.
  const detail = [];
  if (out.bp != null) detail.push(`carnet ${out.parts.marché}`);
  for (const [name, rate] of Object.entries(out.parts?.taxes ?? {})) detail.push(`${name} ${rate}`);

  console.log(`a = ${show(out.a)}   (au prorata${detail.length ? " : " + detail.join(" + ") : " : rien"})`);
  console.log(
    `b = ${show(out.b)} $   (par part${out.b ? ` : carnet ${out.perShare != null ? "605" : "converti"}` : " : rien"})`
  );
  console.log(`c = ${show(out.c)} $   (par ordre : aucun ticket)`);

  const fx = out.fx?.listing ?? usdPer(l.currency);
  console.log(
    `\ncoût = ${show(out.a)} × p × n × ${fx != null ? Number(fx.toPrecision(6)) : "?"} + ` +
      `${show(out.b)} × n + ${show(out.c)}   ($ ; p en ${l.currency})`
  );
  console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);

  const n = Number(flag("shares"));
  const p = Number(flag("price"));
  if (n > 0 && p > 0) {
    const amount = n * p;
    const amountUsd = toUsd(amount, l.currency);
    const affine = plus(
      out.a == null || amountUsd == null ? null : out.a * amountUsd,
      out.b == null ? null : out.b * n,
      out.c
    );
    console.log(
      `\n${n} part${n > 1 ? "s" : ""} à ${p} ${l.currency} = ${amount.toFixed(2)} ${l.currency}` +
        (amountUsd != null ? ` (${amountUsd.toFixed(2)} $)` : "")
    );
    console.log(`  a, b, c        : ${affine == null ? "N/A" : `${affine.toFixed(4)} $`}`);
    console.log(`  commission     : 0 $`);
  }

  if (out.url) console.log(`\n${out.url}`);
}
