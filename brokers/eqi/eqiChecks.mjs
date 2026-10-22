// The checks eqi_scraping.mjs runs on Morningstar's lines before writing
// eqi-parsed.json. The sources and the reasons are in the header of
// eqi_scraping.mjs; this file only holds the rules, so they can be rerun on
// saved exchange lists without reading Morningstar again.
//
//   applyChecks(rows, { t7, nasdaq, lse, today })
//     t7      { XETR, XFRA }: parseT7() of Deutsche Börse's lists
//     nasdaq  parseNasdaqTrader() of nasdaqlisted.txt + otherlisted.txt
//     lse     Map TIDM -> LSE instrument record (null: the LSE answered 404;
//             absent: not read, the line is kept as it is)
//     today   "YYYY-MM-DD"
//   residency(rows) marks the packaged lines a UK client cannot be sold.

export const GERMAN = new Set(["XETR", "XFRA", "XDUS", "XHAM", "XMUC", "XSTU", "XBER"]);
export const US_LISTED = new Set(["XNYS", "XNAS", "XASE", "ARCX"]);

// ISIN countries whose home market is one of EQi's places, plus Austria
// (Xetra is an Austrian share's usual German line; Vienna is no EQi place,
// a question left to EQi).
export const NAMED_HOMES = new Set(["GB", "IE", "DE", "AT", "FR", "NL", "BE", "PT", "IT", "ES", "LU", "SE", "DK", "FI", "NO", "CH", "US", "CA"]);

// Börse Berlin has no MIC in this repository (the row carries none).
const micOf = (r) => r.mic || (r.exchange === "Börse Berlin" ? "XBER" : "");
const german = (r) => GERMAN.has(micOf(r));

const isinOf = (v) => (/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(String(v || "").trim().toUpperCase()) ? String(v).trim().toUpperCase() : "");
const day = (v) => String(v || "").slice(0, 10);

// Deutsche Börse "allTradableInstruments" CSV -> Map ISIN -> [{ currency, mnemonic }]
// of the lines whose Instrument Status is Active.
export function parseT7(body) {
  const lines = String(body).split(/\r?\n/);
  const at = lines.findIndex((line) => line.startsWith("Product Status;"));
  const header = (lines[at] || "").split(";");
  const [statusAt, isinAt, tickerAt, currencyAt] = ["Instrument Status", "ISIN", "Mnemonic", "Currency"].map((c) => header.indexOf(c));
  if (at < 0 || Math.min(statusAt, isinAt, tickerAt, currencyAt) < 0) throw new Error("Deutsche Börse list: header changed");
  const out = new Map();
  for (const line of lines.slice(at + 1)) {
    const cells = line.split(";");
    const isin = isinOf(cells[isinAt]);
    if (!isin || cells[statusAt] !== "Active") continue;
    if (!out.has(isin)) out.set(isin, []);
    out.get(isin).push({ currency: cells[currencyAt], mnemonic: String(cells[tickerAt] || "").toUpperCase() });
  }
  if (out.size < 1000) throw new Error(`Deutsche Börse list: only ${out.size} active ISINs`);
  return out;
}

const nameKey = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/®|™/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// Nasdaq Trader's two symbol directories -> { symbols, byName }. A symbol is
// also filed in the spellings Morningstar uses for share classes and
// preferreds: BRK.B / BRKB, GAB$D / GABPD / GABPRD / GAB.PR.D.
export function parseNasdaqTrader(bodies) {
  const symbols = new Set();
  const byName = new Map();
  const add = (s) => {
    const u = String(s || "").trim().toUpperCase();
    if (!u) return;
    symbols.add(u);
    if (u.includes(".")) symbols.add(u.replace(/\./g, ""));
    const pref = u.match(/^([A-Z]+)\$([A-Z]*)$/);
    if (pref) for (const form of [`${pref[1]}P${pref[2]}`, `${pref[1]}PR${pref[2]}`, `${pref[1]}.PR.${pref[2]}`, `${pref[1]}-${pref[2]}`]) symbols.add(form);
  };
  for (const body of bodies) {
    const lines = String(body).split(/\r?\n/);
    const header = (lines[0] || "").split("|");
    const test = header.indexOf("Test Issue");
    const cols = ["Symbol", "ACT Symbol", "NASDAQ Symbol"].map((c) => header.indexOf(c)).filter((i) => i >= 0);
    const nameAt = header.indexOf("Security Name");
    for (const line of lines.slice(1)) {
      const cells = line.split("|");
      if (!cells[0] || /^File Creation/.test(cells[0]) || cells[test] === "Y") continue;
      for (const i of cols) add(cells[i]);
      const key = nameKey(cells[nameAt]);
      if (key) byName.set(key, byName.has(key) ? null : cells[cols[0]].toUpperCase());
    }
  }
  if (symbols.size < 8000) throw new Error(`Nasdaq Trader lists only ${symbols.size} symbols`);
  return { symbols, byName };
}

// What the LSE says of one London line: null when it keeps the line as it
// is, otherwise { drop: reason } or { isin, name, why } to correct it.
const GENERIC = new Set(["plc", "ltd", "limited", "inc", "corp", "the", "etf", "etp", "etc", "etn", "ucits", "acc", "dist", "dis", "usd", "gbp", "eur", "chf", "class", "shares", "share", "ord", "ordinary", "daily", "long", "short", "fund", "trust", "investment", "public", "company", "co", "group", "holdings", "ser", "series", "sa", "ag", "nv", "se", "msci", "index", "ishares", "xtrackers", "amundi", "spdr", "vanguard", "invesco", "wisdomtree"]);
const words = (s) => new Set(nameKey(s).split(" ").filter((w) => w.length >= 3 && !GENERIC.has(w)));
function sameTitle(a, b) {
  const wa = words(a);
  const wb = words(b);
  for (const w of wa) if (wb.has(w)) return true;
  return false;
}

export function lseVerdict(row, record, today, nameOfIsin) {
  if (record === undefined) return null;
  if (record === null) return { drop: "no such line at the LSE (404)" };
  if (String(record.market || "").toUpperCase() === "OTHERS") return { drop: `LSE market OTHERS, segment ${record.segment || "?"} (off-book reporting code)` };
  if (record.tradingstatus === "S" || record.suspend) return { drop: `suspended (last close ${day(record.lastclosedate) || "none"})` };
  const last = [day(record.lastclosedate), day(record.lastpricedate)].filter(Boolean).sort().pop() || "";
  const quoted = Number(record.bid) > 0 || Number(record.offer) > 0;
  const cutoff = new Date(Date.parse(`${today}T00:00:00Z`) - 92 * 86400_000).toISOString().slice(0, 10);
  if (!quoted && last < cutoff) return { drop: last ? `no close since ${last} and no quote` : "never closed, no quote" };
  const isin = isinOf(record.isin);
  if (isin && isin !== row.isin) {
    const other = nameOfIsin.get(isin);
    if (other) return { isin, name: other, why: `LSE ISIN ${isin} (was ${row.isin}; the TIDM is that title's)` };
    if (sameTitle(row.name, record.description || record.issuername || "")) return { isin, why: `LSE ISIN ${isin} (was ${row.isin})` };
    return { drop: `TIDM now names another instrument: ${record.description || isin}` };
  }
  return null;
}

// "TICKER place name" for the log.
const label = (r) => `${r.ticker} ${r.mic || r.exchange} ${r.isin || "-"} ${r.name}`;

export function applyChecks(input, { t7, nasdaq, lse, today }) {
  const log = new Map();
  const note = (rule, row, extra = "") => {
    if (!log.has(rule)) log.set(rule, []);
    log.get(rule).push(`${label(row)}${extra ? ` (${extra})` : ""}`);
  };
  let rows = input.slice();

  // Rule 144A: qualified institutional buyers only.
  rows = rows.filter((r) => {
    if (!/144A/i.test(r.name)) return true;
    note("144A", r);
    return false;
  });

  // London: the LSE's own record of every TIDM.
  const nameOfIsin = new Map();
  for (const r of rows) if (r.isin && !nameOfIsin.has(r.isin)) nameOfIsin.set(r.isin, r.name);
  const lseOwn = new Map();
  for (const r of rows) if (r.mic === "XLON") lseOwn.set(r, lseVerdict(r, lse.get(r.ticker), today, nameOfIsin));
  rows = rows.filter((r) => {
    const verdict = lseOwn.get(r);
    if (!verdict) return true;
    if (verdict.drop) {
      const rule = /^LSE market OTHERS/.test(verdict.drop) ? "London OTHERS" : "London dead";
      note(rule, r, verdict.drop);
      return false;
    }
    note("London ISIN", r, verdict.why);
    r.isin = verdict.isin;
    if (verdict.name) r.name = verdict.name;
    r.raw += ` | ISIN from the LSE instrument API`;
    return true;
  });

  // US: Nasdaq Trader lists every Nasdaq, NYSE, NYSE American and Arca line.
  rows = rows.filter((r) => {
    if (!US_LISTED.has(r.mic)) return true;
    if (nasdaq.symbols.has(r.ticker)) return true;
    {
      const symbol = nasdaq.byName.get(nameKey(r.name));
      if (symbol && !rows.some((o) => o !== r && o.mic === r.mic && o.ticker === symbol)) {
        note("US symbol from name", r, symbol);
        r.ticker = symbol;
        r.query = symbol;
        r.raw += ` | symbol ${symbol} from Nasdaq Trader (same name)`;
        return true;
      }
    }
    note("US not listed", r);
    return false;
  });

  // Germany: Deutsche Börse's T7 lists (Xetra; Börse Frankfurt). A regional
  // floor line stays when its ISIN is active on either.
  const active = (mic, isin) => (mic === "XETR" ? t7.XETR : t7.XFRA).get(isin) || [];
  const byPlace = new Map();
  for (const r of rows) {
    const key = `${r.isin}|${micOf(r)}`;
    if (!byPlace.has(key)) byPlace.set(key, []);
    byPlace.get(key).push(r);
  }
  rows = rows.filter((r) => {
    if (!german(r)) return true;
    if (r.mic === "XETR" || r.mic === "XFRA") {
      const lines = active(r.mic, r.isin);
      if (!lines.length) {
        note(`T7 not active ${r.mic}`, r);
        return false;
      }
      if (lines.some((l) => l.currency === r.currency)) return true;
      const twin = byPlace.get(`${r.isin}|${r.mic}`).some((o) => o !== r && lines.some((l) => l.currency === o.currency));
      const currencies = [...new Set(lines.map((l) => l.currency))];
      if (twin || currencies.length !== 1) {
        note(`T7 currency ${r.mic}`, r, `${r.currency}; T7 ${currencies.join("/")}, ${twin ? "the T7 currency line is in the file" : "ambiguous"}`);
        return false;
      }
      note(`T7 currency fixed ${r.mic}`, r, `${r.currency} -> ${currencies[0]}`);
      r.raw += ` | currency ${currencies[0]} from the Deutsche Börse list (Morningstar ${r.currency})`;
      r.currency = currencies[0];
      return true;
    }
    if (active("XETR", r.isin).length || active("XFRA", r.isin).length) return true;
    note("T7 not active floor", r);
    return false;
  });

  // Germany, off market: a share whose home market EQi names nowhere, and
  // whose ISIN is on no other EQi place in the file.
  const elsewhere = new Set(rows.filter((r) => !german(r) && r.isin).map((r) => r.isin));
  rows = rows.filter((r) => {
    if (!german(r) || r.type !== "STOCK" || !r.isin) return true;
    if (NAMED_HOMES.has(r.isin.slice(0, 2)) || elsewhere.has(r.isin)) return true;
    note("German, home market not EQi's", r);
    return false;
  });

  return { rows, log };
}

// One line per ISIN + place + currency: the one whose ISIN Morningstar
// printed (not filled from the shared lists), else the first.
export function dedupe(rows, log) {
  const seen = new Map();
  const out = [];
  for (const r of rows) {
    const key = r.isin ? `${r.isin}|${r.exchange}|${r.currency}` : `${r.ticker}|${r.exchange}|${r.currency}`;
    const prior = seen.get(key);
    if (!prior) {
      seen.set(key, r);
      out.push(r);
      continue;
    }
    const own = (x) => Boolean(x.isin && x.raw.includes(x.isin));
    const keep = !own(prior) && own(r) ? r : prior;
    const drop = keep === r ? prior : r;
    if (keep === r) out[out.indexOf(prior)] = r;
    seen.set(key, keep);
    if (!log.has("duplicate")) log.set("duplicate", []);
    log.get("duplicate").push(`${label(drop)} (kept ${keep.ticker})`);
  }
  return out;
}

// A Swiss-law fund: CH ISIN, the ETF tab, "(CH)" or "ETF" in the name and
// no ETP / ETC / ETN (those CH lines are notes: 21Shares, Leonteq, UBS ETC).
export const swissFund = (r) => r.type === "ETF" && /^CH/.test(r.isin || "") && /\(CH\)|\bETF\b/.test(r.name) && !/ET[PCN]s?\b|\bNotes?\b/i.test(r.name);

export function residency(rows, log) {
  for (const r of rows) {
    if (!/^(ETF|ETN|ETC)$/.test(r.type) || !r.isin) continue;
    const cc = r.isin.slice(0, 2);
    if (cc !== "US" && cc !== "CA" && !swissFund(r)) continue;
    r.nonUkResident = true;
    const rule = `nonUkResident ${cc}`;
    if (!log.has(rule)) log.set(rule, []);
    log.get(rule).push(label(r));
  }
  return rows;
}
