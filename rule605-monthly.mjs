// What a retail order actually paid on an American book last month, from the reports
// Rule 605 of Regulation NMS obliges the firms that execute that flow to publish.
//
// This is the American counterpart of `xlm-monthly.mjs`, and deliberately the same
// shape of thing: one monthly file per source, an average rather than a snapshot, no
// browser, no key, no account. What it is not is a quoted spread. Field 18 of the file
// is the *effective* spread — twice the distance from the execution price to the
// midpoint at the moment the order arrived — averaged over the shares actually
// executed. Price improvement is therefore already in it, which matters enormously
// here: on the funds below, wholesalers improved between 41% and 93% of the shares
// they filled, so a quoted touch would overstate the cost by a factor of two or more.
//
// The unit conversion is a happy accident of the definition. One leg pays half the
// effective spread against the midpoint, so a round trip pays two halves — the
// effective spread itself, as published, per share. No price, no notional and no
// assumption about `g` enters anywhere.
//
// Three things this file cannot do, all worth knowing before trusting a number:
//
//   The legacy format covers orders of 100 shares or more. Odd lots only became
//   reportable with the 2024 amendments, and the files on this host are still the old
//   26-field layout, so an order of 20 shares is not in the data. Whether it costs
//   more or less is not measured here.
//
//   Citadel Securities and Virtu Americas, between them the destination of most retail
//   equity flow in the United States, publish behind bot protection and are absent.
//   The four reporters below are what a plain fetch can reach. Their agreement with
//   each other is the only evidence available about how much that absence matters, and
//   the CLI prints it for exactly that reason.
//
//   A wholesaler's average is not your fill. It is the average of a month of orders in
//   that security at that size, which is the same kind of statement XLM makes, and the
//   same kind of statement a cost model needs.
//
//   node rule605-monthly.mjs            -- refresh and describe
//   node rule605-monthly.mjs IAU        -- everything known about one symbol

import fs from "node:fs";
import { zipEntries } from "./xlm-monthly.mjs";

const CACHE_PATH = "parsed_json/rule605-monthly.json";
// Reports for a month appear during the following one, so the table goes looking for a
// newer file about six weeks after the month it describes began.
const STALE_DAYS = 40;

// Where each firm's download site lives, as published by its Designated Participant in
// FINRA's directory. To refresh the list, read the reporter identification code and the
// hyperlink off finra.org/filing-reporting/regulation-nms/sec-rule-605-reports — the
// OTC market maker page is the one that holds the firms retail flow reaches.
//
// Four of the five share one host and one naming convention, which is what made them the
// ones to wire up first: T is FINRA's Designated Participant letter, then the reporter
// code, then the month. Jane Street publishes on its own site, uncompressed, and is worth
// the extra line: it is one of the largest wholesalers in exchange-traded funds, and the
// same 26-field layout comes out of it.
const REPORTERS = [
  { ric: "SOHO", name: "Two Sigma Securities" },
  { ric: "ETMM", name: "G1 Execution Services" },
  { ric: "UBSS", name: "UBS Securities" },
  { ric: "HRTF", name: "Hudson River Trading" },
  {
    ric: "JNST",
    name: "Jane Street Capital",
    url: (month) => `https://www.janestreet.com/static/execution-quality-reports/${month}_JNST.txt`,
    plain: true,
  },
];
const fileUrl = (r, month) =>
  r.url ? r.url(month) : `https://public.s3.com/rule605/${r.ric.toLowerCase()}/T${r.ric}${month}.zip`;

// Named rather than merely missing, so that a gap in the sample stays visible to
// whoever reads the output instead of being rediscovered later. Both publish on their own
// sites behind bot protection: Citadel answers 403 to anything without a browser, and
// Virtu is not on the OTC market maker list under a reporter code that resolves to a file.
const OUT_OF_REACH = [
  { ric: "CDRG", name: "Citadel Securities", why: "site protégé contre les robots (403)" },
  { ric: "NITE", name: "Virtu Americas", why: "aucun fichier public trouvé" },
];

// The legacy layout, 26 pipe-separated fields. Positions rather than names because the
// old format has no header line; `checkLayout` below is what keeps the guess honest.
const F = {
  symbol: 3,
  type: 4,
  size: 5,
  orders: 6,
  covered: 7,
  executedHere: 9,
  executedAway: 10,
  effective: 17,
  improvedShares: 18,
  improvedAmount: 19,
  atQuoteShares: 21,
  outsideShares: 23,
};

// The two ways to say "now": a market order, and a limit order priced through the touch.
// They are charged very differently — wholesalers improved 93% of the shares on IAU
// market orders against 41% of its marketable limits, giving 0.0035 and 0.0072 per share
// — so the published figure is the share-weighted average over both, and each is kept
// beside it.
//
// Averaging rather than choosing is what avoids an assumption nobody here can check. A
// platform's buy button sends one or the other, and which one is not visible in a fill;
// the thirteen tastytrade round trips on file are consistent with either. What made the
// choice matter is AQLT: market orders in it averaged a *negative* effective spread, so
// a table built on that type alone would have called a round trip free, while the trip
// actually paid 4.5 cents a share. The combined figure says 3.0. Being wrong by a third
// beats being wrong by the sign, and market orders are 55% to 98% of the flow either way.
const MARKET = "11";
const MARKETABLE_LIMIT = "12";
const IMMEDIATE = [MARKET, MARKETABLE_LIMIT];

// Share buckets, which is what the legacy format sorts by. 21 is the smallest that
// exists and the only one a private investor is likely to be in.
const BUCKETS = { 21: "100 à 499 parts", 22: "500 à 1 999", 23: "2 000 à 4 999", 24: "5 000 et plus" };
const RETAIL_BUCKET = "21";

// The file carries no header, so the column numbers above are an assumption, and this
// is what tests it: on a market or marketable limit row the shares filled break down
// into improved, at the quote, and outside it, and the three must add back to the
// total. The whole of one reporter's month satisfies it exactly — 51,673 rows, not one
// off by a share — which no accidental alignment of eleven columns would do. It holds
// only for those two order types: the tail of the record means something else on a
// non-marketable limit row, where it fails on 99.8% of lines, which is itself a check
// that the type column is where this file thinks it is.
// Two readings of "executions of covered orders" are in circulation, and the check
// distinguishes them instead of failing on the second. Two Sigma, G1 and Hudson River
// report the breakdown over what they filled themselves; UBS reports it over what it
// filled plus what it routed away, a tenth of its flow. Both are defensible readings of
// the rule, and both are the average a customer paid, so the figure is kept either way
// and weighted by whichever total the reporter used.
function weightOf(f) {
  const here = Number(f[F.executedHere]);
  if (!(here > 0)) return null;
  const away = Number(f[F.executedAway] || 0);
  const parts =
    Number(f[F.improvedShares] || 0) +
    Number(f[F.atQuoteShares] || 0) +
    Number(f[F.outsideShares] || 0);
  if (Math.abs(parts - here) <= 1) return { shares: here, counts: "exécutions propres" };
  if (Math.abs(parts - (here + away)) <= 1) return { shares: here + away, counts: "exécutions et réacheminements" };
  throw new Error(
    `colonnes inattendues : ${f[F.symbol]} exécute ${here} parts (${away} ailleurs) mais les ` +
      `trois catégories en totalisent ${parts}`
  );
}

// One reporter's month, reduced to what a cost model asks of it. Everything is
// share-weighted, because that is how the exchange's own field is defined and because
// an order-weighted average would let a hundred one-lot orders outvote a real one.
function parseReport(text) {
  const bySymbol = new Map();
  let rows = 0;
  let checked = 0;
  let counts = null;

  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const f = line.split("|");
    if (f.length < 20) continue;
    rows++;
    const type = f[F.type];
    if (type !== MARKET && type !== MARKETABLE_LIMIT) continue;
    const bucket = f[F.size];
    if (!BUCKETS[bucket]) continue;
    const effective = Number(f[F.effective]);
    if (!Number.isFinite(effective)) continue;
    const weight = weightOf(f);
    if (!weight) continue;
    const shares = weight.shares;
    counts ||= weight.counts;
    checked++;

    const symbol = f[F.symbol];
    let s = bySymbol.get(symbol);
    if (!s) bySymbol.set(symbol, (s = { cells: {} }));
    const cell = (s.cells[`${type}|${bucket}`] ||= { shares: 0, sum: 0, orders: 0, improved: 0 });
    cell.shares += shares;
    // Weighted by the shares the exchange itself weighted the figure over, so summing
    // two cells gives what one cell over their union would have said.
    cell.sum += effective * shares;
    cell.orders += Number(f[F.orders] || 0);
    cell.improved += Number(f[F.improvedShares] || 0);
  }
  if (!checked) throw new Error("aucune ligne exécutable dans le fichier");
  return { bySymbol, rows, checked, counts };
}

async function download(month) {
  const reports = [];
  const failed = [];
  for (const r of REPORTERS) {
    const url = fileUrl(r, month);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(120000),
      });
      if (!res.ok) {
        failed.push({ ...r, why: `HTTP ${res.status}` });
        continue;
      }
      // Served as it is written, by the one firm that does not zip it.
      if (r.plain) {
        reports.push({ ...r, url, ...parseReport(await res.text()) });
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const read = zipEntries(buf);
      // One entry, named after the file, but the extension has moved once already
      // (.dat to .txt in the 2025 plan amendment) so it is found rather than assumed.
      const name = [`T${r.ric}${month}.dat`, `T${r.ric}${month}.txt`].find((n) => {
        try {
          read(n);
          return true;
        } catch {
          return false;
        }
      });
      if (!name) {
        failed.push({ ...r, why: "archive sans fichier reconnaissable" });
        continue;
      }
      reports.push({ ...r, url, ...parseReport(read(name)) });
    } catch (e) {
      failed.push({ ...r, why: String(e.message || e).slice(0, 80) });
    }
  }
  if (!reports.length) {
    throw new Error(
      `aucun rapport pour ${month} : ${failed.map((f) => `${f.ric} ${f.why}`).join(", ")}`
    );
  }

  // Across reporters, weighted the same way, so the published figure is what the whole
  // reachable sample paid rather than an average of averages.
  const symbols = {};
  for (const rep of reports) {
    for (const [symbol, s] of rep.bySymbol) {
      const out = (symbols[symbol] ||= { cells: {}, byReporter: {} });
      for (const [k, cell] of Object.entries(s.cells)) {
        const acc = (out.cells[k] ||= { shares: 0, sum: 0, orders: 0, improved: 0 });
        acc.shares += cell.shares;
        acc.sum += cell.sum;
        acc.orders += cell.orders;
        acc.improved += cell.improved;
      }
      const retail = merge(IMMEDIATE.map((t) => s.cells[`${t}|${RETAIL_BUCKET}`]));
      if (retail?.shares) out.byReporter[rep.ric] = round(retail.sum / retail.shares);
    }
  }

  const table = {};
  for (const [symbol, s] of Object.entries(symbols)) {
    const cell = (type, bucket) => s.cells[`${type}|${bucket}`];
    const avg = (c) => (c?.shares ? round(c.sum / c.shares) : null);
    const retail = merge(IMMEDIATE.map((t) => cell(t, RETAIL_BUCKET)));
    const perShare = avg(retail);
    if (perShare == null) continue;
    table[symbol] = {
      // Dollars per share for one round trip, immediately executable orders of 100 to
      // 499 shares. This is the field the cost scripts read.
      perShare,
      // The two halves of it, because they can differ by a factor of twenty and the
      // difference is the one thing a reader might want to override.
      market: avg(cell(MARKET, RETAIL_BUCKET)),
      limit: avg(cell(MARKETABLE_LIMIT, RETAIL_BUCKET)),
      shares: retail.shares,
      orders: retail.orders,
      // How much of the flow was improved on the quote: the reason this measure is not
      // a touch, expressed as the fraction it applied to.
      improved: retail.shares ? Number((retail.improved / retail.shares).toFixed(2)) : null,
      // Larger orders dig into the book, and the gradient is steep enough to be worth
      // keeping: IAU goes 0.0035, 0.0033, 0.0071, 0.0110 across the four buckets.
      byBucket: Object.fromEntries(
        Object.keys(BUCKETS)
          .map((b) => [b, avg(merge(IMMEDIATE.map((t) => cell(t, b))))])
          .filter(([, v]) => v != null)
      ),
      byReporter: s.byReporter,
    };
  }

  return {
    month: `${month.slice(0, 4)}-${month.slice(4, 6)}`,
    fetchedAt: new Date().toISOString(),
    measure:
      "spread effectif moyen, en dollars par part, pour un aller-retour : ordres immédiatement exécutables (au marché et limites franchissant la touche) de 100 à 499 parts, pondéré par les parts exécutées",
    reporters: reports.map((r) => ({
      ric: r.ric,
      name: r.name,
      url: r.url,
      rows: r.rows,
      symbols: r.bySymbol.size,
      counts: r.counts,
    })),
    unreachable: [...OUT_OF_REACH, ...failed.map((f) => ({ ric: f.ric, name: f.name, why: f.why }))],
    symbols: table,
  };
}

const round = (v) => Number(v.toFixed(5));

// Two cells into one, keeping the weighting: sums of (spread x shares) add, so the
// result is what a single cell over their union would have said.
const merge = (cells) => {
  const kept = cells.filter(Boolean);
  if (!kept.length) return null;
  return kept.reduce(
    (a, c) => ({
      shares: a.shares + c.shares,
      sum: a.sum + c.sum,
      orders: a.orders + c.orders,
      improved: a.improved + c.improved,
    }),
    { shares: 0, sum: 0, orders: 0, improved: 0 }
  );
};

// Reports land during the month after the one they describe, and not on a fixed day, so
// the newest available month is found by asking rather than by computing it.
async function newestMonth() {
  const now = new Date();
  for (let back = 1; back <= 4; back++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    const month = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const res = await fetch(fileUrl(REPORTERS[0], month), {
      method: "HEAD",
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(30000),
    }).catch(() => null);
    if (res?.ok) return month;
  }
  throw new Error("aucun mois disponible sur les quatre derniers");
}

// Same contract as `monthlyXlm`: a stale table beats no table, and saying so in the log
// is enough.
export async function monthlyEffectiveSpread({ refresh = false, quiet = false } = {}) {
  const cached = fs.existsSync(CACHE_PATH) ? JSON.parse(fs.readFileSync(CACHE_PATH, "utf8")) : null;
  const age = cached ? (Date.now() - Date.parse(cached.fetchedAt)) / 86400000 : Infinity;
  if (cached && !refresh && age < STALE_DAYS) return cached;

  try {
    const fresh = await download(await newestMonth());
    fs.mkdirSync("parsed_json", { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify(fresh, null, 2));
    if (!quiet) {
      console.error(
        `605 ${fresh.month} : ${Object.keys(fresh.symbols).length} titres, ` +
          `${fresh.reporters.map((r) => r.ric).join(" ")}`
      );
    }
    return fresh;
  } catch (e) {
    if (!cached) throw e;
    if (!quiet) console.error(`605 : ${String(e.message || e)} — table du ${cached.month} conservée`);
    return cached;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const asked = process.argv[2]?.toUpperCase();
  const table = await monthlyEffectiveSpread({ refresh: !asked });
  const line = asked ? table.symbols[asked] : null;

  if (asked && !line) {
    console.log(`${asked} absent de la table ${table.month}`);
  } else if (asked) {
    console.log(`${asked} — table ${table.month}`);
    console.log(`  aller-retour  ${line.perShare} $ la part, ordres immédiats de 100 à 499 parts`);
    console.log(`  dont          au marché ${line.market ?? "—"}, en limite ${line.limit ?? "—"}`);
    console.log(`  mesuré sur    ${line.shares.toLocaleString("fr-FR")} parts, ${line.orders.toLocaleString("fr-FR")} ordres`);
    console.log(`  amélioré      ${(line.improved * 100).toFixed(0)} % des parts`);
    console.log(`  par tranche   ${Object.entries(line.byBucket).map(([b, v]) => `${BUCKETS[b]} : ${v}`).join("  |  ")}`);
    const reps = Object.entries(line.byReporter);
    console.log(`  par teneur    ${reps.map(([r, v]) => `${r} ${v}`).join("  ")}`);
    // Dispersion between the reporters we can read is the only handle available on the
    // two we cannot, so it is printed next to them rather than left to be worked out.
    if (reps.length > 1) {
      const vs = reps.map(([, v]) => v);
      const spread = (Math.max(...vs) - Math.min(...vs)) / (vs.reduce((a, b) => a + b) / vs.length);
      console.log(`                écart entre teneurs : ${(spread * 100).toFixed(0)} % de la moyenne`);
    }
    console.log(`  manquants     ${table.unreachable.map((u) => u.ric).join(", ")}`);
  } else {
    console.log(`table ${table.month} : ${Object.keys(table.symbols).length} titres`);
    for (const r of table.reporters) {
      console.log(`  ${r.ric}  ${r.name.padEnd(22)} ${r.rows.toLocaleString("fr-FR").padStart(9)} lignes, ${r.symbols.toLocaleString("fr-FR").padStart(6)} titres`);
    }
    console.log(`  hors de portée : ${table.unreachable.map((u) => `${u.ric} (${u.why})`).join(", ")}`);
    const all = Object.values(table.symbols).map((s) => s.perShare).sort((a, b) => a - b);
    console.log(
      `\nspread effectif par part : médiane ${all[all.length >> 1]} $, ` +
        `du plus serré ${all[0]} au plus large ${all.at(-1)}`
    );
  }
}
