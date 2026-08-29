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
  if (!fs.existsSync(csvPath)) return new Map();

  const map = new Map();
  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;

    const columns = line.split(",");
    const isinIndex = columns.findIndex((column) => Boolean(toIsin(column)));
    if (isinIndex < 0) continue;

    const isin = toIsin(columns[isinIndex]);
    const name = columns.slice(isinIndex + 1).join(",").trim();

    const entry = map.get(isin) || { names: [] };
    map.set(isin, entry);
    if (name && !entry.names.includes(name)) entry.names.push(name);
  }

  return map;
}

// --- the treasury catalogue speaks grpc-web, so frames are built and read by hand ---

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

// A length-delimited field is either text or a nested message. Text decodes as
// UTF-8 without control bytes, while a nested message starts with a field tag
// that is one.
function decodeText(slice) {
  if (slice.length === 0) return null;
  const text = slice.toString("utf8");
  if (text.includes("\uFFFD")) return null;
  for (const character of text) {
    if (character.codePointAt(0) < 0x20) return null;
  }
  return text;
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
      const text = decodeText(slice);
      if (text !== null) value = text;
      else value = depth >= 8 ? slice.toString("utf8") : parseMessage(slice, depth + 1);
    } else break;

    if (value === undefined) continue;
    // Repeated fields arrive as the same number over and over.
    if (out[number] === undefined) out[number] = value;
    else {
      if (!Array.isArray(out[number])) out[number] = [out[number]];
      out[number].push(value);
    }
  }

  return out;
}

// Answers are length-prefixed frames; the trailing one carries the grpc status
// rather than a message.
function unframe(base64) {
  const buffer = Buffer.from(base64, "base64");
  const messages = [];
  let offset = 0;
  while (offset + 5 <= buffer.length) {
    const length = buffer.readUInt32BE(offset + 1);
    if (buffer[offset] === 0) messages.push(buffer.subarray(offset + 5, offset + 5 + length));
    offset += 5 + length;
  }
  return messages;
}

function asList(value) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

// The instrument sheet spells the ISIN out in an "Info" row, and repeats it in
// the file name of every KID it links to, which is the fallback.
function findIsin(message) {
  for (const section of asList(message?.["1"]?.["6"])) {
    for (const row of asList(section?.["2"])) {
      if (typeof row?.["1"] === "string" && /isin/i.test(row["1"])) {
        const isin = toIsin(row["2"]);
        if (isin) return isin;
      }
    }
  }

  const fromDocument = JSON.stringify(message).match(/([A-Z]{2}[A-Z0-9]{9}[0-9])_[A-Z]{2}_\d{4}-/);
  return fromDocument ? fromDocument[1] : "";
}

// `--csv=PATH` overrides the default ETF list CSV (defaults to etfs.csv).
const csvPath = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--csv=(.+)$/i);
    if (match) return match[1];
  }
  return new URL("../etfs.csv", import.meta.url);
})();

const csvIsins = loadIsinsFromCsv(csvPath);
console.error(`${csvIsins.size} ISINs in the CSV`);

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const pages = await browser.pages();
const page =
  pages.find((candidate) => candidate.url().includes("business.vivid.money")) ||
  (await browser.newPage());
await page.bringToFront();

if (!page.url().includes("business.vivid.money")) {
  await page.goto("https://business.vivid.money/", { waitUntil: "domcontentloaded" });
  await sleep(5000);
}

const SHOWCASE = "vivid.frontend.web.trading_nl.showcase.v1.InvestShowcaseService";
const INSTRUMENT = "vivid.frontend.shared.invest.instrument.v1.InvestInstrumentService";

// Calls are made from the page so they ride the session the browser already
// holds; `fields` are the string fields of the request message.
async function call(service, method, fields) {
  const answer = await page.evaluate(
    async (service, method, fields) => {
      const encoder = new TextEncoder();
      const parts = [];
      for (const field of fields) {
        const bytes = encoder.encode(field.value);
        const header = [];
        let rest = bytes.length;
        do {
          let byte = rest & 0x7f;
          rest >>>= 7;
          if (rest > 0) byte |= 0x80;
          header.push(byte);
        } while (rest > 0);
        const segment = new Uint8Array(1 + header.length + bytes.length);
        segment[0] = (field.number << 3) | 2;
        segment.set(header, 1);
        segment.set(bytes, 1 + header.length);
        parts.push(segment);
      }

      const payload = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
      let offset = 0;
      for (const part of parts) {
        payload.set(part, offset);
        offset += part.length;
      }

      const framed = new Uint8Array(5 + payload.length);
      new DataView(framed.buffer).setUint32(1, payload.length);
      framed.set(payload, 5);

      try {
        const response = await fetch(`/api/grpc/${service}/${method}`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/grpc-web+proto", "x-grpc-web": "1" },
          body: framed,
        });
        const buffer = new Uint8Array(await response.arrayBuffer());
        let binary = "";
        for (const byte of buffer) binary += String.fromCharCode(byte);
        return { status: response.headers.get("grpc-status"), body: btoa(binary) };
      } catch {
        return { status: "-1", body: "" };
      }
    },
    service,
    method,
    fields
  );

  if (answer.status && answer.status !== "0") return null;
  return unframe(answer.body).map((message) => parseMessage(message))[0] || null;
}

const categories = await call(SHOWCASE, "ListCategories", []);
if (!categories) {
  throw new Error("Vivid did not answer. Is business.vivid.money signed in?");
}

const etfCategory = asList(categories["1"]).find((category) => /^ETFs?$/i.test(category?.["2"] || ""));
if (!etfCategory) {
  throw new Error("No ETF category in Vivid's catalogue.");
}
console.error(`ETF category ${etfCategory["1"]}`);

// The catalogue answers 100 rows at a time and hands back a cursor for the next
// slice in field 2, which the next request carries in field 3.
const listed = [];
let cursor = "";
for (let guard = 0; guard < 200; guard += 1) {
  const fields = [{ number: 1, value: etfCategory["1"] }];
  if (cursor) fields.push({ number: 3, value: cursor });

  const answer = await call(SHOWCASE, "GetCompilation", fields);
  const rows = asList(answer?.["1"]);
  listed.push(...rows);
  console.error(`  ${listed.length} instruments listed`);

  cursor = typeof answer?.["2"] === "string" ? answer["2"] : "";
  if (!cursor || rows.length === 0) break;
}

console.error(`${listed.length} instruments in Vivid's ETF catalogue`);

// Only the instrument sheet carries the ISIN, so each listing needs one more
// call; they are fired in batches to keep the run short without flooding.
const details = new Map();
const BATCH = 8;
for (let index = 0; index < listed.length; index += BATCH) {
  const batch = listed.slice(index, index + BATCH);
  const answers = await Promise.all(
    batch.map((row) => call(INSTRUMENT, "GetStaticInfo", [{ number: 1, value: row["1"] }]))
  );
  batch.forEach((row, position) => {
    if (answers[position]) details.set(row["1"], answers[position]);
  });
  console.error(`  ${details.size}/${listed.length} sheets read`);
}

const outputPath = new URL("vivid-parsed.json", import.meta.url);
const results = [];
const seen = new Set();
let unresolved = 0;
let offList = 0;

for (const row of listed) {
  const sheet = details.get(row["1"]);
  const isin = sheet ? findIsin(sheet) : "";
  if (!isin) {
    unresolved += 1;
    continue;
  }

  // Vivid's catalogue mixes ETFs with other exchange-traded products; the CSV
  // is what says which ISIN is an ETF worth keeping.
  const entry = csvIsins.get(isin);
  if (!entry) {
    offList += 1;
    continue;
  }

  if (seen.has(isin)) continue;
  seen.add(isin);

  const ticker = (row["3"] || "").toUpperCase();
  const name = (row["2"] || entry.names[0] || "").replace(/\s+/g, " ").trim();

  results.push({
    query: isin,
    ticker,
    name,
    type: "ETF",
    raw: [ticker, name, isin].filter(Boolean).join(" "),
    isin,
  });
}

fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

console.error(
  `${results.length} funds matched, ${offList} not in the CSV, ${unresolved} without an ISIN`
);
console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
