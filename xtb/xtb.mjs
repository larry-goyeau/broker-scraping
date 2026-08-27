import puppeteer from "puppeteer-core";
import fs from "node:fs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function toIsin(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  return match ? match[0] : "";
}

function loadIsinsFromCsv(csvPath) {
  if (!fs.existsSync(csvPath)) return [];

  const content = fs.readFileSync(csvPath, "utf8");
  return content
    .split(/\r?\n/)
    .map((line) => {
      // Supports both: ticker,isin,name and ticker,exchange,isin,name.
      const cols = line.split(",");
      const fromKnownColumns = toIsin(cols[2]) || toIsin(cols[1]);
      if (fromKnownColumns) return fromKnownColumns;

      // Fallback: find the first ISIN-looking token in the row.
      for (const col of cols) {
        const isin = toIsin(col);
        if (isin) return isin;
      }
      return "";
    })
    .filter(Boolean);
}

function uniqueQueries(values) {
  const seen = new Set();
  return values.filter((value) => {
    const key = value.toUpperCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// --- protobuf ---------------------------------------------------------------
// XTB's platform speaks gRPC-Web, so requests and answers are protobuf rather
// than JSON. Only a handful of shapes are needed here, so they are written and
// read by hand instead of pulling in a code generator: field numbers come from
// the schema the platform ships in its own bundles.

function varint(value) {
  const bytes = [];
  let rest = BigInt(value);
  for (;;) {
    const byte = Number(rest & 0x7fn);
    rest >>= 7n;
    if (rest) bytes.push(byte | 0x80);
    else {
      bytes.push(byte);
      break;
    }
  }
  return bytes;
}

const stringField = (field, text) => {
  const bytes = Buffer.from(text, "utf8");
  return [...varint((field << 3) | 2), ...varint(bytes.length), ...bytes];
};
const numberField = (field, value) => [...varint((field << 3) | 0), ...varint(value)];

// gRPC-Web frames a message as one flag byte, its length, then the message.
// A flag with its top bit set carries the trailers instead of a message.
function frame(body) {
  const header = Buffer.alloc(5);
  header.writeUInt32BE(body.length, 1);
  return Buffer.concat([header, Buffer.from(body)]);
}

function unframe(buffer) {
  const messages = [];
  const trailers = [];
  let at = 0;
  while (at + 5 <= buffer.length) {
    const flag = buffer[at];
    const length = buffer.readUInt32BE(at + 1);
    if (at + 5 + length > buffer.length) break;
    const body = buffer.subarray(at + 5, at + 5 + length);
    if (flag & 0x80) trailers.push(body.toString("utf8"));
    else messages.push(body);
    at += 5 + length;
  }
  return { messages, trailers: trailers.join("\n") };
}

function readVarint(buffer, at) {
  let value = 0n;
  let shift = 0n;
  while (at < buffer.length) {
    const byte = buffer[at++];
    value |= BigInt(byte & 0x7f) << shift;
    if (!(byte & 0x80)) break;
    shift += 7n;
  }
  return [value, at];
}

// Reads a message without knowing its schema: every field comes back tagged
// with its number, which is all the callers below need to walk to a value.
// Length-delimited fields keep their bytes as they are, because on the wire a
// string and a nested message look alike; only the reader knows which it wants.
function decode(buffer) {
  const fields = [];
  let at = 0;
  while (at < buffer.length) {
    const start = at;
    let key;
    [key, at] = readVarint(buffer, at);
    const field = Number(key >> 3n);
    const wire = Number(key & 7n);
    if (!field) return fields;

    if (wire === 0) {
      let value;
      [value, at] = readVarint(buffer, at);
      fields.push({ field, value: Number(value) });
    } else if (wire === 1) {
      if (at + 8 > buffer.length) return fields;
      fields.push({ field, value: buffer.readDoubleLE(at) });
      at += 8;
    } else if (wire === 5) {
      if (at + 4 > buffer.length) return fields;
      fields.push({ field, value: buffer.readFloatLE(at) });
      at += 4;
    } else if (wire === 2) {
      let length;
      [length, at] = readVarint(buffer, at);
      const size = Number(length);
      if (at + size > buffer.length) return fields;
      fields.push({ field, bytes: buffer.subarray(at, at + size) });
      at += size;
    } else return fields;

    if (at <= start) return fields;
  }
  return fields;
}

const pick = (fields, field) => (fields || []).find((entry) => entry.field === field);
const num = (fields, field) => pick(fields, field)?.value ?? null;
const str = (fields, field) => {
  const entry = pick(fields, field);
  return entry?.bytes ? entry.bytes.toString("utf8") : null;
};
const sub = (fields, field) => {
  const entry = pick(fields, field);
  return entry?.bytes ? decode(entry.bytes) : null;
};
const subs = (fields, field) =>
  (fields || []).filter((entry) => entry.field === field && entry.bytes).map((entry) => decode(entry.bytes));

// --- what the numbers mean --------------------------------------------------
// From instrument-info-service-proto/v1: DisplayAssetClass, DistributionType,
// and the branch of InstrumentInfoContent an answer arrives in.

const ASSET_CLASS = {
  1: "STOCK",
  2: "ETF",
  3: "CFD",
  4: "SYNTH",
  5: "BONDS",
  6: "ETC",
  7: "ETN",
};
const DISTRIBUTION = { 1: "DIST", 2: "ACC" };
const CONTENT_KIND = {
  2: "stock",
  3: "etf",
  4: "cfdStock",
  5: "cfdEtf",
  6: "cfdCommodity",
  7: "cfdCrypto",
  8: "cfdForex",
  9: "cfdIndex",
};

// Each asset class describes itself in its own message, and they do not agree on
// field numbers: a fund spends field 8 on whether it pays out, which pushes its
// name to 9, while a share names itself at 8. The classes left out here -- CFDs
// on indices, commodities, currencies and crypto -- carry no ISIN at all, so
// nothing an ISIN was asked for can honestly come back as one.
const LAYOUTS = {
  etf: { isin: 4, exchange: 6, distribution: 8, name: 9, quoteSource: 12, expenseRatio: 14 },
  cfdEtf: {
    isin: 4,
    exchange: 6,
    distribution: 8,
    name: 9,
    quoteSource: 12,
    leverage: 13,
    expenseRatio: 16,
  },
  stock: { isin: 4, exchange: 6, name: 8, quoteSource: 11 },
  cfdStock: { isin: 4, exchange: 6, name: 8, quoteSource: 11, leverage: 13 },
};

const SEARCH = "pl.xtb.ipax.pub.grpc.trading.instrumentsearch.v2.InstrumentSearchService/Search";
const CONTENT = "pl.xtb.ipax.pub.grpc.instrumentinfo.v1.InstrumentInfoService/GetInstrumentInfoContent";
const CONTENT_TYPE_BASIC_INFO = 1;

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

// The page is only there to lend the signed-in session: the lookups themselves
// go straight to ipax.xtb.com from here, carrying the token it hands out.
const pages = await browser.pages();
const page =
  pages.find((candidate) => /xtb\.com|xstation/i.test(candidate.url())) ||
  (await browser.newPage());

if (!/xtb\.com|xstation/i.test(page.url())) {
  await page.goto("https://xstation5.xtb.com/", { waitUntil: "domcontentloaded" });
  await sleep(5000);
}

const client = await page.createCDPSession();

function claims(candidate) {
  try {
    return JSON.parse(Buffer.from(candidate.split(".")[1], "base64").toString());
  } catch {
    return null;
  }
}

// The token says when it dies. Rather than wait for a call to be refused, it is
// swapped out shortly before that, which keeps a long run from stalling.
const secondsLeft = (candidate) =>
  (claims(candidate)?.exp || 0) - Math.floor(Date.now() / 1000);

// Every call the platform makes carries a short-lived token, so we read one off
// the wire rather than trying to mint it. It hands out two: one that speaks for
// the person, which the trading side will not answer to, and one that names the
// account. Only the second is any use here, and it is the one naming an account.
let token = "";
client.on("Network.requestWillBeSent", (event) => {
  if (!/ipax\.xtb\.com/i.test(event.request.url)) return;
  const auth = event.request.headers.authorization || event.request.headers.Authorization;
  if (!auth || !/^Bearer ey/.test(auth)) return;
  if (claims(auth)?.acn) token = auth;
});

const TOKEN_MARGIN_SECONDS = 45;
const usable = () => Boolean(token) && secondsLeft(token) > TOKEN_MARGIN_SECONDS;

let refreshing = null;

// Waits for the platform to publish a newer token, and only prods it into
// reloading if it stays quiet. Whatever happens this hands back a token rather
// than throwing: a call made with a spent token is retried, but a run that
// throws here loses the queries still in flight.
async function freshToken() {
  if (usable()) return token;

  // One refresh serves every caller waiting on a token.
  if (!refreshing) {
    refreshing = (async () => {
      console.error("reading a fresh XTB session token");
      // Watching the platform's traffic is only switched on for as long as it
      // takes to read a token off it. Left on, the price feeds it keeps open
      // report every tick back to this process and drown out the lookups.
      await client.send("Network.enable");
      try {
        // The platform renews the token on its own schedule and it is the only
        // thing that can, so it is given a moment before being disturbed.
        for (let waited = 0; waited < 8000 && !usable(); waited += 250) await sleep(250);
        if (usable()) return token;

        try {
          await Promise.race([page.reload({ waitUntil: "domcontentloaded" }), sleep(30000)]);
        } catch {
          // A reload that fails is no worse than one that changes nothing.
        }
        for (let waited = 0; waited < 30000 && !usable(); waited += 250) await sleep(250);
        return token;
      } finally {
        await client.send("Network.disable").catch(() => {});
      }
    })().finally(() => {
      refreshing = null;
    });
  }

  return refreshing;
}

if (!(await freshToken())) {
  throw new Error("XTB never handed out a session token. Is the platform still signed in?");
}

// UNAVAILABLE and RESOURCE_EXHAUSTED are the gateway asking to be left alone
// for a moment; anything else it says is a real answer about the instrument.
const RETRYABLE = new Set(["8", "14"]);

async function call(method, body) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt > 0) await sleep(400 * attempt);
    const auth = await freshToken();

    let response;
    try {
      response = await fetch(`https://ipax.xtb.com/${method}`, {
        method: "POST",
        headers: {
          authorization: auth,
          "content-type": "application/grpc-web+proto",
          "x-grpc-web": "1",
          "x-user-agent": "connect-es/2.1.1",
          origin: "https://xstation5.xtb.com",
          referer: "https://xstation5.xtb.com/",
        },
        body: frame(body),
        // A request left hanging would stall the whole run behind it.
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      continue;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const { messages, trailers } = unframe(buffer);
    const status =
      response.headers.get("grpc-status") || trailers.match(/grpc-status:\s*(\d+)/)?.[1] || "";

    // 16 is UNAUTHENTICATED: the token aged out mid-run, so take a new one.
    if (status === "16" || response.status === 401) {
      if (token === auth) token = "";
      continue;
    }
    // Freshly signed-in sessions are refused with a bare 404 for a second or
    // two before the gateway will route them.
    if (response.status === 404 || RETRYABLE.has(status)) continue;
    if (!response.ok || (status && status !== "0")) return null;

    return messages.flatMap((part) => decode(part));
  }
  return null;
}

// An ISIN typed into the platform's own search box comes back as the listings
// it will let this account trade -- both the shares themselves and, where XTB
// writes one, the CFD on them. Funds it may not sell here answer with nothing.
async function search(query) {
  const answer = await call(SEARCH, stringField(1, query));
  if (!answer) return null;

  const found = [];
  for (const instrument of subs(sub(answer, 1), 1)) {
    // The id is spelled as a choice between an equity, a CFD, an option and a
    // crypto, and which one it is says what kind of product this listing is.
    const identifier = sub(instrument, 1) || [];
    const chosen = identifier[0];
    const products = { 1: "equity", 2: "cfd", 3: "option", 4: "crypto" };
    found.push({
      product: products[chosen?.field] || "unknown",
      id: chosen?.bytes ? num(decode(chosen.bytes), 1) : null,
      symbol: str(instrument, 2),
      name: str(instrument, 3),
    });
  }
  return found;
}

// The search answer is deliberately thin, so the platform asks separately for
// the panel it shows beside a listing. That is where the currency, the venue
// and the ISIN it is quoting against live.
async function basicInfo(instrumentId) {
  const answer = await call(
    CONTENT,
    [
      ...numberField(1, instrumentId),
      ...stringField(2, "en"),
      ...numberField(3, CONTENT_TYPE_BASIC_INFO),
    ]
  );
  if (!answer) return null;

  const success = sub(answer, 1);
  if (!success) return null;

  // Which branch the answer arrives in tells an ETF from a CFD written on one,
  // and it is also what says how to read the rest of the message.
  const branch = success.find((entry) => CONTENT_KIND[entry.field] && entry.bytes);
  if (!branch) return null;
  const kind = CONTENT_KIND[branch.field];
  const layout = LAYOUTS[kind];
  if (!layout) return { kind, unreadable: true };

  const essentials = sub(sub(decode(branch.bytes), 1), 1);
  if (!essentials) return null;

  const leverage = layout.leverage ? sub(essentials, layout.leverage) : null;

  return {
    kind,
    type: ASSET_CLASS[num(essentials, 1)] || null,
    currency: str(essentials, 2) || null,
    isin: (str(essentials, layout.isin) || "").toUpperCase() || null,
    exchange: str(essentials, layout.exchange) || null,
    distribution: layout.distribution ? DISTRIBUTION[num(essentials, layout.distribution)] || null : null,
    name: str(essentials, layout.name) || null,
    // The venue XTB quotes off, which is finer than the exchange it files the
    // listing under: "New York" covers Cboe BZX and the NYSE floor alike.
    quoteSource: str(essentials, layout.quoteSource) || null,
    expenseRatio: layout.expenseRatio ? num(sub(essentials, layout.expenseRatio), 1) : null,
    leverage: leverage ? `${num(leverage, 1) ?? 1}:${num(leverage, 2)}` : null,
  };
}

// `--start=N` (1-indexed) lets a run resume from a specific query without
// throwing away progress already saved to parsed_json/xtb-parsed.json.
const startIndex = (() => {
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--start=(\d+)$/i);
    if (m) return Math.max(1, parseInt(m[1], 10));
  }
  return 1;
})();

// `--csv=PATH` overrides the default ETF list CSV (defaults to etfs.csv).
const csvPath = (() => {
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--csv=(.+)$/i);
    if (m) return m[1];
  }
  return new URL("../etfs.csv", import.meta.url);
})();

const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const cliQueries = positionalArgs.filter(Boolean).map(toIsin).filter(Boolean);
const csvQueries = loadIsinsFromCsv(csvPath);
const defaultQueries = ["IE00B44Z5B48", "IE00BK5BQT80", "IE00BFMXXD54"];
const queries = uniqueQueries(
  cliQueries.length > 0 ? cliQueries : csvQueries.length > 0 ? csvQueries : defaultQueries
);

// A session that has just been handed a token is refused for a second or two,
// so the first lookup is spent here. It settles the connection, and if the
// platform is not really signed in it says so before a long run gets underway.
let reachable = false;
for (let attempt = 0; attempt < 6 && !reachable; attempt += 1) {
  reachable = (await search("IE00B4L5Y983")) !== null;
  if (!reachable) await sleep(1000);
}
if (!reachable) {
  throw new Error(
    "XTB's instrument search did not answer. Is the platform still signed in?"
  );
}

const outputPath = new URL("../parsed_json/xtb-parsed.json", import.meta.url);
const results = [];
const seen = new Set();

// One fund reaches the same account as shares in Frankfurt, shares in London
// and a CFD, all under one ISIN, so the listing and its currency belong in the
// key that tells two rows apart.
const entryKey = (row) =>
  `${row.isin}:${row.symbol}:${row.currency || ""}:${row.product}`.toUpperCase();

// When resuming, load already-saved entries so we don't overwrite them and so
// the dedup `seen` set knows about rows from earlier queries.
if (startIndex > 1 && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        results.push(entry);
        if (entry?.isin && entry?.symbol) seen.add(entryKey(entry));
      }
    }
  } catch {
    // Ignore parse errors -- treat as a fresh run.
  }
}

const SAVE_INTERVAL_MS = 2000;
let savedCount = results.length;
let savedAt = 0;

function save() {
  fs.mkdirSync(new URL("../parsed_json/", import.meta.url), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  savedCount = results.length;
  savedAt = Date.now();
}

// Each ISIN is one small request, so a few run at once; they are still handed
// back in order, which keeps the log readable and `--start` meaningful.
const CONCURRENCY = 8;

async function rowsFor(query) {
  const listings = await search(query);
  if (listings === null) return { query, error: "search failed" };
  if (listings.length === 0) return { query, rows: [] };

  const rows = [];
  const notes = [];
  for (const listing of listings) {
    // Options and crypto are quoted on their own terms, not as a fund listing.
    if (listing.product === "option" || listing.product === "crypto") continue;

    const info = await basicInfo(listing.id);
    if (!info) {
      notes.push(`${listing.symbol}: no details`);
      continue;
    }
    if (info.unreadable) {
      notes.push(`${listing.symbol}: quoted as ${info.kind}, which carries no ISIN — skipped`);
      continue;
    }
    // The search matches names as well as codes, so a listing that answers to
    // a different ISIN is a namesake rather than the fund being asked about.
    if (info.isin && info.isin !== query) {
      notes.push(`${listing.symbol}: ${info.isin} — skipped`);
      continue;
    }

    const suffix = listing.symbol?.lastIndexOf(".") ?? -1;
    rows.push({
      query,
      isin: info.isin || query,
      ticker: suffix > 0 ? listing.symbol.slice(0, suffix) : listing.symbol,
      // XTB's own code for the listing, e.g. "EUNL.DE".
      symbol: listing.symbol,
      // The market code XTB tags onto its symbols, kept as it comes.
      venue: suffix > 0 ? listing.symbol.slice(suffix + 1) : null,
      exchange: info.exchange,
      currency: info.currency,
      name: info.name || listing.name,
      // ETF for the shares, CFD for the contract written on them.
      type: info.type,
      product: listing.product,
      // Says which product a CFD is written on: cfdEtf is a CFD on a fund.
      instrument: info.kind,
      distribution: info.distribution,
      expenseRatio: info.expenseRatio,
      leverage: info.leverage,
      quoteSource: info.quoteSource,
      instrumentId: listing.id,
      raw: [listing.symbol, info.name || listing.name, info.exchange, info.currency, info.type]
        .filter(Boolean)
        .join(", "),
    });
  }
  return { query, rows, notes };
}

for (let batchStart = 0; batchStart < queries.length; batchStart += CONCURRENCY) {
  const batch = [];
  for (let offset = 0; offset < CONCURRENCY && batchStart + offset < queries.length; offset += 1) {
    const index = batchStart + offset;
    if (index + 1 < startIndex) continue;
    // The queries in a batch are started together, so one of them failing must
    // not take the run down with it before its turn to be read comes around.
    batch.push({
      index,
      promise: rowsFor(queries[index]).catch((error) => ({
        query: queries[index],
        error: String(error),
      })),
    });
  }
  if (batch.length === 0) continue;

  for (const { index, promise } of batch) {
    const answer = await promise;
    const label = `[${index + 1}/${queries.length}] ${answer.query}`;
    if (answer.error) {
      console.error(`${label}: ${answer.error}`);
      continue;
    }

    for (const note of answer.notes || []) console.error(`  ${note}`);
    for (const row of answer.rows) {
      const key = entryKey(row);
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(row);
    }
    console.error(
      answer.rows.length > 0
        ? `${label}: ${answer.rows.map((row) => `${row.symbol} ${row.currency}`).join(", ")}`
        : `${label}: not offered`
    );
  }

  if (results.length !== savedCount && Date.now() - savedAt >= SAVE_INTERVAL_MS) save();
}

save();
console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
