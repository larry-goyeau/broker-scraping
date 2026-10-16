// Disnat's public fiche prints bid and ask with no login. The United States
// side of the catalogue already has the NBBO, so those lines are not read.
// Canada is one quote per symbol and the page does not name the board: a
// name that also sits on Cboe Canada is stored on its home board only
// (Toronto, then Venture, then the CSE). A Cboe-only name stays on NEOE.
// A stamp from before 09:30 Toronto is the previous board and is left out.
//
//   node brokers/disnat/disnat_touch.mjs

import fs from "node:fs";

const CATALOGUE = new URL("disnat-parsed.json", import.meta.url);
const TOUCHES = new URL("disnat-touches.jsonl", import.meta.url);
const SPREAD = new URL("../../spreads/spread.json", import.meta.url);
const LOCK = new URL("../../spreads/spread.json.lock", import.meta.url);
const PAGE = "https://www.disnat.com/en/learning/quotes-and-market-data";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const CONCURRENCY = 6;
const RANK = { TSX: 0, TSXV: 1, CSE: 2, NEO: 3 };
const MIC = { TSX: "XTSE", TSXV: "XTSX", CSE: "XCNQ", NEO: "NEOE" };
const OPEN = 9 * 60 + 30;
const CLOSE = 16 * 60;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function todayToronto() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function minutesToronto() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Toronto",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t) => Number(parts.find((p) => p.type === t)?.value);
  return get("hour") * 60 + get("minute");
}

function money(text) {
  const n = Number(String(text || "").replace(/[^0-9.]/g, ""));
  return n > 0 ? n : null;
}

function readStamp(html) {
  const m = html.match(/qTimeStampEDT">\s*(\d{4}\/\d{2}\/\d{2})\s+(\d{2}):(\d{2})/);
  if (!m) return null;
  return { date: m[1].replaceAll("/", "-"), minutes: Number(m[2]) * 60 + Number(m[3]), text: `${m[1]} ${m[2]}:${m[3]}` };
}

function field(html, label) {
  const m = html.match(new RegExp(`${label}\\s*<strong>\\s*<span[^>]*>([^<]*)`, "i"));
  return m ? m[1].trim() : "";
}

function inSession(stamp) {
  return stamp && stamp.date === todayToronto() && stamp.minutes >= OPEN && stamp.minutes <= CLOSE;
}

function believable(bid, ask, last) {
  // The fiche repeats one price under bid and under ask. That is not a book.
  if (!(bid > 0) || !(ask > bid)) return false;
  if (!(last > 0)) return true;
  const pad = Math.max(bid, ask) * 0.005;
  return last + pad >= bid && last - pad <= ask;
}

function bpFrom(bid, ask) {
  if (!(bid > 0) || !(ask > 0) || ask < bid) return null;
  return Math.round((((ask - bid) / ((ask + bid) / 2)) * 1e4) * 100) / 100;
}

async function fiche(ticker) {
  const symbol = `${String(ticker).replaceAll("/", ".")}-C`;
  const url = `${PAGE}/${encodeURI(symbol)}`;
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html" },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.status === 404) return null;
      if (response.ok) {
        const html = await response.text();
        return { html, url };
      }
      last = `${response.status}`;
      if (response.status === 429) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      if (response.status < 500) return null;
    } catch (error) {
      last = String(error.message || error).slice(0, 80);
    }
    await sleep(400 * (attempt + 1));
  }
  throw new Error(last || "échec");
}

function quoteOf(html) {
  const bid = money(field(html, "Price Bid"));
  const ask = money(field(html, "Price Ask"));
  const last = money(field(html, "class=\"qLast\""));
  const lastFromClass = html.match(/class="qLast"[^>]*>([^<]+)/);
  const printed = last || money(lastFromClass?.[1] || "");
  return { bid, ask, last: printed, stamp: readStamp(html) };
}

function jobs() {
  const parsed = JSON.parse(fs.readFileSync(CATALOGUE, "utf8"));
  const rows = Array.isArray(parsed) ? parsed : parsed.rows || [];
  const spreads = JSON.parse(fs.readFileSync(SPREAD, "utf8")).spreads || {};
  const groups = new Map();
  for (const row of rows) {
    if (!(row.exchange in RANK)) continue;
    const currency = String(row.currency || "").toUpperCase();
    const key = `${String(row.isin || "").toUpperCase()}|${currency}`;
    const list = groups.get(key) || [];
    list.push(row);
    groups.set(key, list);
  }
  const out = [];
  for (const group of groups.values()) {
    group.sort((a, b) => RANK[a.exchange] - RANK[b.exchange]);
    const row = group[0];
    const mic = MIC[row.exchange];
    const currency = String(row.currency || "").toUpperCase();
    const isin = String(row.isin || "").toUpperCase();
    const leaf = spreads[isin]?.[mic]?.[currency];
    if (leaf?.bp > 0 || leaf?.perShare) continue;
    out.push({ isin, ticker: row.ticker, name: row.name, exchange: row.exchange, mic, currency });
  }
  return out;
}

function lockHeld() {
  if (!fs.existsSync(LOCK)) return false;
  try {
    const pid = JSON.parse(fs.readFileSync(LOCK, "utf8")).pid;
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function apply(leaves) {
  const file = JSON.parse(fs.readFileSync(SPREAD, "utf8"));
  let added = 0;
  for (const leaf of leaves) {
    const book = ((file.spreads[leaf.isin] ||= {})[leaf.mic] ||= {});
    if (book[leaf.currency]?.bp > 0 || book[leaf.currency]?.perShare) continue;
    book[leaf.currency] = { bp: leaf.bp, url: leaf.url };
    added += 1;
  }
  if (!added) return 0;
  file.generatedAt = new Date().toISOString();
  const tmp = `${SPREAD.pathname}.disnat-tmp`;
  fs.writeFileSync(tmp, JSON.stringify(file, null, 2));
  fs.renameSync(tmp, SPREAD.pathname);
  return added;
}

async function waitForSession() {
  for (;;) {
    const now = minutesToronto();
    if (now >= OPEN && now <= CLOSE) {
      const page = await fiche("RY");
      const quote = page ? quoteOf(page.html) : null;
      if (quote?.stamp && inSession(quote.stamp)) {
        console.error(`séance visible, Banque Royale ${quote.stamp.text} bid ${quote.bid} ask ${quote.ask}`);
        return;
      }
      console.error(`fiche encore hors séance (${quote?.stamp?.text || "sans heure"}), nouvel essai`);
    } else {
      console.error("Toronto est fermé");
      return;
    }
    if (now > 10 * 60 + 15) {
      console.error("la fiche n'est pas entrée dans la séance");
      return;
    }
    await sleep(20_000);
  }
}

const todo = jobs();
console.error(`${todo.length} lignes Canada sans carnet`);
await waitForSession();

const found = [];
let cursor = 0;
let done = 0;
let skipped = 0;
async function worker() {
  while (cursor < todo.length) {
    const job = todo[cursor];
    cursor += 1;
    let page = null;
    try {
      page = await fiche(job.ticker);
    } catch (error) {
      console.error(`${job.ticker} ${error.message}`);
    }
    const quote = page ? quoteOf(page.html) : null;
    if (!quote || !inSession(quote.stamp) || !believable(quote.bid, quote.ask, quote.last)) {
      skipped += 1;
    } else {
      const bp = bpFrom(quote.bid, quote.ask);
      if (bp == null) skipped += 1;
      else {
        const leaf = { ...job, bp, bid: quote.bid, ask: quote.ask, url: page.url, at: quote.stamp.text };
        found.push(leaf);
        fs.appendFileSync(TOUCHES, `${JSON.stringify(leaf)}\n`);
      }
    }
    done += 1;
    if (done % 25 === 0 || done === todo.length) {
      console.error(`${done}/${todo.length}, ${found.length} carnets, ${skipped} laissés`);
    }
  }
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length || 1) }, () => worker()));

if (!found.length) {
  console.error("rien à écrire");
  process.exit(0);
}
for (let attempt = 0; attempt < 40 && lockHeld(); attempt += 1) {
  console.error("un autre passage écrit le fichier partagé");
  await sleep(15_000);
}
if (lockHeld()) {
  console.error("fichier partagé occupé, les carnets restent dans le journal");
  process.exit(1);
}
const added = apply(found);
console.error(`${added} carnets écrits`);
