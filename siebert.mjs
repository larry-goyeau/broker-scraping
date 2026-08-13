import puppeteer from "puppeteer-core";
import fs from "node:fs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeTicker(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";

  const firstColumn = text.split(",")[0].trim();
  const afterExchange = firstColumn.includes(":")
    ? firstColumn.split(":").pop()
    : firstColumn;
  return (afterExchange || "").split(/[/]/)[0].trim();
}

function toIsin(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  return match ? match[0] : "";
}

// Siebert quotes the listing venue the way its data vendor names it. The
// mapping onto the CSV's own vocabulary was checked against every fund a
// ticker alone identified.
const EXCHANGE_NAMES = {
  AMEX: "AMEX",
  AMX: "AMEX",
  ARCA: "AMEX",
  ASE: "AMEX",
  BATS: "CBOE",
  BZX: "CBOE",
  "CBOE BZX": "CBOE",
  EDGX: "CBOE",
  NCM: "NASDAQ",
  NGM: "NASDAQ",
  NGS: "NASDAQ",
  NMS: "NASDAQ",
  NSD: "NASDAQ",
  NYE: "NYSE",
  NYS: "NYSE",
};

// One ISIN is often listed on several venues under differently worded names
// ("SPDR S&P 500 ETF Trust" and "State Street SPDR S&P 500 ETF"), so every
// spelling is kept and the closest one decides a match.
function loadTickerCandidatesFromCsv(csvPath) {
  if (!fs.existsSync(csvPath)) return new Map();

  const map = new Map();
  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;

    const columns = line.split(",");
    const ticker = normalizeTicker(columns[0]);
    const isinIndex = columns.findIndex((column) => Boolean(toIsin(column)));
    if (!ticker || isinIndex < 0) continue;

    const isin = toIsin(columns[isinIndex]);
    const exchange = (columns[isinIndex - 1] || "").trim().toUpperCase();
    const name = columns.slice(isinIndex + 1).join(",").trim();
    if (!name) continue;

    const candidates = map.get(ticker) || [];
    map.set(ticker, candidates);

    const existing = candidates.find((candidate) => candidate.isin === isin);
    if (existing) {
      if (!existing.names.includes(name)) existing.names.push(name);
      if (exchange) existing.exchanges.add(exchange);
    } else {
      candidates.push({ isin, names: [name], exchanges: new Set(exchange ? [exchange] : []) });
    }
  }

  return map;
}

// Legal-entity suffixes are shared by unrelated funds, so counting them would
// let a same-ticker instrument pass for the one being looked up.
const GENERIC_TOKENS = new Set([
  "LTD",
  "LIMITED",
  "PLC",
  "INC",
  "CORP",
  "CORPORATION",
  "LLC",
  "GMBH",
  "THE",
  "CO",
]);

function nameTokens(value) {
  return (value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((token) => token.length > 1 && !GENERIC_TOKENS.has(token));
}

// Fund names are shortened inconsistently between sources ("Small Cap" against
// "Small-Ca"), so tokens are compared by prefix rather than equality.
function tokensMatch(left, right) {
  if (left === right) return true;
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  return shorter.length >= 2 && longer.startsWith(shorter);
}

function nameScore(scrapedName, candidateName) {
  const scraped = nameTokens(scrapedName);
  const candidate = nameTokens(candidateName);
  if (scraped.length === 0 || candidate.length === 0) return 0;

  const used = new Set();
  let matched = 0;
  for (const token of scraped) {
    const index = candidate.findIndex(
      (other, position) => !used.has(position) && tokensMatch(token, other)
    );
    if (index >= 0) {
      used.add(index);
      matched += 1;
    }
  }

  // Dividing by the longer name keeps a terser wording from outscoring the fund
  // actually named just by leaving words out.
  return matched / Math.max(scraped.length, candidate.length);
}

// Picks the wording of a candidate that reads closest to what was scraped.
function scoreCandidate(scrapedName, candidate) {
  let best = { score: 0, name: candidate.names[0] || "" };
  for (const name of candidate.names) {
    const score = nameScore(scrapedName, name);
    if (score > best.score) best = { score, name };
  }
  return best;
}

const MIN_NAME_SCORE = 0.5;

// Siebert only trades US listings, so the US share class trading under the
// ticker is the fund on offer. Where a ticker covers several of them, the
// venue it is quoted on tells them apart before the name has to, which matters
// because notes are named after their issuer rather than their fund ("Barclays
// Bank PLC ZC SP ETN REDEEM 08/09/2049 USD 50").
function resolveIsin(tickerCandidates, quote) {
  const usCandidates = (tickerCandidates.get(quote.ticker) || []).filter((candidate) =>
    candidate.isin.startsWith("US")
  );
  if (usCandidates.length === 0) return null;

  const venue = EXCHANGE_NAMES[quote.exchange];
  const sameVenue = venue
    ? usCandidates.filter((candidate) => candidate.exchanges.has(venue))
    : [];
  const candidates = sameVenue.length > 0 ? sameVenue : usCandidates;

  const scored = candidates.map((candidate) => ({
    isin: candidate.isin,
    ...scoreCandidate(quote.name, candidate),
  }));

  // A lone US fund under a ticker Siebert accepts is that fund, whatever the
  // quote calls it.
  if (scored.length === 1) return scored[0];

  const bestScore = Math.max(0, ...scored.map((candidate) => candidate.score));
  if (bestScore < MIN_NAME_SCORE) return null;

  const shortlist = scored.filter((candidate) => candidate.score === bestScore);
  // Still tied: the name does not tell these share classes apart.
  return shortlist.length === 1 ? shortlist[0] : null;
}

// --- the portal speaks grpc-web, so its frames are built and read by hand ---

function varint(value) {
  const bytes = [];
  let rest = value;
  do {
    let byte = rest & 0x7f;
    rest >>>= 7;
    if (rest > 0) byte |= 0x80;
    bytes.push(byte);
  } while (rest > 0);
  return Buffer.from(bytes);
}

function stringField(number, value) {
  const bytes = Buffer.from(value, "utf8");
  return Buffer.concat([varint((number << 3) | 2), varint(bytes.length), bytes]);
}

function request(...fields) {
  const payload = Buffer.concat(fields);
  const header = Buffer.alloc(5);
  header.writeUInt32BE(payload.length, 1);
  return Buffer.concat([header, payload]).toString("base64");
}

// Answers come back as base64 wrapped around the length-prefixed frames, the
// last of which carries the trailing grpc status rather than a message.
function unframe(base64) {
  if (!base64) return [];

  let buffer = Buffer.from(base64, "base64");
  const text = buffer.toString("utf8");
  if (/^[A-Za-z0-9+/=\s]+$/.test(text) && text.length > 8) {
    const inner = Buffer.from(text, "base64");
    if (inner.length > 4 && inner[0] === 0) buffer = inner;
  }

  const messages = [];
  let offset = 0;
  while (offset + 5 <= buffer.length) {
    const length = buffer.readUInt32BE(offset + 1);
    if (buffer[offset] === 0) messages.push(buffer.subarray(offset + 5, offset + 5 + length));
    offset += 5 + length;
  }
  return messages;
}

function readVarint(buffer, offset) {
  let result = 0;
  let shift = 0;
  while (offset < buffer.length) {
    const byte = buffer[offset++];
    result += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) break;
    shift += 7;
  }
  return [result, offset];
}

function parseMessage(buffer, depth = 0) {
  const out = {};
  let offset = 0;

  while (offset < buffer.length) {
    let tag;
    [tag, offset] = readVarint(buffer, offset);
    const number = tag >>> 3;
    const wire = tag & 7;

    let value;
    if (wire === 0) [value, offset] = readVarint(buffer, offset);
    else if (wire === 1) offset += 8;
    else if (wire === 5) offset += 4;
    else if (wire === 2) {
      let length;
      [length, offset] = readVarint(buffer, offset);
      const slice = buffer.subarray(offset, offset + length);
      offset += length;
      const printable = slice.length > 0 && slice.every((byte) => byte >= 0x20 && byte < 0x7f);
      value = printable || depth >= 3 ? slice.toString("utf8") : parseMessage(slice, depth + 1);
    } else break;

    if (value !== undefined && out[number] === undefined) out[number] = value;
  }

  return out;
}

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const pages = await browser.pages();
const page =
  pages.find((candidate) => candidate.url().includes("investor.siebert.com")) ||
  (await browser.newPage());
await page.bringToFront();

// `--start=N` (1-indexed) lets a run resume from a specific ticker without
// throwing away progress already saved to parsed_json/siebert-parsed.json.
const startIndex = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--start=(\d+)$/i);
    if (match) return Math.max(1, parseInt(match[1], 10));
  }
  return 1;
})();
const resume = process.argv.slice(2).some((arg) => /^--resume$/i.test(arg));
const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

// `--csv=PATH` overrides the default ETF list CSV (defaults to etfs.csv).
const csvPath = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--csv=(.+)$/i);
    if (match) return match[1];
  }
  return "etfs.csv";
})();

const tickerCandidates = loadTickerCandidatesFromCsv(csvPath);
const onlyTickers = new Set(positionalArgs.map(normalizeTicker).filter(Boolean));

const outputPath = "parsed_json/siebert-parsed.json";
const results = [];
const seen = new Set();

if ((resume || startIndex > 1) && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        results.push(entry);
        if (entry?.ticker) seen.add(entry.ticker.toUpperCase());
      }
    }
  } catch {
    // Ignore malformed prior output and start fresh.
  }
}

const TRADING_URL = "https://investor.siebert.com/#/trading";
const API_BASE = "https://api-investor.siebert.com/Common.CommonService";

// Every call the portal makes carries an AES key and a copy of the message
// encrypted under it. The server reads the request from the body regardless,
// so one set of those headers is captured off a lookup the order ticket makes
// and then reused, rather than reproducing the portal's key exchange.
async function captureSession() {
  if (!page.url().includes("investor.siebert.com")) {
    await page.goto(TRADING_URL, { waitUntil: "domcontentloaded" });
  }

  const client = await page.createCDPSession();
  await client.send("Network.enable");

  const captured = {};
  client.on("Network.requestWillBeSent", (event) => {
    const url = event.request.url;
    if (!url.startsWith(API_BASE)) return;
    const call = url.split("/").pop();
    if (call === "getValidSymbols" || call === "getSnapQuote") {
      captured[call] = { headers: event.request.headers, body: event.request.postData };
    }
  });

  const input = await page.waitForSelector("#tradeSymbolTexts", { timeout: 30000 }).catch(() => null);
  if (!input) {
    throw new Error("Could not find the order ticket. Is investor.siebert.com signed in on the Trading tab?");
  }

  // The ticket only looks a symbol up when the box changes, so the probe has to
  // differ from whatever is sitting in it.
  const current = await input.evaluate((element) => element.value);
  const probe = current.trim().toUpperCase() === "SPY" ? "IVV" : "SPY";
  await input.click({ clickCount: 3 });
  await page.keyboard.press("Backspace");
  await sleep(300);
  await input.type(probe, { delay: 90 });
  await sleep(1200);
  await page.keyboard.press("Enter");

  for (let waited = 0; waited < 40000; waited += 250) {
    if (captured.getValidSymbols && captured.getSnapQuote) break;
    await sleep(250);
  }
  await client.detach().catch(() => {});

  if (!captured.getValidSymbols || !captured.getSnapQuote) {
    throw new Error("The order ticket never looked a symbol up. Is the portal signed in?");
  }

  const sent = unframe(captured.getValidSymbols.body)[0].toString("utf8");
  const user = sent.match(/\d{5,}/);
  const session = sent.match(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/);
  if (!user || !session) throw new Error("Could not read the portal's session out of its own request.");

  const headersOf = (call) => {
    const copy = {};
    for (const [key, value] of Object.entries(captured[call].headers)) {
      // The browser sets these itself and refuses them from a caller.
      if (/^(sec-|referer|user-agent|origin|host|:)/i.test(key)) continue;
      copy[key] = value;
    }
    return copy;
  };

  return {
    user: user[0],
    session: session[0],
    validHeaders: headersOf("getValidSymbols"),
    quoteHeaders: headersOf("getSnapQuote"),
  };
}

const session = await captureSession();
console.error(`session ${session.session} captured`);

// Both calls are made from the page so they carry the portal's own origin.
function callApi(endpoint, headers, bodies, workers) {
  return page.evaluate(
    async (url, sentHeaders, sentBodies, concurrency) => {
      const answers = new Array(sentBodies.length);
      let next = 0;

      const run = async () => {
        while (next < sentBodies.length) {
          const index = next;
          next += 1;
          try {
            const response = await fetch(url, {
              method: "POST",
              headers: sentHeaders,
              body: sentBodies[index],
            });
            answers[index] = { status: response.status, text: await response.text() };
          } catch (error) {
            answers[index] = { status: 0, text: "", error: String(error) };
          }
        }
      };

      await Promise.all(Array.from({ length: concurrency }, run));
      return answers;
    },
    `${API_BASE}/${endpoint}`,
    headers,
    bodies,
    workers
  );
}

const CONCURRENCY = 8;
const BATCH_SIZE = 240;

// The ticket refuses a symbol it cannot trade, and says which venue it trades
// on when it accepts one.
async function validate(tickers) {
  const bodies = tickers.map((ticker) =>
    request(stringField(1, session.user), stringField(2, ticker), stringField(3, session.session))
  );
  const answers = await callApi("getValidSymbols", session.validHeaders, bodies, CONCURRENCY);

  return answers.map((answer) => {
    if (answer?.status !== 200) return { failed: true };
    const message = unframe(answer.text)[0];
    if (!message) return { failed: true };

    const symbol = parseMessage(message)?.[2]?.[2];
    // An accepted symbol comes back with the venue it trades on; a rejected one
    // is echoed back bare.
    return typeof symbol === "object" && symbol?.[4]
      ? { valid: true, exchange: symbol[4] }
      : { valid: false };
  });
}

// The quote carries what the portal shows next to the ticket: the fund's name,
// what kind of instrument it is and where it trades.
async function quote(tickers) {
  const bodies = tickers.map((ticker) =>
    request(stringField(1, ticker), stringField(10, session.user), stringField(13, session.session))
  );
  const answers = await callApi("getSnapQuote", session.quoteHeaders, bodies, CONCURRENCY);

  return answers.map((answer) => {
    if (answer?.status !== 200) return { failed: true };
    const message = unframe(answer.text)[0];
    if (!message) return { missing: true };

    const quoted = parseMessage(message)?.[2]?.[3];
    if (!quoted || typeof quoted !== "object") return { missing: true };
    return {
      ticker: quoted[2],
      type: quoted[3],
      exchange: quoted[11],
      exchangeName: quoted[10],
      name: quoted[12],
    };
  });
}

// Siebert trades US listings only, so a ticker is worth asking about when the
// CSV knows a US fund by that name.
const queries = [...tickerCandidates.entries()]
  .filter(([, candidates]) => candidates.some((candidate) => candidate.isin.startsWith("US")))
  .map(([ticker]) => ticker)
  .filter((ticker) => onlyTickers.size === 0 || onlyTickers.has(ticker))
  .sort();

console.error(`${queries.length} tickers to ask about`);

function save() {
  fs.mkdirSync("parsed_json", { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
}

let rejected = 0;
let unquoted = 0;
const failures = [];

for (let offset = 0; offset < queries.length; offset += BATCH_SIZE) {
  const batch = queries
    .slice(offset, offset + BATCH_SIZE)
    .filter((ticker, index) => offset + index + 1 >= startIndex && !seen.has(ticker));
  if (batch.length === 0) continue;

  const verdicts = await validate(batch);
  const tradable = batch.filter((ticker, index) => {
    if (verdicts[index]?.failed) failures.push(ticker);
    return verdicts[index]?.valid;
  });
  rejected += batch.length - tradable.length;

  const quotes = tradable.length > 0 ? await quote(tradable) : [];
  for (const [index, ticker] of tradable.entries()) {
    const quoted = quotes[index];
    if (quoted?.failed) {
      failures.push(ticker);
      continue;
    }
    // A fund the portal will trade but cannot quote is left out rather than
    // recorded on the CSV's word alone.
    if (quoted?.missing || !quoted?.name) {
      unquoted += 1;
      continue;
    }
    // Notes and trusts are quoted as funds too, which is what the CSV counts
    // them as; anything else under the ticker is a different instrument.
    if ((quoted.type || "").toLowerCase() !== "etf") continue;

    // The ticket also accepts foreign listings of US funds, quoted off a feed
    // of their home market ("2840", SPDR Gold in Hong Kong), which is not the
    // listing the CSV's US ISIN stands for.
    const code = (quoted.exchange || "").toUpperCase();
    if (!EXCHANGE_NAMES[code]) continue;

    const candidate = resolveIsin(tickerCandidates, {
      ticker,
      name: quoted.name,
      exchange: code,
    });
    if (!candidate) continue;
    if (seen.has(ticker)) continue;
    seen.add(ticker);

    results.push({
      query: ticker,
      ticker: quoted.ticker || ticker,
      name: quoted.name,
      exchange: EXCHANGE_NAMES[code] || code || null,
      type: "ETF",
      raw: [ticker, quoted.name, quoted.exchangeName].filter(Boolean).join(" "),
      isin: candidate.isin,
    });
  }

  save();
  console.error(
    `[${Math.min(offset + BATCH_SIZE, queries.length)}/${queries.length}] ${results.length} matched, ${rejected} not tradable`
  );
}

// A call that never answered says nothing about the fund, so it is worth
// another pass rather than being taken for a refusal.
if (failures.length > 0) {
  console.error(`${failures.length} calls failed, asking again`);
  const verdicts = await validate(failures);
  const tradable = failures.filter((ticker, index) => verdicts[index]?.valid);
  const quotes = tradable.length > 0 ? await quote(tradable) : [];

  for (const [index, ticker] of tradable.entries()) {
    const quoted = quotes[index];
    if (!quoted?.name || (quoted.type || "").toLowerCase() !== "etf") continue;
    if (seen.has(ticker)) continue;

    const code = (quoted.exchange || "").toUpperCase();
    if (!EXCHANGE_NAMES[code]) continue;

    const candidate = resolveIsin(tickerCandidates, {
      ticker,
      name: quoted.name,
      exchange: code,
    });
    if (!candidate) continue;
    seen.add(ticker);

    results.push({
      query: ticker,
      ticker: quoted.ticker || ticker,
      name: quoted.name,
      exchange: EXCHANGE_NAMES[code] || code || null,
      type: "ETF",
      raw: [ticker, quoted.name, quoted.exchangeName].filter(Boolean).join(" "),
      isin: candidate.isin,
    });
  }
  save();
}

save();
console.error(`${results.length} funds matched, ${rejected} refused, ${unquoted} accepted but unquoted`);
console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
