// Xetra's own liquidity measure for every ETF, ETC and ETN it lists, from the monthly
// workbook Deutsche Börse publishes rather than from its website.
//
// The website holds the same numbers one instrument per page, and reading them that way
// cost a browser tab and about ten seconds each: three hours for a broker's catalogue,
// and the API answered 503 within a minute once the pass went wide. The workbook is one
// 1.6 MB download for 3,676 instruments, needs no browser, no key and no account.
//
// XLM is the round trip cost in basis points for a standard order size, averaged over
// the month, so unlike a touch snapshot it neither expires at the close nor depends on
// the minute it was read. That is what makes a single monthly file enough.
//
// What it is not is the cost of a retail order, and that is why `spread.mjs` no longer
// publishes it. The workbook's own heading gives the order size away — "XLM in bp (100k)"
// — and a hundred thousand euros digs into a book that a thousand does not touch. How
// much further depends on the fund: reading the touch beside the XLM for forty listings
// put the ratio between 0.47 and 1.00 at the quartiles, and at 0.19 for EUNL. So the
// touch is measured per listing now, and this table is kept for two things it does
// better than any page — saying which currency lines a fund actually has on Xetra, and
// telling a thin book from a merely expensive one through turnover and assets.
//
//   node xlm-monthly.mjs            -- refresh the table and describe it
//   node xlm-monthly.mjs IE00B4L5Y983

import fs from "node:fs";
import zlib from "node:zlib";

const INDEX = "https://www.cashmarket.deutsche-boerse.com/cash-en/Data-Tech/statistics/etf-etp-statistics";
const CACHE_PATH = "parsed_json/xlm-monthly.json";
// The workbook appears in the first days of the following month, so a table older than
// this is worth a look. Nothing breaks if it is not refreshed: the figure it holds is a
// monthly average, not a quote.
const STALE_DAYS = 32;

// ------------------------------------------------------------------ xlsx, unassisted
//
// A spreadsheet is a zip of XML, and node can already inflate and match text, so the
// twenty lines below replace a dependency. Entries are read through the central
// directory rather than by scanning for local headers, which is what makes the sizes
// trustworthy.
// Exported because the American monthly reports arrive zipped too, and a second copy
// of the central-directory walk would be a second place for the same bug to live.
export function zipEntries(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("archive illisible");
  const count = buf.readUInt16LE(eocd + 10);
  const entries = new Map();
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    const nameLen = buf.readUInt16LE(p + 28);
    entries.set(buf.toString("utf8", p + 46, p + 46 + nameLen), {
      method: buf.readUInt16LE(p + 10),
      size: buf.readUInt32LE(p + 20),
      offset: buf.readUInt32LE(p + 42),
    });
    p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return (name) => {
    const e = entries.get(name);
    if (!e) throw new Error(`${name} absent de l'archive`);
    const start = e.offset + 30 + buf.readUInt16LE(e.offset + 26) + buf.readUInt16LE(e.offset + 28);
    const data = buf.subarray(start, start + e.size);
    return (e.method === 0 ? data : zlib.inflateRawSync(data)).toString("utf8");
  };
}

const unescape = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&");

// A cell's column comes from its own reference, never from its position in the row:
// empty cells are simply absent from the XML, so counting them shifts every value
// after the first gap onto the wrong heading.
//
// Both spellings of a cell have to be recognised, `<c r="B6" s="21"/>` as well as
// `<c r="C6"><v>6</v></c>`. Matching only the second let a self-closing cell swallow
// its neighbour: the regex ran past the empty tag to the next `</c>`, dropped the
// column it had eaten and filed that column's value under the empty one. It cost the
// workbook's "Assets under Management" heading, and silently dropped 161 instruments
// whose own empty cell fell just before their XLM.
function readSheet(xml, shared) {
  const rows = [];
  for (const [, , body] of xml.matchAll(/<row([^>]*)>([\s\S]*?)<\/row>/g)) {
    const cells = {};
    for (const [, ref, attrs, value] of body.matchAll(
      /<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g
    )) {
      const v = value?.match(/<v[^>]*>([\s\S]*?)<\/v>/);
      if (!v) continue;
      cells[ref] = /t="s"/.test(attrs) ? shared[Number(v[1])] : unescape(v[1]);
    }
    rows.push(cells);
  }
  return rows;
}

// ---------------------------------------------------------------------- the workbook

// Three sheets, one per wrapper: a physically replicated tracker is an ETF, gold is an
// ETC and a leveraged Nasdaq product is an ETN, and all three are things a broker will
// happily sell as "an ETF". Their columns do not line up, so each is located by its own
// headings rather than by a remembered letter.
const SHEETS = ["Exchange Traded Funds", "Exchange Traded Commodities", "Exchange Traded Notes"];

// The same workbook carries the intraday measure, one column per half hour of the
// session, keyed by the same ISIN and trading currency. It costs nothing extra — the
// download already happened — and it answers a question no snapshot can: what the cost
// of this fund looks like across the day, averaged over a month rather than over the
// three readings a session has time for.
//
// It is published at the same 100 000 € order size as the headline figure, so it is used
// as a shape and not as a level: divided by its own session average it becomes a set of
// dimensionless ratios, which compose with a touch measured at any one hour.
const INTRADAY_SHEETS = ["iXLM ETF", "iXLM ETC", "iXLM ETN"];

function parseWorkbook(buf) {
  const read = zipEntries(buf);
  const shared = [...read("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map(([, si]) =>
    unescape([...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(([, t]) => t).join(""))
  );

  const rels = Object.fromEntries(
    [...read("xl/_rels/workbook.xml.rels").matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map(
      ([, id, target]) => [id, target.replace(/^\/?xl\//, "")]
    )
  );
  const sheetFile = Object.fromEntries(
    [...read("xl/workbook.xml").matchAll(/<sheet name="([^"]+)"[^>]*r:id="([^"]+)"/g)].map(
      ([, name, id]) => [name, rels[id]]
    )
  );

  const xlm = {};
  let instruments = 0;
  for (const name of SHEETS) {
    if (!sheetFile[name]) continue;
    const rows = readSheet(read(`xl/${sheetFile[name]}`), shared);
    const head = rows.findIndex((r) => Object.values(r).includes("ISIN"));
    if (head < 0) continue;
    const at = (label) =>
      Object.entries(rows[head]).find(([, v]) => String(v).startsWith(label))?.[0] ?? null;
    // Turnover comes along because it is what tells a thin book from a merely expensive
    // one, and the two are easy to confuse: IS3N's XLM of 8.17 bp is wider than GC40's
    // 6.20, yet IS3N trades 372 M€ a month against GC40's 10, and only the second gets
    // internalised at a worse price than the book. Assets under management separate the
    // same pair but less sharply, and neither costs an extra request here.
    const cols = {
      isin: at("ISIN"),
      currency: at("Trd Cry"),
      ticker: at("Xetra Ticker"),
      xlm: at("Xetra Liquidity Measur"),
      turnover: at("Xetra Order Book Turnover"),
      aum: at("Assets under Management"),
    };
    if (!cols.isin || !cols.xlm) continue;

    for (const row of rows.slice(head + 1)) {
      const isin = String(row[cols.isin] || "").toUpperCase();
      if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) continue;
      const bp = Number(row[cols.xlm]);
      // A missing or zero XLM means the month held no measurable quote for that line,
      // which is not the same as a free round trip.
      if (!(bp > 0)) continue;
      const currency = String(row[cols.currency] || "EUR").toUpperCase();
      const millions = (key) => {
        const v = Number(row[cols[key]]);
        return cols[key] && Number.isFinite(v) ? Number(v.toFixed(1)) : undefined;
      };
      xlm[`${isin}|${currency}`] = {
        bp: Number(bp.toFixed(2)),
        ticker: String(row[cols.ticker] || "").toUpperCase() || undefined,
        // Both in millions of euros, as the workbook gives them: turnover for the month
        // just reported, assets at its end.
        turnover: millions("turnover"),
        aum: millions("aum"),
      };
      instruments++;
    }
  }

  // The intraday sheets, read second so that a line without a headline XLM is not
  // invented here: a shape with no level to scale is of no use to anyone.
  let shaped = 0;
  for (const name of INTRADAY_SHEETS) {
    if (!sheetFile[name]) continue;
    const rows = readSheet(read(`xl/${sheetFile[name]}`), shared);
    const head = rows.findIndex((r) => Object.values(r).includes("ISIN"));
    if (head < 0) continue;
    const heading = rows[head];
    const isinCol = Object.entries(heading).find(([, v]) => v === "ISIN")?.[0];
    const currencyCol = Object.entries(heading).find(([, v]) => String(v).startsWith("Trading Currency"))?.[0];
    // The half-hour columns are located by their own labels, in the order the sheet
    // gives them, so a session that ever gains or loses a bucket still lines up.
    const slots = Object.entries(heading)
      .filter(([, v]) => /^\d{2}:\d{2} - \d{2}:\d{2}$/.test(String(v)))
      .map(([col, v]) => ({ col, label: String(v) }));
    if (!isinCol || !slots.length) continue;

    for (const row of rows.slice(head + 1)) {
      const isin = String(row[isinCol] || "").toUpperCase();
      if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) continue;
      const currency = String(row[currencyCol] || "EUR").toUpperCase();
      const line = xlm[`${isin}|${currency}`];
      if (!line) continue;
      const values = slots.map(({ col }) => {
        const v = Number(row[col]);
        return v > 0 ? v : null;
      });
      const known = values.filter((v) => v != null);
      // A handful of buckets is not a shape. Deutsche Börse says as much in its own
      // footnote: the calculation only happens where the half hour held enough trades.
      if (known.length < slots.length / 2) continue;
      const mean = known.reduce((a, b) => a + b, 0) / known.length;
      line.shape = values.map((v) => (v == null ? null : Number((v / mean).toFixed(3))));
      shaped++;
    }
  }

  return { xlm, instruments, shaped, slots: intradaySlots(read, sheetFile, shared) };
}

// The bucket labels, kept once beside the table rather than repeated on every line.
function intradaySlots(read, sheetFile, shared) {
  for (const name of INTRADAY_SHEETS) {
    if (!sheetFile[name]) continue;
    const rows = readSheet(read(`xl/${sheetFile[name]}`), shared);
    const head = rows.findIndex((r) => Object.values(r).includes("ISIN"));
    if (head < 0) continue;
    const labels = Object.values(rows[head]).filter((v) => /^\d{2}:\d{2} - \d{2}:\d{2}$/.test(String(v)));
    if (labels.length) return labels.map(String);
  }
  return [];
}

// ------------------------------------------------------------------------- the table

async function download() {
  const page = await fetch(INDEX, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(30000),
  });
  if (!page.ok) throw new Error(`la page des statistiques a répondu ${page.status}`);
  const html = await page.text();
  // The blob id changes with every publication, so the newest link is looked up rather
  // than remembered. Filenames lead with the reporting date, which sorts as it reads.
  const links = [...html.matchAll(/href="([^"]*\/(\d{8})-ETF-ETP-Statistic\.xlsx)"/g)]
    .map(([, href, date]) => ({ url: new URL(href, INDEX).href, month: date }))
    .sort((a, b) => b.month.localeCompare(a.month));
  if (!links.length) throw new Error("aucun classeur de statistiques trouvé sur la page");

  const res = await fetch(links[0].url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`le classeur a répondu ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const { xlm, instruments, shaped, slots } = parseWorkbook(buf);
  return {
    month: `${links[0].month.slice(0, 4)}-${links[0].month.slice(4, 6)}`,
    url: links[0].url,
    fetchedAt: new Date().toISOString(),
    instruments,
    shaped,
    // `shape[i]` belongs to `slots[i]`, in Berlin time, and is the fund's cost in that
    // half hour divided by its average over the session — so 1.2 means a fifth dearer
    // than usual at that hour. Null where the month held too few trades to measure.
    slots,
    xlm,
  };
}

// Falls back to whatever is cached when the download fails: a month-old average is a
// far better answer than none, and saying so in the log is enough.
export async function monthlyXlm({ refresh = false, quiet = false } = {}) {
  const cached = fs.existsSync(CACHE_PATH) ? JSON.parse(fs.readFileSync(CACHE_PATH, "utf8")) : null;
  const age = cached ? (Date.now() - Date.parse(cached.fetchedAt)) / 86400000 : Infinity;
  if (cached && !refresh && age < STALE_DAYS) return cached;

  try {
    const fresh = await download();
    fs.mkdirSync("parsed_json", { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify(fresh, null, 2));
    if (!quiet) {
      console.error(
        `XLM ${fresh.month} : ${fresh.instruments} instruments Xetra` +
          `${fresh.shaped ? `, dont ${fresh.shaped} avec leur profil de séance` : ""}`
      );
    }
    return fresh;
  } catch (e) {
    if (!cached) throw e;
    if (!quiet) console.error(`XLM : ${String(e.message || e)} — table du ${cached.month} conservée`);
    return cached;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const table = await monthlyXlm({ refresh: !process.argv[2] });
  const asked = process.argv[2]?.toUpperCase();
  if (asked) {
    const lines = Object.entries(table.xlm).filter(([k]) => k.startsWith(asked));
    console.log(
      lines.length
        ? lines
            .map(
              ([k, v]) =>
                `${k}  ${v.bp} bp  ${v.ticker || ""}  volume ${v.turnover ?? "?"} M€/mois  encours ${v.aum ?? "?"} M€`
            )
            .join("\n")
        : `${asked} absent`
    );
    // The shape reads better as a table than as seventeen numbers on one line, and the
    // cheapest and dearest half hours are the part anyone actually acts on.
    for (const [k, v] of lines) {
      if (!v.shape) continue;
      const pairs = v.shape.map((r, i) => ({ r, label: table.slots[i] })).filter((p) => p.r != null);
      const best = pairs.reduce((a, b) => (b.r < a.r ? b : a));
      const worst = pairs.reduce((a, b) => (b.r > a.r ? b : a));
      console.log(
        `\n${k} au fil de la séance, en multiple de sa moyenne :\n   ` +
          pairs.map((p) => `${p.label.slice(0, 5)} ${p.r.toFixed(2)}`).join("   ") +
          `\n   moins cher à ${best.label} (${best.r.toFixed(2)}), plus cher à ${worst.label} ` +
          `(${worst.r.toFixed(2)}), soit un rapport de ${(worst.r / best.r).toFixed(2)}`
      );
    }
  } else {
    const bps = Object.values(table.xlm).map((v) => v.bp).sort((a, b) => a - b);
    console.log(`table ${table.month}, ${table.instruments} lignes, ${table.shaped ?? 0} profils de séance`);
    console.log(`médiane ${bps[bps.length >> 1]} bp, du plus serré ${bps[0]} au plus large ${bps.at(-1)}`);
    // What the shapes say as a group: the hours worth trading and the hours worth
    // avoiding, which is the whole reason for reading these sheets.
    const shapes = Object.values(table.xlm).filter((v) => v.shape);
    if (shapes.length) {
      const median = (xs) => xs.sort((a, b) => a - b)[xs.length >> 1];
      console.log("\nprofil médian de la séance, en multiple de la moyenne du jour");
      for (const [i, label] of (table.slots || []).entries()) {
        const col = shapes.map((v) => v.shape[i]).filter((r) => r != null);
        if (col.length) console.log(`   ${label}  ${median(col).toFixed(2)}  sur ${col.length} fonds`);
      }
    }
    console.log(`\n${table.url}`);
  }
}
