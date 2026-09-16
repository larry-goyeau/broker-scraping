// What one round trip costs at Century Trader: buy n shares at price p, sell
// them back at once, in dollars.
//
// The affine triple this file used to answer — a × p × n + b × n + c — hid the
// ticket. The US floor is 4 € a side, and on a retail size that floor is the
// whole bill. The old file computed it, left it in a `floor` field the page had
// no column for, and set `c` to zero, so every American trip under ~400 shares
// was understated by the eight euros actually taken. Above 400 shares the
// 0.01 € / unit is no longer a ticket: five hundred shares pay 5 € a side, and
// the affine answer never said so. `roundTrip` is given the size and charges
// what is charged.
//
// Century Financial Consultancy LLC (AE, CMA). The catalogue is Century Trader
// (`liveapp.century.ae`, `century_scraping.mjs`): 941 lines on 2026-09-15 —
// 864 USD, 75 HKD, 2 SAR. Currency pairs are dropped. CLOSE ONLY is skipped.
// The site still calls the lines share CFDs; every card prints Type Shares,
// margin 100 %, dealer spread 0, holding 0 % (received). A same-day trip
// therefore carries no overnight. The public shares page also sells DMA to
// DFM and ADX, and names UK, German and Chinese stocks: none of those are in
// this book, and this file does not invent a neighbour's tier for them.
//
// The card is the schedule, re-read on 2026-09-15 from GETPRODUCTDETAILS:
//
//   USD   0.01 EUR per Unit (4 USD min)   — every US card sampled
//   HKD   0.5 % per Unit (20 USD min)     — every HK card sampled
//   SAR   "-"                             — both Saudi names, not copied as a number
//
// A live NIO trip on a EUR cash account (2026-09-09) charged the floor in
// euros, not in dollars: history Commission −4 € each way, cash 20.00 → 12.76
// → 11.99, stock P&L −0.01, no SEC, no TAF, no VAT on the ticket, no separate
// FX line. The card still prints "4 USD min". The number follows the debit.
//
// Two printed schedules are therefore left out of the number, on purpose.
// The August 2026 Schedule of Charges still writes US CFDs and cash TSLA.EQ
// at 0.32 $ / share, 10 $ minimum, "SEC and TAF included". The cash-equities
// marketing page writes 1 ¢ / share, 4 $ minimum, and "128 US stocks". The
// Trader book in front of this file is 864 US lines including ETFs, the card
// is 0.01 €, and the trip paid 4 € with neither levy. Charge the portal.
//
// What is in the number: the commission each way at its floor; the market
// spread, once. What is not: stamp duty and FTT (these are CFDs — the client
// does not acquire the share); SEC and TAF (measured zero); a conversion
// markup (schedule §2.10 allows one when account and product currencies
// differ; the EUR trip converted the stock and showed no extra line); overnight
// (0 % on the card, and this trip does not hold); inactivity (10 $ / month
// after 12 months idle); market-data subscriptions. Bank transfers in and out
// are free in as many words.
//
// The scrape names no US tape, only the settlement currency. The US underlying
// book is Rule 605, found by trying the NMS MICs. Hong Kong and Tadawul have
// no sourced book in this deposit, so those lines answer N/A on the total
// whenever the book is the missing piece — the commission itself is still
// returned under `brokerFees` where the card printed one.
//
//   https://liveapp.century.ae/
//   https://www.century.ae/en/shares-trading/
//   https://www.century.ae/custom_scripts/pdfs/web/cfc-schedule-of-charges.pdf
//
//   node century/century_cost.mjs AAPL --shares=1 --price=230
//   node century/century_cost.mjs AAPL NASDAQ USD --shares=500 --price=230
//   node century/century_cost.mjs 1772 HKEX HKD --shares=200 --price=30
//   node century/century_cost.mjs 1120 TADAWUL SAR --shares=1 --price=100
//   node century/century_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";

const CATALOGUE = new URL("century-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://liveapp.century.ae/",
  shares: "https://www.century.ae/en/shares-trading/",
  cashEquities: "https://www.century.ae/en/cash-equities/",
  charges: "https://www.century.ae/custom_scripts/pdfs/web/cfc-schedule-of-charges.pdf",
  readOn: "2026-09-15",
  pdf: "2026-08",
  entity: "Century Financial Consultancy LLC (AE), Century Trader",
};

const US_MICS = ["XNAS", "XNYS", "ARCX", "XASE", "BATS"];
const MARKET_NAME = { us: "USA", hk: "Hong Kong", sa: "Tadawul" };
const MARKET_RANK = { us: 0, hk: 1, sa: 2 };

const CHECK = {
  isin: "US62914V1061",
  ticker: "NIO",
  query: "NIO.EQ",
  accountCcy: "EUR",
  n: 1,
  buy: { price: 3.765, commission: -4, dealId: 4091523 },
  sell: { price: 3.76, commission: -4, pnl: -0.01, dealId: 4091528 },
  cash: { start: 20, afterBuy: 12.76, end: 11.99 },
  commissionPaid: 8,
  feePaid: 0,
  on: "2026-09-09",
};

const RULE = {
  us: { perShare: 0.01, perShareCcy: "EUR", min: 4, minCcy: "EUR" },
  hk: { rate: 0.005, min: 20, minCcy: "USD" },
  sa: { rate: null, min: null, minCcy: "USD" },
};

const WITHDRAW = { bank: 0, inactivity: { afterMonths: 12, monthly: 10, ccy: "USD" } };

const PLACE_OF = {
  us: ["US", "USA", "USD", "NASDAQ", "NYSE", "AMEX", "ARCA", "BATS", "XNAS", "XNYS", "ARCX"],
  hk: ["HKEX", "HONGKONG", "HK", "HKD", "XHKG", "SEHK"],
  sa: ["TADAWUL", "SAUDI", "XSAU", "SAR"],
};

const EXCHANGE_OF = { us: "NASDAQ", hk: "HKEX", sa: "TADAWUL" };

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
};

const fxNote = (currency) => ({
  quote: QUOTE,
  asOf: FX_AS_OF,
  listing: usdPer(currency),
});

export function feeMarketOf(row) {
  const ccy = String(row?.currency || "").toUpperCase();
  if (ccy === "USD") return "us";
  if (ccy === "HKD") return "hk";
  if (ccy === "SAR") return "sa";
  return null;
}

const houseName = (row) => loose(row.query).replace(/(HKEQ|EQ|SA)$/, "");

function venueRow(row) {
  const market = feeMarketOf(row);
  return { ...row, exchange: row.exchange || EXCHANGE_OF[market] || row.exchange };
}

function usBook(isin, currency) {
  const id = String(isin || "").toUpperCase();
  const ccy = String(currency || "USD").toUpperCase();
  for (const mic of US_MICS) {
    const leaf = spreads[id]?.[mic]?.[ccy];
    if (leaf && (leaf.bp != null || leaf.perShare != null)) return { leaf, mic };
  }
  return { leaf: null, mic: null };
}

function namedRow(row, asked) {
  return (
    loose(row.isin) === asked ||
    loose(row.ticker) === asked ||
    loose(row.query) === asked ||
    houseName(row) === asked
  );
}

function placeOk(market, wantVenue, wantPlace) {
  if (!wantPlace) return true;
  if (wantVenue && market === "us" && US_MICS.includes(wantVenue.mic)) return true;
  return (PLACE_OF[market] || []).some((alias) => loose(alias) === wantPlace);
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rows.filter((r) => namedRow(r, asked));
  const matches = named
    .map((r) => ({ row: r, ...listingKey(venueRow(r)) }))
    .filter((m) => placeOk(feeMarketOf(m.row), wantVenue, wantPlace))
    .filter((m) => !wantCurrency || String(m.row.currency || "").toUpperCase() === wantCurrency);

  // NIO is both NIO.EQ (USD) and NIO.HK.EQ. With no place asked, the US line
  // is the one the book is built around — 864 of 941 rows — not whichever
  // happened to be scraped first.
  if (!wantPlace && !wantCurrency) {
    matches.sort(
      (a, b) => (MARKET_RANK[feeMarketOf(a.row)] ?? 9) - (MARKET_RANK[feeMarketOf(b.row)] ?? 9)
    );
  }

  return { named, matches };
}

const listAlternatives = (named) =>
  named
    .map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${MARKET_NAME[feeMarketOf(r)] || "place non dite"}`)
    .slice(0, 12);

function bookOf(row, venue) {
  const market = feeMarketOf(row);
  if (market === "us") return usBook(row.isin, row.currency);
  return spreadLeaf(spreads, {
    isin: row.isin,
    mic: venue?.mic ?? null,
    currency: row.currency,
    unsourced: listingKey(venueRow(row)).unsourced,
  });
}

function coverage() {
  if (!rows.length) return null;
  const out = {};
  for (const r of rows) {
    const type = r.type || "?";
    const market = feeMarketOf(r) || "?";
    const book = bookOf(r);
    const slot = (out[type] ||= { n: 0, withBook: 0, byMarket: {} });
    slot.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) slot.withBook += 1;
    const mk = (slot.byMarket[market] ||= { n: 0, withBook: 0 });
    mk.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) mk.withBook += 1;
  }
  return out;
}

/**
 * One side, in the currency the card bills. `charged` is what leaves the
 * account; `raw` is the percentage or per-share amount before the floor.
 */
export function commissionSide({ shares, amount, market, currency }) {
  const rule = RULE[market];
  if (!rule || (rule.rate == null && rule.perShare == null)) return null;

  if (rule.perShare != null) {
    if (shares == null || !Number.isFinite(Number(shares))) return null;
    const raw = rule.perShare * Number(shares);
    const charged = Math.max(rule.min, raw);
    return { raw, charged, floored: raw < rule.min, currency: rule.perShareCcy || rule.minCcy };
  }

  const notion = toUsd(amount, currency);
  if (notion == null || !Number.isFinite(notion)) return null;
  const raw = notion * rule.rate;
  const charged = Math.max(rule.min, raw);
  return { raw, charged, floored: raw < rule.min, currency: rule.minCcy };
}

/**
 * The whole bill for buying `shares` at `price` and selling them straight back.
 * `usd` is the number the page prints; `brokerFees` is the commission alone.
 */
export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
  const answer = { usd: null, brokerFees: null, etf, place, currency, onlineBuy: true, cashCurrency: "" };

  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue Century n'existe pas encore : lancer `node century/century_scraping.mjs` avec liveapp.century.ae ouvert",
    };
  }

  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Century` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Century`,
      alternatives: listAlternatives(named),
    };
  }

  const m = matches[0];
  const market = feeMarketOf(m.row);
  const rule = RULE[market];
  const book = bookOf(m.row, m.venue);
  const listing = {
    isin: String(m.row.isin || "").toUpperCase(),
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: MARKET_NAME[market] ?? m.venue?.name ?? m.unsourced?.name ?? null,
    currency: String(m.row.currency || "").toUpperCase(),
    brokerExchange: m.row.query || null,
  };

  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const american = market === "us";

  const shared = {
    ...answer,
    listing,
    feeMarket: market,
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    remark: "",
    withdraw: WITHDRAW,
    check: american ? CHECK : null,
  };

  if (!market || !rule || (rule.rate == null && rule.perShare == null)) {
    return {
      ...shared,
      basis: `fiche Century Trader ${market || listing.currency}, lue le ${SCHEDULE.readOn} : commission « - »`,
      why: "Tadawul : la fiche Century imprime « - » pour la commission, pas un chiffre",
      confidence: confidenceOf({ market, rule, listing, leaf, marketBp, marketPerShare, unsourced: m.unsourced }),
    };
  }

  const basis =
    `barème Century Trader ${market}, fiche lue le ${SCHEDULE.readOn}` +
    (rule.perShare != null
      ? ` : ${rule.perShare} ${rule.perShareCcy} / part, plancher ${rule.min} ${rule.minCcy} (débit mesuré en ${rule.minCcy})`
      : ` : ${(rule.rate * 100).toFixed(2)} % du montant, plancher ${rule.min} ${rule.minCcy}`);

  const n = Number(shares);
  const p = Number(price);
  const hasN = n > 0;
  const hasP = p > 0;
  // The American ticket is per share. Ten NIO without a cached price still
  // pay 4 € a side; refusing the row for want of a quote hid the whole bill.
  // Hong Kong is a percentage of the amount and cannot be billed without one.
  if (!hasN) {
    return {
      ...shared,
      basis,
      why: "aucun nombre de parts",
      confidence: confidenceOf({ market, rule, listing, leaf, marketBp, marketPerShare, unsourced: m.unsourced }),
    };
  }
  if (!hasP && rule.rate != null) {
    return {
      ...shared,
      basis,
      why: "aucun prix pour cette ligne : lancer node prices.mjs",
      confidence: confidenceOf({ market, rule, listing, leaf, marketBp, marketPerShare, unsourced: m.unsourced, n }),
    };
  }

  const notional = hasP ? n * p : null;
  const notionalUsd = hasP ? toUsd(notional, listing.currency) : null;
  const bookUsd =
    marketBp != null && notionalUsd != null
      ? (notionalUsd * marketBp) / 1e4
      : marketPerShare != null
        ? marketPerShare * n
        : null;

  const buy = commissionSide({ shares: n, amount: notional, market, currency: listing.currency });
  const sell = commissionSide({ shares: n, amount: notional, market, currency: listing.currency });
  const buyUsd = buy ? dollars(buy.charged, buy.currency) : null;
  const sellUsd = sell ? dollars(sell.charged, sell.currency) : null;
  const brokerFees = plus(buyUsd, sellUsd);
  const usd = plus(bookUsd, brokerFees);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? {
          why:
            `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ` +
            `${m.unsourced?.why || "pas de source de spread"}`,
        }
      : {}),
    trade: {
      shares: n,
      price: hasP ? p : null,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: listing.currency,
    },
    buy: {
      commission: finite(buyUsd, 6),
      native: buy
        ? { charged: finite(buy.charged, 6), raw: finite(buy.raw, 6), floored: buy.floored, currency: buy.currency }
        : null,
    },
    sell: {
      commission: finite(sellUsd, 6),
      native: sell
        ? { charged: finite(sell.charged, 6), raw: finite(sell.raw, 6), floored: sell.floored, currency: sell.currency }
        : null,
    },
    parts: {
      marché: finite(bookUsd, 6),
      commission: finite(brokerFees, 6),
    },
    commission: {
      rate: rule.rate ?? null,
      perShare: rule.perShare ?? null,
      perShareCurrency: rule.perShareCcy ?? null,
      min: rule.min,
      currency: rule.minCcy,
      eachWay: true,
    },
    basis,
    confidence: confidenceOf({
      market,
      rule,
      listing,
      leaf,
      marketBp,
      marketPerShare,
      unsourced: m.unsourced,
      buy,
      n,
    }),
  };
}

function confidenceOf({ market, rule, listing, leaf, marketBp, marketPerShare, unsourced, buy, n }) {
  const said = [];
  if (market === "sa" || !rule || (rule.rate == null && rule.perShare == null)) {
    said.push(
      `Tadawul : les deux fiches du ${SCHEDULE.readOn} (ALRAJHI.SA, CENOMI CENTERS.SA) impriment « - » ` +
        `pour la commission. Pas de chiffre inventé, pas de palier voisin`
    );
  } else if (rule.perShare != null) {
    said.push(
      `commission américaine ${rule.perShare} ${rule.perShareCcy} la part, plancher ${rule.min} ${rule.minCcy} par sens, ` +
        `fiches GETPRODUCTDETAILS du ${SCHEDULE.readOn} (liveapp.century.ae). ` +
        `La carte imprime encore « 4 USD min ». Le débit du ${CHECK.on} était ${-CHECK.buy.commission} €`
    );
    if (buy) {
      said.push(
        buy.floored
          ? `le plancher mord : ${Number(buy.raw.toPrecision(3))} ${buy.currency} calculés, ` +
            `${Number(buy.charged.toPrecision(6))} ${buy.currency} facturés par sens ` +
            `(la falaise est à ${rule.min / rule.perShare} parts)`
          : `au-dessus du plancher : ${Number(buy.charged.toPrecision(4))} ${buy.currency} par sens`
      );
    }
    if (n > 500) {
      said.push(
        `les fiches US plafonnent d'ordinaire à 300–500 unités : ${n} parts dépassent ce que le ticket accepte`
      );
    }
  } else {
    said.push(
      `commission Hong Kong ${(rule.rate * 100).toFixed(2)} % du montant, plancher ${rule.min} ${rule.minCcy} par sens, ` +
        `fiches du ${SCHEDULE.readOn}`
    );
    if (buy) {
      said.push(
        buy.floored
          ? `le plancher mord : ${Number(buy.raw.toPrecision(3))} ${buy.currency} calculés, ` +
            `${Number(buy.charged.toPrecision(6))} ${buy.currency} facturés par sens`
          : `au-dessus du plancher : ${Number(buy.charged.toPrecision(4))} ${buy.currency} par sens`
      );
    }
  }

  said.push(
    `le tableau des charges d'août 2026 imprime encore 0,32 $ / part et 10 $ de plancher ` +
      `sur les CFD américains et sur TSLA.EQ cash, « SEC et TAF comprises ». ` +
      `La page cash-equities écrit 0,01 $ / 4 $ et « 128 US stocks ». ` +
      `Ni l'un ni l'autre n'est ce livre : 864 lignes USD dont des ETF, carte 0,01 €, ` +
      `aller-retour NIO du ${CHECK.on} à ${-CHECK.buy.commission} € par sens sans SEC ni TAF`
  );

  said.push(
    `CFD sur actions : pas de droit de timbre ni de TTF dans le total — le client n'acquiert pas le titre. ` +
      `SEC et TAF mesurés à zéro sur ${CHECK.ticker} (${CHECK.cash.start} → ${CHECK.cash.end} €, ` +
      `P&L titre ${CHECK.sell.pnl}, commission ${CHECK.commissionPaid} €)`
  );

  if (marketBp != null) said.push(`carnet publié ${Number(marketBp.toPrecision(4))} bp, aller-retour`);
  else if (marketPerShare != null) {
    said.push(`carnet Rule 605, ${marketPerShare} $ la part, moyenne 100–499 parts — Century ne nomme pas la bande`);
  } else {
    said.push(
      `aucun carnet : ${unsourced?.name || listing.exchange}, ${unsourced?.why || "pas de source"}. ` +
        `Le total est N/A faute de mesure, pas faute de frais`
    );
  }

  said.push(
      `hors total : la conversion (§2.10 du tableau) peut s'appliquer quand la caisse n'est pas dans la devise du titre. ` +
      `Le voyage EUR du ${CHECK.on} a converti le notionnel et n'a montré aucune ligne à part. ` +
      `Virement bancaire gratuit. Inactivité ${WITHDRAW.inactivity.monthly} ${WITHDRAW.inactivity.ccy} / mois ` +
      `après ${WITHDRAW.inactivity.afterMonths} mois. Holding 0 % sur la fiche, donc 0 sur un aller-retour le jour même. ` +
      `DMA DFM / ADX et les actions UK / DE / CN de la page marketing ne sont pas dans ce catalogue`
  );

  said.push(`spread dealer imprimé 0, marge 100 %, Type Shares. Mid BCE du ${FX_AS_OF}`);
  if (leaf == null && market === "us") said.push(`pas de feuille 605 pour ${listing.isin}`);
  return said.join(" ; ");
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
          rules: RULE,
          withdraw: WITHDRAW,
          check: CHECK,
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
      "usage : node century_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--json]\n" +
        "        node century_cost.mjs --schedule\n" +
        "  ex.   node century_cost.mjs AAPL --shares=1 --price=230\n" +
        "        node century_cost.mjs AAPL NASDAQ USD --shares=500 --price=230\n" +
        "        node century_cost.mjs 1772 HKEX HKD --shares=200 --price=30\n" +
        "        node century_cost.mjs 1120 TADAWUL SAR"
    );
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
    process.exit(0);
  }

  const l = out.listing;
  if (!l) {
    console.log(out.why || "rien à dire");
    if (out.alternatives?.length) {
      console.log(`\nce que Century propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange || "—"}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}\n`
  );

  if (out.trade) {
    const t = out.trade;
    if (t.notional != null) {
      console.log(
        `${t.shares ? `${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ` : ""}` +
          `${t.notional.toFixed(2)} ${t.currency}` +
          (t.notionalUsd != null ? ` (${t.notionalUsd.toFixed(2)} $)` : "")
      );
      console.log();
    } else if (t.shares) {
      console.log(`${t.shares} part${t.shares > 1 ? "s" : ""}\n`);
    }
  }

  console.log(`aller-retour     : ${out.usd == null ? `N/A${out.why ? ` — ${out.why}` : ""}` : `${out.usd} $`}`);
  console.log(`frais du courtier: ${out.brokerFees == null ? "N/A" : `${out.brokerFees} $`}`);
  if (out.parts) {
    for (const [name, v] of Object.entries(out.parts)) {
      if (v != null) console.log(`  ${name.padEnd(15)}: ${v} $`);
    }
  }
  console.log();
  if (out.basis) console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);
  if (out.remark) for (const r of out.remark.split("\n")) console.log(`  · ${r}`);
  if (out.url) console.log(`\n${out.url}`);
}
