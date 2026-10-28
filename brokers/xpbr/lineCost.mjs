// One round trip on any line that is not B3, for the brokers whose
// catalogues mix a home exchange with US lines held at a US broker-dealer
// and, for the Brazilian global accounts, the LSE's dollar UCITS ETF lines:
// XP and Rico (../xpbr, ../rico), Inter (../interbr), trii Colombia
// (../triico), GBM (../gbm), VM Wealth (../vmwealth) and TF Capital
// (../tfcapital). Each broker file hands it a `price(ctx)` that reads its
// own tariff; this file finds the line, reads the book, applies the deposit
// rule and adds the parts up, with the contract of
// brokers/investlink/investlink_cost.mjs.
//
// The book. A US line (NYSE, Nasdaq, NYSE Arca, NYSE American, Cboe BZX,
// NYSE Texas) is the 605 effective spread times the 606 Q of the broker's
// US dealer (spreads/rule606.mjs, looked up under the folder name: a folder
// with no alias there gets the quoted NBBO). Any other line reads its own
// venue's leaf (bp or a per-share touch); a venue with no leaf stays N/A.
//
// Deposits. A line whose currency is one of the folder's cash currencies
// (deposits.mjs) pays no FX in the total; the broker's FX rate, when it
// prints one, is the remark `fxRemark`. Otherwise the conversion is forced:
// `forcedFx` (cost of the conversions as a fraction of the amount) goes in
// the total, and with none printed the total is N/A.
//
// price(ctx) receives { row, listing, us, n, p, notional, notionalUsd, plan }
// and returns, all optional but `buy` and `sell`:
//   buy, sell        commission on each side, in `feeCurrency` (default the
//                    listing currency), null when unknown
//   feeCurrency
//   market           exchange and regulator fees for the round trip, same
//                    currency (cess, settlement, levies)
//   regulatoryUsd    US SEC, TAF and CAT for the round trip, in dollars
//   fxRemark         English remark when cash is held in the listing's
//                    currency, e.g. "FX 2.25% when cash ≠ USD."
//   forcedFx         { rate, why } when the listing currency is not held:
//                    rate = fraction of the amount for the conversions of
//                    the round trip; null rate → N/A
//   remark, basis, confidence, why, onlineBuy, url, detail
//
//   import { makeLineCost, printLineCli } from "../xpbr/lineCost.mjs";
//   export const roundTrip = makeLineCost({ folder, name, catalogue, url, price, delegate });
//   printLineCli(roundTrip, import.meta.url);

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, listingCash, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";
import { depositHas } from "../../deposits.mjs";

export const US_MICS = new Set(["XNYS", "XNAS", "ARCX", "BATS", "XASE", "TXSE", "IEXG"]);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
export const dollars = (amount, currency) => {
  if (amount == null || Number.isNaN(amount)) return null;
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};
export const cents = (x) => Math.round(x * 100 + Number.EPSILON) / 100;
// Up to the cent, as a US clearing firm rounds each regulatory fee.
export const upCent = (x) => (x > 0 ? Math.ceil(x * 100 - 1e-9) / 100 : 0);

// options:
//   folder, name, catalogue (URL), url (fee page)
//   rule606     key for spreads/rule606.mjs (default the folder)
//   price(ctx)  see the header
//   delegate(row) → another roundTrip for that row (the B3 lines), or null
//   plans       { id: label } when the broker has subscriptions; query.plan
//   defaultPlan
//   base        the account currency shown when the line is a forced conversion
export function makeLineCost({ folder, name, catalogue: catalogueUrl, url, rule606 = folder, price, delegate = null, plans = null, defaultPlan = null, base = "" }) {
  const catalogue = fs.existsSync(catalogueUrl) ? JSON.parse(fs.readFileSync(catalogueUrl, "utf8")) : null;
  const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
  if (rows.length) warmListingIndex(rows);

  function findListing({ etf, place, currency }) {
    const asked = loose(etf);
    const wantVenue = place ? resolveVenue({ exchange: place, mic: place, currency }).venue : null;
    const wantPlace = loose(place);
    const wantCurrency = code(currency);
    const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
    const matches = named
      .map((r) => ({ row: r, ...listingKey(r) }))
      .filter((m) => {
        if (!wantPlace) return true;
        if (loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace) return true;
        return Boolean(wantVenue && m.venue && m.venue.mic === wantVenue.mic);
      })
      .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
    return { named, matches };
  }

  function roundTrip(query) {
    const { etf, place, currency, shares, price: px, bp = null, perShare = null } = query;
    const planId = plans ? String(query.plan || defaultPlan || "").toLowerCase() : null;
    const answer = {
      usd: null,
      brokerFees: null,
      ccy: QUOTE,
      etf,
      place,
      currency,
      ...(plans ? { plan: planId } : {}),
      onlineBuy: true,
      cashCurrency: "",
      url,
      remark: "",
    };
    if (plans && !plans[planId]) return { ...answer, why: `formule inconnue chez ${name} : ${query.plan}` };
    if (!catalogue) {
      return { ...answer, why: `le catalogue ${name} n'existe pas encore : lancer \`node brokers/${folder}/${folder}_scraping.mjs\`` };
    }
    const { named, matches } = findListing({ etf, place, currency });
    if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue ${name}` };
    if (!matches.length) {
      return {
        ...answer,
        why: `${etf} n'est pas coté sur cette place dans cette devise chez ${name}`,
        alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
      };
    }
    const m = matches[0];
    const other = delegate ? delegate(m.row) : null;
    if (other) return other({ ...query, place: m.row.exchange, currency: m.row.currency });

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
      mic: book.mic ?? m.venue?.mic ?? m.row.mic ?? null,
      exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
      currency: code(m.row.currency),
      brokerExchange: m.row.exchange || null,
    };
    const us = US_MICS.has(code(m.row.mic)) || US_MICS.has(code(listing.mic));
    const quoted = us ? usBookPerShare({ broker: rule606, ticker: listing.ticker, fallback: book.leaf?.perShare ?? null }) : null;
    const marketPerShare = perShare ?? (us ? quoted : book.leaf?.perShare ?? null);
    const marketBp = bp ?? (us || marketPerShare != null ? null : book.leaf?.bp ?? null);
    const parts = bookParts({
      bp: marketBp,
      perShare: marketPerShare,
      venue: us ? { source: "us605" } : m.venue,
      unsourced: m.unsourced,
      toUsd: (value) => dollars(value, listing.currency),
    });
    const tax = taxesOf(listing.isin);
    const taxTotal = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
    const cash = listingCash(listing.currency);
    const held = depositHas(folder, plans ? planId : null, cash);
    const shared = {
      ...answer,
      listing,
      cashCurrency: held ? cash : base,
      bp: marketBp,
      perShare: marketPerShare,
      tax,
      fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    };

    const n = Number(shares);
    const p = Number(px);
    if (!(n > 0 && p > 0)) {
      return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
    }
    const notional = n * p;
    const notionalUsd = dollars(notional, listing.currency);
    const t = price({ row: m.row, listing, us, n, p, notional, notionalUsd, plan: planId, held }) || {};
    const feeCcy = code(t.feeCurrency || listing.currency);
    const commission = t.buy == null || t.sell == null ? null : t.buy + t.sell;
    const brokerFees = commission == null ? null : dollars(commission, feeCcy);
    const marketUsd = t.market ? dollars(t.market, feeCcy) : 0;
    const regulatoryUsd = t.regulatoryUsd || 0;
    const bookUsd =
      parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
    const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
    let fxUsd = 0;
    let fxWhy = "";
    if (!held) {
      const rate = t.forcedFx?.rate;
      if (rate == null) {
        fxUsd = null;
        fxWhy = t.forcedFx?.why || `change forcé non publié : ${cash} n'est pas une devise de dépôt chez ${name}, et aucun taux n'est imprimé`;
      } else {
        fxUsd = notionalUsd == null ? null : notionalUsd * rate;
      }
    }
    const usd = plus(bookUsd, brokerFees, marketUsd, regulatoryUsd, taxUsd, fxUsd);
    const remark = [t.remark, held ? t.fxRemark : "", m.row.remark].filter(Boolean).join(" ");
    const why = [
      t.why,
      commission == null && !t.why ? `courtage ${name} inconnu pour cette ligne` : "",
      fxWhy,
      bookUsd == null ? `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || (us ? "pas de 605 pour ce ticker" : "pas de feuille de carnet")}` : "",
    ]
      .filter(Boolean)
      .join(" ; ");
    const confidence = [
      t.basis,
      t.confidence,
      us ? `carnet américain : 605 × Q du 606 (${rule606}), sinon NBBO coté` : "",
      held ? `compte en ${cash} : aucun change` : t.forcedFx?.rate != null ? `change forcé ${(100 * t.forcedFx.rate).toFixed(2).replace(".", ",")} % du montant` : "",
      marketPerShare != null
        ? `carnet ${marketPerShare} ${us ? "$" : listing.currency} la part`
        : marketBp != null
          ? `carnet ${Number(Number(marketBp).toPrecision(4))} pb`
          : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
    ]
      .filter(Boolean)
      .join(" ; ");

    return {
      ...shared,
      url: t.url || url,
      onlineBuy: t.onlineBuy ?? true,
      remark,
      basis: t.basis || "",
      usd: finite(usd, 6),
      brokerFees: finite(brokerFees, 6),
      ...(why ? { why } : {}),
      trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
      commission: { buy: finite(t.buy, 8), sell: finite(t.sell, 8), currency: feeCcy, eachWay: true, ...(t.detail || {}) },
      parts: {
        marché: finite(bookUsd, 6),
        courtage: finite(brokerFees, 6),
        bourse: finite(marketUsd, 6),
        réglementaire: finite(regulatoryUsd, 6),
        change: finite(fxUsd, 6),
        taxes: finite(taxUsd, 6),
      },
      confidence,
    };
  }
  if (plans) roundTrip.plans = Object.keys(plans);
  return roundTrip;
}

// node <file> TICKER PLACE CCY --shares= --price= [--plan=]
export function printLineCli(roundTrip, metaUrl) {
  let called = false;
  try {
    called = metaUrl === pathToFileURL(process.argv[1]).href;
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
