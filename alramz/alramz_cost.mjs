// What one round trip costs at Al Ramz: buy n shares at price p, sell them
// back at once.
//
//   coût (USD) = a × toUsd(p) × n + b × n + c
//
// `a` is a fraction of the amount. `b` and `c` are dollars, the same unit the
// other `*_cost.mjs` files answer in.
//
// Al Ramz Capital LLC (AE, SCA). The catalogue is webtrade.alramz.ae
// (`alramz.mjs`) and today only holds four NYSE ETFs that also sit in
// `etfs.csv`. The public card still prints DFM, ADX, Nasdaq Dubai, Bahrain
// and Muscat, so those legs are wired for a later scrape. Custody of the
// online account is 300 AED / year (FAQ); it stays in the remark.
//
// Local UAE tape (DFM / ADX / DIFX): the printed % × 2 sits in `a`. VAT 5 %
// is charged on broker, market, order and CDS lines; it is folded into `a`
// and into the floor. The ticket is a floor (`min fees`, `c` = 0). ADX
// prints a 0 minimum, so there is no floor. Tabadul (Bahrain / Muscat) is a
// separate block on the PDF and does not carry the VAT asterisk.
//
// US: 0.20 %, min 10 $. The card also prints a MARKET 0.000008 on the sell;
// that is left out. SEC / TAF use the same current figures as the other
// files. The 0.20 % × 2 sits in `a`. The 10 $ is the whole bill under
// 5 000 $ (`exactCost` still does max(min, rate)).
//
// No live trip is in this deposit yet.
//
//   https://www.alramz.ae/our-platform
//   https://www.alramz.ae/sites/default/files/2025-03/commission.pdf
//   https://alramz.ae/index.php/faqs
//
//   node alramz/alramz_cost.mjs VOO
//   node alramz/alramz_cost.mjs GLD NYSE USD --shares=1 --price=400
//   node alramz/alramz_cost.mjs --schedule
//
// `roundTripCost(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";

const CATALOGUE = new URL("alramz-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);
const TAXES = new URL("../parsed_json/taxes.json", import.meta.url);
const T212 = new URL("../trading212/trading212-parsed.json", import.meta.url);

const SCHEDULE = {
  source: "https://www.alramz.ae/our-platform",
  pdf: "https://www.alramz.ae/sites/default/files/2025-03/commission.pdf",
  faqs: "https://alramz.ae/index.php/faqs",
  readOn: "2026-09-10",
  pageUpdated: "2025-02-24",
  entity: "Al Ramz Capital LLC (AE)",
};

const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const VAT = 0.05;
const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);

// rate of notional per side. min in `ccy`. `vat` is the 5 % UAE line on the
// local block of the card, not a guess for Tabadul or the US.
const RULE = {
  dfm: { rate: 0.00275, min: 10, ccy: "AED", vat: true },
  adx: { rate: 0.0015, min: null, ccy: "AED", vat: true },
  difx_usd: { rate: 0.0025, min: 3, ccy: "USD", vat: true },
  difx_aed: { rate: 0.00225, min: 10, ccy: "AED", vat: true },
  bahrain: { rate: 0.002805, min: 3.3, ccy: "BHD", vat: false },
  muscat: { rate: 0.0035, min: 1, ccy: "OMR", vat: false },
  us: { rate: 0.002, min: 10, ccy: "USD", vat: false },
};

const TO_VENUES = {
  ADSM: "ADX",
  DIFX: "NASDAQDUBAI",
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};
const taxFile = fs.existsSync(TAXES) ? JSON.parse(fs.readFileSync(TAXES, "utf8")) : null;

const taxByIsin = (() => {
  const out = new Map();
  if (!taxFile?.byCode || !fs.existsSync(T212)) return out;
  const t212 = JSON.parse(fs.readFileSync(T212, "utf8"));
  for (const r of Array.isArray(t212) ? t212 : t212.rows || []) {
    const isin = String(r.isin || "").toUpperCase();
    const entry = r.code ? taxFile.byCode[r.code] : null;
    if (isin && entry && (entry.achat || entry.vente)) out.set(isin, entry);
  }
  return out;
})();

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

const venueRow = (row) => ({
  ...row,
  exchange: TO_VENUES[row.exchange] || row.exchange,
});

const vatFactor = (rule) => (rule?.vat ? 1 + VAT : 1);

function remarkOf({ market } = {}) {
  const r = RULE[market];
  const lines = [];
  if (r?.min != null) {
    const n = r.min * 2;
    const amount =
      r.ccy === "USD" ? `${n} $` : r.ccy === "AED" ? `${n} AED` : `${n} ${r.ccy}`;
    lines.push(`min fees ${amount}.`);
  }
  if (r?.vat) lines.push("VAT 5% on the ticket.");
  lines.push("Online account 300 AED/year.");
  return lines.join("\n");
}

export function feeMarketOf(exchange, mic, currency) {
  const code = loose(exchange);
  const m = String(mic || "").toUpperCase();
  const ccy = String(currency || "").toUpperCase();
  if (US_MICS.has(m) || /^(NASDAQ|NYSE|AMEX|ARCA|BATS)$/.test(code)) return "us";
  if (code === "DFM" || m === "XDFM") return "dfm";
  if (code === "ADX" || code === "ADSM" || m === "XADS") return "adx";
  if (code === "DIFX" || code === "NASDAQDUBAI" || code === "NASDAQDXB") {
    return ccy === "AED" ? "difx_aed" : "difx_usd";
  }
  if (code === "BAHRAIN" || code === "XBAH" || code === "BAHRAINBOURSE") return "bahrain";
  if (code === "MUSCAT" || code === "MSM" || code === "XMUS") return "muscat";
  return null;
}

function taxesOf(isin) {
  if (!taxFile) return { known: false, why: "relevé fiscal absent : lancer node taxes.mjs" };
  const entry = taxByIsin.get(String(isin || "").toUpperCase());
  if (entry) return { known: true, buy: entry.achat ?? {}, sell: entry.vente ?? {} };
  return { known: false, assumedZero: true, why: "pas de ligne fiscale Trading212 pour cet ISIN" };
}

function taxRates(tax) {
  const rates = {};
  for (const [name, line] of Object.entries(tax.buy ?? {})) {
    if (line.ofValue != null) rates[name] = line.ofValue;
  }
  return rates;
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rows.filter((r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(venueRow(r)) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace || loose(TO_VENUES[m.row.exchange] || "").includes(wantPlace);
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
    const { venue, unsourced } = listingKey(venueRow(r));
    const book = spreadLeaf(spreads, {
      isin: r.isin,
      mic: venue?.mic ?? null,
      currency: r.currency,
      unsourced,
    });
    const market = feeMarketOf(r.exchange, book.mic ?? venue?.mic, r.currency);
    const slot = (out[type] ||= { n: 0, withBook: 0, byMarket: {} });
    slot.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) slot.withBook += 1;
    const mk = (slot.byMarket[market || "?"] ||= { n: 0, withBook: 0 });
    mk.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) mk.withBook += 1;
  }
  return out;
}

export function commissionEach({ amount, market }) {
  const rule = RULE[market];
  if (!rule || rule.rate == null) return null;
  if (amount == null || !Number.isFinite(Number(amount))) {
    return rule.min == null ? null : rule.min * vatFactor(rule);
  }
  let fee = Number(amount) * rule.rate;
  if (rule.min != null) fee = Math.max(rule.min, fee);
  return fee * vatFactor(rule);
}

export function exactCost({ shares, price, market, currency }) {
  const rule = RULE[market];
  if (!rule) return { commission: null, currency: QUOTE };
  const amount = shares != null && price != null ? Number(shares) * Number(price) : null;
  const each = commissionEach({ amount, market });
  if (each == null) return { commission: null, currency: QUOTE, rule };
  return {
    commission: dollars(each * 2, rule.ccy),
    currency: QUOTE,
    native: { each, roundTrip: each * 2, currency: rule.ccy },
    rule,
  };
}

export function roundTripCost({ etf, place, currency, bp = null, perShare = null }) {
  const { named, matches } = findListing({ etf, place, currency });
  const answer = {
    a: null,
    b: 0,
    c: 0,
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
      why: "le catalogue Al Ramz n'existe pas encore : lancer `node alramz/alramz.mjs` avec webtrade.alramz.ae ouvert",
    };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Al Ramz` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Al Ramz`,
      alternatives: listAlternatives(named),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
  });
  const listing = {
    isin: String(m.row.isin || "").toUpperCase(),
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || "").toUpperCase(),
    brokerExchange: m.row.exchange || null,
  };

  const market = feeMarketOf(m.row.exchange, listing.mic, listing.currency);
  const rule = RULE[market];
  if (!market || !rule) {
    return {
      ...answer,
      listing,
      feeMarket: market,
      remark: "no published card for this venue.",
      why: `${listing.exchange || m.row.exchange} n'est pas sur la carte Al Ramz`,
      tax: taxesOf(listing.isin),
      fx: fxNote(listing.currency),
    };
  }

  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const american = market === "us";
  const tax = taxesOf(listing.isin);
  const rates = taxRates(tax);
  const taxTotal = Object.values(rates).reduce((s, r) => s + r, 0);
  const commissionPct = rule.rate * vatFactor(rule) * 2;
  const knownPct = taxTotal + (american ? SEC_RATE : 0) + commissionPct;
  const a = marketBp != null ? marketBp / 1e4 + knownPct : knownPct;
  const bookUsd = american ? (marketPerShare ?? 0) : dollars(marketPerShare ?? 0, listing.currency) ?? 0;
  const floorUsd = rule.min != null ? dollars(rule.min * vatFactor(rule) * 2, rule.ccy) : null;

  return {
    ...answer,
    a: Number(Number(a).toPrecision(4)),
    b: Number((bookUsd + (american ? TAF_PER_SHARE : 0)).toPrecision(6)),
    c: 0,
    floor: floorUsd,
    listing,
    feeMarket: market,
    remark: remarkOf({ market }),
    parts: {
      marché:
        marketBp != null
          ? Number((marketBp / 1e4).toPrecision(4))
          : marketPerShare != null
            ? `${marketPerShare} par part`
            : null,
      taxes: Object.keys(rates).length ? rates : null,
      réglementaire: american ? { SEC: SEC_RATE, FINRA: `${TAF_PER_SHARE} par part` } : null,
      commission: commissionPct,
      vat: rule.vat ? VAT : 0,
    },
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    basis: `barème Al Ramz ${market}, lu le ${SCHEDULE.readOn} (carte ${SCHEDULE.pageUpdated})`,
    tax,
    commission: {
      rate: rule.rate,
      min: rule.min,
      currency: rule.ccy,
      vat: rule.vat ? VAT : 0,
      eachWay: true,
    },
    ccy: QUOTE,
    cap: american ? { term: "b", part: "FINRA TAF", amount: TAF_CAP, per: "exécution" } : null,
    threshold: null,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    confidence:
      `commission ${market} selon la carte Al Ramz du ${SCHEDULE.readOn} ` +
      `(PDF ${SCHEDULE.pageUpdated}). ` +
      `${(rule.rate * 100).toFixed(2)} % par jambe` +
      (rule.min != null ? `, plancher ${rule.min} ${rule.ccy}` : ", pas de plancher") +
      (rule.vat ? `, TVA 5 % incluse dans a et le plancher` : "") +
      `. a = carnet` +
      (taxTotal ? ` + taxes T212` : "") +
      (american ? ` + SEC` : "") +
      ` + ${(commissionPct * 100).toFixed(2)} % de courtage` +
      `. Ticket dans le plancher, b = ` +
      (american ? `605 + TAF` : `0`) +
      `, c = 0. Aucun aller-retour réel chez Al Ramz dans ce dépôt. ` +
      (leaf ? "" : `Pas de feuille de carnet pour cet ISIN / cette place. `),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const m = process.argv.find((a) => a.startsWith(`--${name}=`));
    return m ? m.split("=").slice(1).join("=") : null;
  };

  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({ ...SCHEDULE, rules: RULE, coverage: coverage() }, null, 2));
    process.exit(0);
  }

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error(
      "usage : node alramz_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--json]\n" +
        "        node alramz_cost.mjs --schedule\n" +
        "  ex.   node alramz_cost.mjs VOO\n" +
        "        node alramz_cost.mjs GLD NYSE USD --shares=1 --price=400"
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

  if (out.a == null && !out.listing) {
    console.log(`a = null   b = ${out.b}   c = ${out.c}\n${out.why}`);
    if (out.alternatives?.length) {
      console.log(`\nce que Al Ramz propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}\n`
  );

  const detail = [];
  if (out.parts?.marché != null) detail.push(`carnet ${out.parts.marché}`);
  for (const [name, rate] of Object.entries(out.parts?.taxes ?? {})) detail.push(`${name} ${rate}`);
  if (out.parts?.commission) detail.push(`courtage ${out.parts.commission}`);
  if (out.parts?.réglementaire) detail.push(`SEC ${out.parts.réglementaire.SEC}`);

  console.log(`a = ${out.a}   (au prorata${detail.length ? " : " + detail.join(" + ") : " : rien"})`);
  console.log(`b = ${out.b} $   (par part${out.b ? " : FINRA et/ou spread 605" : " : rien"})`);
  console.log(`c = ${out.c} $   (par ordre : ticket dans la remark, pas dans c)`);
  if (out.floor != null) console.log(`plancher ${out.floor} $`);
  if (out.why) console.log(out.why);
  const fx = out.fx?.listing ?? usdPer(l.currency);
  console.log(
    `\ncoût = ${out.a} × p × n × ${fx != null ? Number(fx.toPrecision(6)) : "?"} + ${out.b} × n + ${out.c}   ($ ; p en ${l.currency})`
  );
  console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);

  const n = Number(flag("shares"));
  const p = Number(flag("price"));
  if (n > 0 && p > 0) {
    const amount = n * p;
    const amountUsd = toUsd(amount, l.currency);
    const affine = amountUsd != null && out.a != null ? out.a * amountUsd + out.b * n + out.c : null;
    const billed = exactCost({ shares: n, price: p, market: out.feeMarket, currency: l.currency });
    console.log(
      `\n${n} part${n > 1 ? "s" : ""} à ${p} ${l.currency} = ${amount.toFixed(2)} ${l.currency}` +
        (amountUsd != null ? ` (${amountUsd.toFixed(2)} $)` : "")
    );
    if (affine != null) console.log(`  a, b, c        : ${affine.toFixed(4)} $`);
    if (billed.commission != null) {
      console.log(
        `  commission     : ${Number(billed.commission).toFixed(4)} $` +
          (billed.native?.each != null
            ? ` (${Number(billed.native.each).toPrecision(4)} ${billed.native.currency} × 2)`
            : "")
      );
    }
  }
  if (out.url) console.log(`\n${out.url}`);
}
