// The URL that gives the spread for a listing, and the spread itself where it can be
// read. One adapter per data source, keyed on the triple (place, ISIN, devise) that
// `venues.mjs` resolves.
//
// Reporting one venue's number for another venue's book is the mistake this script
// exists to prevent, so a listing whose venue has no free source is left empty with
// a reason rather than filled from a neighbour.
//
// It describes exchanges, not brokers, so one file serves every broker parser:
// `parsed_json/spread.json`, holding the average spread of each order book and nothing
// else. Everything derivable is derived instead of stored — the venue's name and hours
// from `venues.mjs`, the page behind the figure from `spreadUrl` — which leaves the
// file readable at a glance.
//
//   node spread.mjs                              -- listings from trading212-parsed.json
//   node spread.mjs --rows=parsed_json/xtb-parsed.json
//   node spread.mjs --rows=a.json,b.json         -- several brokers at once
//   node spread.mjs --refresh                    -- refetch instead of trusting the file
//   node spread.mjs --out=other.json             -- write somewhere else
//   node spread.mjs --min-gap=90                 -- minutes before a listing is resampled
//   node spread.mjs --jobs=8                     -- listings in flight at once
//
// Run it a few times across a session and the published figure becomes a median of
// readings rather than one snapshot, which is what makes it worth costing a trade
// with. Out of hours it adds nothing and leaves the stored average alone.

import puppeteer from "puppeteer-core";
import fs from "node:fs";
import { listingKey, sessionState, spreadUrl } from "./venues.mjs";
import { monthlyXlm } from "./xlm-monthly.mjs";

const arg = (name) => {
  for (const a of process.argv.slice(2)) {
    const m = a.match(new RegExp(`^--${name}=(.+)$`, "i"));
    if (m) return m[1];
  }
  return "";
};
const REFRESH = process.argv.includes("--refresh");
const STORE_PATH = arg("out") || "parsed_json/spread.json";

// ------------------------------------------------------------------- the listings

const rowFiles = (arg("rows") || "parsed_json/trading212-parsed.json").split(",").map((s) => s.trim());

const listings = new Map();

// Everything a broker offers that cannot be priced, counted by reason. A gap that is
// merely counted is still visible; a gap that is silently skipped is how a catalogue
// comes to look better covered than it is. Deduplicated the same way listings are, so a
// fund eight brokers all offer in New York counts once.
const gaps = {};
const gapSeen = new Set();
function noteGap(why, key, example) {
  if (gapSeen.has(key)) return;
  gapSeen.add(key);
  const gap = (gaps[why] ||= { cotations: 0, exemples: [] });
  gap.cotations++;
  if (gap.exemples.length < 3) gap.exemples.push(example);
}

for (const file of rowFiles) {
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  const rows = Array.isArray(parsed) ? parsed : parsed.rows || [];
  const broker = file.replace(/.*\/|-parsed\.json/g, "");
  for (const row of rows) {
    const isin = String(row.isin || "").toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) continue;
    const { key, venue, assumed, unsourced } = listingKey(row);
    const currency = String(row.currency || "").trim().toUpperCase();
    const shown = `${row.ticker || row.symbol || isin} ${currency}`.trim();

    if (!venue?.source) {
      noteGap(
        unsourced
          ? `${unsourced.name} : ${unsourced.why}`
          : `place non reconnue : "${row.exchange || row.venue || row.exchangeName || ""}"`,
        key,
        shown
      );
      continue;
    }
    // The currency is half of a listing's identity: the same fund on the same exchange
    // in two currencies is two order books, 1.09 bp and 0.80 bp on the LSE for one of
    // them, so a row that omits it cannot be priced from either.
    if (!currency) {
      noteGap("devise absente du catalogue du broker", key, `${shown} chez ${broker}`);
      continue;
    }
    if (listings.has(key)) {
      listings.get(key).brokers.add(broker);
      continue;
    }
    listings.set(key, {
      key,
      isin,
      currency,
      ticker: String(row.ticker || row.symbol || "").toUpperCase(),
      name: row.name || "",
      exchangeAsGiven: row.exchange || row.venue || row.exchangeName || "",
      mic: venue?.mic || null,
      path: venue?.path || venue?.mic || null,
      exchange: venue?.name || null,
      source: venue?.source || null,
      venue: venue || null,
      venueAssumed: assumed,
      unsourced: unsourced || null,
      brokers: new Set([broker]),
    });
  }
}

console.error(`${listings.size} cotations distinctes (place + ISIN + devise) dans ${rowFiles.length} fichier(s)`);

// ---------------------------------------------------------------------- adapters

// The published answer: fund, place, devise, average spread. A number and nothing
// beside it, because everything else about a listing is either derivable or belongs in
// the log. A listing with no trustworthy figure is absent rather than null: absence
// cannot be mistaken for a free trade.
const store = fs.existsSync(STORE_PATH) ? JSON.parse(fs.readFileSync(STORE_PATH, "utf8")) : {};
const spreads = (store.spreads ||= {});
const bpOf = (l) => spreads[l.isin]?.[l.mic]?.[l.currency] ?? null;
const publish = (l, bp) => {
  if (bp == null) {
    delete spreads[l.isin]?.[l.mic]?.[l.currency];
    if (spreads[l.isin]?.[l.mic] && !Object.keys(spreads[l.isin][l.mic]).length) delete spreads[l.isin][l.mic];
    if (spreads[l.isin] && !Object.keys(spreads[l.isin]).length) delete spreads[l.isin];
    return;
  }
  (((spreads[l.isin] ||= {})[l.mic] ||= {})[l.currency] = bp);
};

// What the script has to remember between runs to keep that number honest, kept apart
// from it: the readings the median is taken over, when the last one landed, and whether
// the exchange has already said it has no figure for this fund. Same file, so the
// evidence can never drift away from the conclusion it supports.
const state = (store.state ||= {});
const stateKey = (l) => `${l.isin}|${l.mic}|${l.currency}`;

// Xetra's whole table, fetched once per month rather than per listing.
const { xlm, month: xlmMonth } = await monthlyXlm({ refresh: REFRESH });

// A crossed book means the feed is confused, not that the trade is profitable, so it
// yields nothing rather than a negative cost.
const bpFrom = (bid, ask) => {
  if (!(bid > 0) || !(ask > 0) || ask < bid) return null;
  return ((ask - bid) / ((ask + bid) / 2)) * 1e4;
};

// A single snapshot is a poor estimate of what a trade will cost: the same fund was
// measured moving by a factor of 1.7 within a session, and another by 3. So readings
// accumulate and the published figure is their median, which is what Deutsche Boerse
// does to build XLM. The median rather than the mean because one wide print during a
// thin minute should not move the answer.
//
// Keeping the history is also what lets the figure survive the close: an evening run
// adds nothing and leaves yesterday's average standing.
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const READING_DAYS = 90;
const READING_KEEP = 24;
const MIN_GAP_MIN = Number(arg("min-gap") || 30);

// Two of the four sources decrypt their quotes in the page, so a browser is needed —
// but only for those. One connection, and one tab per worker, opened only if that
// worker ever meets a listing that needs one.
const CONCURRENCY = Math.max(1, Number(arg("jobs") || 4));
const pages = [];
// Memoising the promise rather than the connection is what makes this safe to call
// from several workers at once: the assignment happens before anyone awaits, so they
// all share one connection. Storing the resolved browser instead let four workers
// each open their own, and the three nobody closed kept the process alive for ever.
let connecting = null;
const connect = () =>
  (connecting ||= puppeteer.connect({
    browserURL: "http://127.0.0.1:9222",
    defaultViewport: null,
    protocolTimeout: 240000,
  }));

async function tab() {
  const p = await (await connect()).newPage();
  // Only one tab can be in front, and Chrome throttles the rest: with four working at
  // once, twelve of fifty Xetra pages ran out of time purely from being backgrounded.
  // Declaring the lifecycle state active exempts them.
  await p
    .createCDPSession()
    .then((s) => s.send("Page.setWebLifecycleState", { state: "active" }))
    .catch(() => {});
  pages.push(p);
  return p;
}

const adapters = {
  // Deutsche Boerse publishes XLM, the round trip cost in basis points for a standard
  // volume, averaged over the month. It is a sturdier number than a touch snapshot,
  // and it survives the close, but it is not comparable to one.
  //
  // The whole table arrives in one monthly workbook, so this source costs no request
  // per listing and no browser at all. Reading the same figures off the website took a
  // tab and ten seconds each, and answered 503 within a minute of going wide.
  xetra: {
    measure: "XLM, aller-retour sur volume standard, moyenne mensuelle",
    local: true,
    async fetch(l) {
      const line = xlm[`${l.isin}|${l.currency}`];
      if (line) return { spreadBp: line.bp };
      // The fund can be on Xetra without being on this line of it: another currency is
      // another order book, and borrowing its figure is the error this file prevents.
      const elsewhere = Object.keys(xlm)
        .filter((k) => k.startsWith(`${l.isin}|`))
        .map((k) => k.split("|")[1]);
      return {
        spreadBp: null,
        settled: true,
        note: elsewhere.length
          ? `coté sur Xetra en ${elsewhere.join(" et ")}, pas en ${l.currency}`
          : "absent des statistiques Xetra",
      };
    },
  },

  // The LSE answers on a plain unauthenticated endpoint keyed by TIDM, and the TIDM is
  // per currency line, which is exactly the granularity a spread needs.
  lse: {
    dataUrl: (l) => `https://api.londonstockexchange.com/api/gw/lse/instruments/alldata/${l.ticker}`,
    measure: "touche du carnet, différé 15 min",
    async fetch(l) {
      if (!l.ticker) return { spreadBp: null, note: "ticker manquant, clé de recherche du LSE" };
      const res = await fetch(adapters.lse.dataUrl(l), {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return { spreadBp: null, note: `LSE a répondu ${res.status}` };
      const j = await res.json();
      // A ticker that resolves to another fund would silently poison the row, so the
      // ISIN the exchange returns has to agree with the one we asked about.
      if (j.isin && j.isin.toUpperCase() !== l.isin) {
        return { spreadBp: null, note: `le ticker ${l.ticker} pointe sur ${j.isin}` };
      }
      return {
        spreadBp: bpFrom(Number(j.bid), Number(j.offer)),
        bid: Number(j.bid) || null,
        ask: Number(j.offer) || null,
        tradingCurrency: j.currency || null,
      };
    },
  },

  // SIX returns one row per trading currency for a given ISIN, so the currency picks
  // the line without needing a symbol at all.
  six: {
    dataUrl: (l) =>
      `https://www.six-group.com/fqs/snap.json?select=ISIN,ValorSymbol,BidPrice,AskPrice,TradingCurrency,ValorId&where=ISIN=${l.isin}`,
    measure: "touche du carnet, différé 15 min",
    async fetch(l) {
      const res = await fetch(adapters.six.dataUrl(l), {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return { spreadBp: null, note: `SIX a répondu ${res.status}` };
      const j = await res.json();
      const cols = j.colNames || [];
      const rows = (j.rowData || []).map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i]])));
      const line = rows.find((r) => String(r.TradingCurrency).toUpperCase() === l.currency);
      if (!line) {
        return {
          spreadBp: null,
          note: rows.length
            ? `pas de ligne en ${l.currency} (SIX propose ${rows.map((r) => r.TradingCurrency).join(", ")})`
            : "ISIN absent de SIX",
        };
      }
      return {
        spreadBp: bpFrom(Number(line.BidPrice), Number(line.AskPrice)),
        bid: Number(line.BidPrice) || null,
        ask: Number(line.AskPrice) || null,
        tradingCurrency: line.TradingCurrency,
      };
    },
  },

  // Euronext encrypts its quote endpoint and decrypts it in the page, so the rendered
  // book is the accessible form. One adapter covers Paris, Amsterdam, Brussels, Lisbon
  // and Milan, which share the platform.
  euronext: {
    measure: "touche du carnet, clôture ou différé",
    async fetch(l, ownTab) {
      const p = await ownTab();
      try {
        await p.goto(spreadUrl(l), { waitUntil: "networkidle2", timeout: 60000 });
        await new Promise((r) => setTimeout(r, 3000));
      } catch {
        return { spreadBp: null, note: "page Euronext non chargée" };
      }
      const found = await p.evaluate(() => {
        const text = (document.body?.innerText || "").replace(/\u00a0/g, " ");
        const grab = (label) => {
          const m = text.match(new RegExp(`${label}\\s*([\\d.,]+)`, "i"));
          return m?.[1] ? Number(m[1].replace(/,/g, "")) : null;
        };
        return { bid: grab("Best Bid"), ask: grab("Best Ask"), notFound: /instrument not found/i.test(text) };
      });
      if (found.notFound) return { spreadBp: null, note: `non coté sur ${l.mic}` };
      return { spreadBp: bpFrom(found.bid, found.ask), bid: found.bid, ask: found.ask };
    },
  },
};

// ------------------------------------------------------------------------- resolve

// A listing whose venue has no free source can never be visited, so it is counted by
// reason for the log instead of written to the file one empty entry at a time.
const gaps = {};
for (const l of listings.values()) {
  if (l.source) continue;
  const why = l.unsourced
    ? `${l.unsourced.name} : ${l.unsourced.why}`
    : `place non reconnue : "${l.exchangeAsGiven}"`;
  const gap = (gaps[why] ||= { cotations: 0, exemples: [] });
  gap.cotations++;
  if (gap.exemples.length < 3) gap.exemples.push(`${l.ticker || l.isin} ${l.currency}`);
}
if (vague.cotations) gaps["devise absente du catalogue du broker"] = vague;

// Worth visiting when there is no figure yet, or when the last reading is old enough
// that another one would add something. Xetra publishes an average already, so once
// read it needs no resampling.
function worthVisiting(l) {
  if (!l.source) return false;
  if (REFRESH) return true;
  // A table already in hand costs nothing to consult, so it is consulted every run.
  // That is how a new month's figures reach the file without anyone asking.
  if (adapters[l.source].local) return true;
  const seen = state[stateKey(l)];
  if (!seen) return true;
  // A fund the exchange said it does not measure stays answered; anything else that
  // came back empty is worth another attempt.
  if (seen.settled) return false;
  return Date.now() - (Date.parse(seen.at) || 0) > MIN_GAP_MIN * 60000;
}

const todo = [...listings.values()].filter(worthVisiting);
console.error(`${todo.length} à visiter, ${listings.size - todo.length} à jour\n`);

// Rewriting thousands of entries after every single listing costs more than the lookups
// do, so it lands in batches and once more at the end.
let done = 0;
const notes = new Map();
const flush = () => {
  fs.mkdirSync("parsed_json", { recursive: true });
  fs.writeFileSync(
    STORE_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        unit: "spreads[ISIN][place][devise] = spread moyen en points de base, aller-retour : acheter puis revendre aussitôt coûte montant * bp / 10000",
        spreads,
        state,
      },
      null,
      2
    )
  );
};

async function visit(l, ownTab) {
  const adapter = adapters[l.source];
  console.error(`[${++done}/${todo.length}] ${l.ticker || l.isin} ${l.currency} @ ${l.exchange}`);

  const seen = state[stateKey(l)] || {};
  // Xetra's XLM is a monthly average and can be read any time; a touch snapshot only
  // means something while the book is open, so outside the session there is nothing
  // to gain by asking and the stored average simply stands.
  const snapshot = adapter.measure.startsWith("touche");
  const session = sessionState(l.venue);

  let measured;
  if (snapshot && session.open === false) {
    measured = { spreadBp: null, note: `marché fermé (${session.why}), non interrogé` };
  } else {
    try {
      measured = await adapter.fetch(l, ownTab);
    } catch (e) {
      measured = { spreadBp: null, note: `échec : ${String(e.message || e).slice(0, 80)}` };
    }
  }
  // A currency the exchange disagrees with means the line measured is not the line
  // the broker sells. Pence and pounds are the same book quoted two ways, so only a
  // real disagreement counts.
  const said = measured.tradingCurrency?.toUpperCase();
  const sterling = new Set(["GBP", "GBX"]);
  const mismatch =
    said && said !== l.currency && !(sterling.has(said) && sterling.has(l.currency)) ? said : null;

  const reading = measured.spreadBp == null ? null : Number(measured.spreadBp.toFixed(2));
  // A zero spread is an auction or a locked book, not a free trade, so it is not
  // allowed into the history.
  const keep = reading != null && reading > 0;

  // Snapshot readings are values without dates, and only the last few are kept: enough
  // for a steady median, cheap enough to carry for thousands of listings. Their span is
  // bounded from the other end instead — a history nobody has added to in months
  // describes a book that has moved on, so it goes rather than averaging stale prints
  // into today's answer. An exchange that publishes its own average needs none of this.
  const stale = Date.parse(seen.at) < Date.now() - READING_DAYS * 86400000;
  const readings = snapshot && !stale ? [...(seen.bp || [])] : [];
  if (snapshot && keep) readings.push(reading);
  while (readings.length > READING_KEEP) readings.shift();

  // The figure to cost a trade with: a median of in-session readings for the snapshot
  // venues, the published average for Xetra.
  const average = snapshot ? (readings.length ? Number(median(readings).toFixed(2)) : null) : reading;
  publish(l, average ?? (stale ? null : bpOf(l)));

  const remember = {
    bp: readings.length ? readings : undefined,
    // Dates the reading, not the attempt: stamping this with the moment a fetch failed
    // would both read as freshness and hold off the retry that is due.
    at: keep ? new Date().toISOString() : seen.at,
    // Marks an empty answer the venue itself gave, as opposed to one we failed to
    // obtain, so no retry is spent on it.
    settled: measured.settled || seen.settled || undefined,
  };
  // A listing there is nothing to remember about — asked while the book was shut, say —
  // leaves no trace, rather than an empty object to be scrolled past.
  if (Object.values(remember).some((v) => v !== undefined)) state[stateKey(l)] = remember;
  else delete state[stateKey(l)];

  // Notes belong to the attempt, so they are reported and not written: kept in the file
  // they would sit beside a good average describing something else entirely.
  if (measured.note) notes.set(l.key, measured.note);
  console.error(
    `    ${bpOf(l) ?? "—"} bp` +
      `${snapshot && readings.length ? ` (médiane de ${readings.length} relevé${readings.length > 1 ? "s" : ""})` : ""}` +
      `  ${measured.note || ""}${mismatch ? ` (la bourse dit ${mismatch})` : ""}`
  );

  if (done % 25 === 0) flush();
}

// Each worker keeps its own tab, opened on first need, so a run that touches only the
// HTTP sources never starts a browser at all.
const queue = todo[Symbol.iterator]();
await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, todo.length) }, async () => {
    let mine = null;
    const ownTab = async () => (mine ||= await tab());
    for (const l of queue) await visit(l, ownTab);
  })
);
flush();

for (const p of pages) await p.close().catch(() => {});
if (connecting) await (await connecting).disconnect();

// -------------------------------------------------------------------- the summary

const sourced = [...listings.values()].filter((l) => l.source);
const withBp = sourced.filter((l) => bpOf(l) != null);
const thin = sourced.filter((l) => state[stateKey(l)]?.bp?.length === 1);

console.log(
  `\n${withBp.length}/${sourced.length} cotations sourçables ont une valeur` +
    `${thin.length ? `, dont ${thin.length} sur un seul relevé` : ""}\n`
);
console.log("ticker   dev   place                        spread   relevés  source");
console.log("-".repeat(118));
for (const l of sourced.sort((a, b) => a.exchange.localeCompare(b.exchange))) {
  const bp = bpOf(l);
  console.log(
    `${String(l.ticker || l.isin).padEnd(8)} ${l.currency.padEnd(5)} ` +
      `${l.exchange.slice(0, 24).padEnd(25)} ` +
      `${String(bp != null ? `${bp} bp` : "—").padStart(11)}  ` +
      `${String(state[stateKey(l)]?.bp?.length ?? "moy.").padStart(7)}  ` +
      `${bp != null ? spreadUrl(l) : notes.get(l.key) || "jamais relevé"}`
  );
}

const unsourced = listings.size - sourced.length + vague.cotations;
if (unsourced) {
  console.log(`\nsans source (${unsourced}) :`);
  for (const [why, g] of Object.entries(gaps).sort((a, b) => b[1].cotations - a[1].cotations)) {
    console.log(`  ${String(g.cotations).padStart(4)}x  ${why}   ex. ${g.exemples.join(", ")}`);
  }
}

console.log(
  `\n${STORE_PATH} : ${Object.keys(spreads).length} ISIN, ` +
    `${(fs.statSync(STORE_PATH).size / 1024).toFixed(0)} Ko`
);
