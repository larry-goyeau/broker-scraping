// What Vanguard Personal Investor sells on the ASX. The public menu is one
// PDF. Figure 1 is the Vanguard ETFs, current on the date printed on the
// menu. Figure 3 is the ASX shares, and the footnote dates that table on
// its own. A managed fund is an unlisted APIR and stays out. The kids
// menu repeats four of those funds and stays out. There is no ETC and no
// ETN. The page has no ISIN. A code is joined to ../../assets/stocks.csv and
// ../../assets/etfs.csv when exactly one ASX ISIN matches.
//
//   https://fund-docs.vanguard.com/AU-Vanguard_Personal_Investor_Investment_Menu.pdf
//
//   node brokers/vanguardau/vanguardau_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { stampIsinMatches } from "../../isinMatches.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import zlib from "node:zlib";

const MENU = "https://fund-docs.vanguard.com/AU-Vanguard_Personal_Investor_Investment_Menu.pdf";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const STOCKS = new URL("../../assets/stocks.csv", import.meta.url);
const ETFS = new URL("../../assets/etfs.csv", import.meta.url);

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

async function pdfOf() {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(MENU, {
        headers: { "User-Agent": UA, Accept: "application/pdf" },
        signal: controller.signal,
      });
      if (response.ok) return Buffer.from(await response.arrayBuffer());
      last = `${response.status} ${MENU}`;
    } catch (error) {
      last = String(error.message || error);
    } finally {
      clearTimeout(timer);
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error(last);
}

function inflateAt(buf, start) {
  const end = buf.indexOf("endstream", start);
  if (end < 0) throw new Error("a PDF stream does not end");
  return zlib.inflateSync(buf.subarray(start, end));
}

function streamAfter(buf, at) {
  let start = buf.indexOf("stream", at);
  if (start < 0) throw new Error("a PDF object has no stream");
  start += 6;
  if (buf[start] === 13) start += 1;
  if (buf[start] === 10) start += 1;
  return inflateAt(buf, start);
}

function objectStreams(buf) {
  const objects = new Map();
  const text = buf.toString("latin1");
  let from = 0;
  while (from < text.length) {
    const at = text.indexOf("/Type/ObjStm", from);
    if (at < 0) break;
    const header = text.slice(Math.max(0, at - 240), at);
    const count = Number([...header.matchAll(/\/N (\d+)/g)].at(-1)?.[1]);
    const first = Number([...header.matchAll(/\/First (\d+)/g)].at(-1)?.[1]);
    if (!count || !Number.isFinite(first)) throw new Error("an object stream has no index");
    const decoded = streamAfter(buf, at);
    const index = decoded.subarray(0, first).toString("latin1").trim().split(/\s+/).map(Number);
    if (index.length !== count * 2) throw new Error("an object stream index is short");
    for (let i = 0; i < index.length; i += 2) {
      const id = index[i];
      const offset = index[i + 1];
      const next = i + 3 < index.length ? index[i + 3] : decoded.length - first;
      objects.set(id, decoded.subarray(first + offset, first + next).toString("latin1"));
    }
    from = at + 12;
  }
  return objects;
}

function objectHits(buf, id) {
  const key = Buffer.from(`${id} 0 obj`);
  const hits = [];
  let from = 0;
  while (from < buf.length) {
    const at = buf.indexOf(key, from);
    if (at < 0) break;
    const before = at === 0 ? 10 : buf[at - 1];
    if (before === 10 || before === 13 || before === 32) {
      try {
        hits.push({ at, bytes: streamAfter(buf, at) });
      } catch {
        // A font program or an image uses the same object number.
      }
    }
    from = at + key.length;
  }
  return hits;
}

function topStream(buf, id) {
  const hits = objectHits(buf, id);
  const text = hits.find((hit) => hit.bytes.includes(Buffer.from("beginbfchar")) || hit.bytes.includes(Buffer.from("BT")));
  if (!text) throw new Error(`PDF object ${id} is missing`);
  return text.bytes;
}

function contentStream(buf, id, hint) {
  const hits = objectHits(buf, id).filter((hit) => hit.bytes.includes(Buffer.from("BT")));
  if (!hits.length) throw new Error(`page ${id} has no text`);
  hits.sort((left, right) => Math.abs(left.at - hint) - Math.abs(right.at - hint));
  return hits[0].bytes;
}

function cmapOf(bytes) {
  const text = bytes.toString("latin1");
  const map = new Map();
  for (const match of text.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
    const source = Number.parseInt(match[1], 16);
    const code = Number.parseInt(match[2], 16);
    if (match[2].length === 4) map.set(source, String.fromCodePoint(code));
  }
  if (!map.size) throw new Error("a font has no character map");
  return map;
}

function fontMaps(buf) {
  const objects = objectStreams(buf);
  const fonts = new Map();
  for (const [id, body] of objects) {
    const to = body.match(/\/ToUnicode (\d+) 0 R/);
    if (!to) continue;
    fonts.set(id, cmapOf(topStream(buf, Number(to[1]))));
  }
  if (!fonts.size) throw new Error("the menu PDF has no font map");
  return fonts;
}

function pagesOf(buf, fonts) {
  const text = buf.toString("latin1");
  const pages = [];
  let from = 0;
  while (from < text.length) {
    const at = text.indexOf("/Type/Page>>", from);
    if (at < 0) break;
    const chunk = text.slice(Math.max(0, at - 2500), at);
    if (!chunk.includes("MediaBox")) {
      from = at + 12;
      continue;
    }
    const contents = chunk.match(/\/Contents (\d+) 0 R/);
    const font = chunk.match(/\/Font<<([^>]+)>>/);
    if (contents && font) {
      const face = new Map();
      for (const match of font[1].matchAll(/\/(T1_\d+) (\d+) 0 R/g)) {
        const cmap = fonts.get(Number(match[2]));
        if (!cmap) throw new Error(`font ${match[1]} has no character map`);
        face.set(match[1], cmap);
      }
      pages.push({ id: Number(contents[1]), at, face });
    }
    from = at + 12;
  }
  if (!pages.length) throw new Error("the menu PDF has no page");
  return pages;
}

function pdfBytes(body) {
  const out = [];
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] !== "\\") {
      out.push(body.charCodeAt(i));
      continue;
    }
    const next = body[i + 1];
    if (next === "n") {
      out.push(10);
      i += 1;
      continue;
    }
    if ("()\\".includes(next)) {
      out.push(next.charCodeAt(0));
      i += 1;
      continue;
    }
    const octal = /^[0-7]{1,3}/.exec(body.slice(i + 1));
    if (octal) {
      out.push(Number.parseInt(octal[0], 8));
      i += octal[0].length;
      continue;
    }
    throw new Error(`unread PDF escape \\${next}`);
  }
  return out;
}

// WinAnsi leaves these bytes out of some ToUnicode maps. They are quotes
// and dashes in a name, never a ticker.
const WIN_ANSI = new Map([
  [0x80, "€"], [0x82, "‚"], [0x83, "ƒ"], [0x84, "„"], [0x85, "…"], [0x86, "†"], [0x87, "‡"],
  [0x88, "ˆ"], [0x89, "‰"], [0x8a, "Š"], [0x8b, "‹"], [0x8c, "Œ"], [0x8e, "Ž"], [0x91, "‘"],
  [0x92, "’"], [0x93, "“"], [0x94, "”"], [0x95, "•"], [0x96, "–"], [0x97, "—"], [0x98, "˜"],
  [0x99, "™"], [0x9a, "š"], [0x9b, "›"], [0x9c, "œ"], [0x9e, "ž"], [0x9f, "Ÿ"],
]);

function decodeBytes(bytes, cmap) {
  let text = "";
  for (const byte of bytes) {
    if (cmap?.has(byte)) {
      text += cmap.get(byte);
      continue;
    }
    if (byte >= 32 && byte < 127) {
      text += String.fromCharCode(byte);
      continue;
    }
    if (WIN_ANSI.has(byte)) {
      text += WIN_ANSI.get(byte);
      continue;
    }
    throw new Error(`unread glyph ${byte}`);
  }
  return text;
}

function literals(token) {
  const parts = [];
  const re = /\((?:\\.|[^)\\])*\)/g;
  for (const match of token.matchAll(re)) parts.push(pdfBytes(match[0].slice(1, -1)));
  return parts.flat();
}

function linesOf(src, face) {
  let font = "";
  let line = "";
  const lines = [];
  const flush = () => {
    const text = line.replace(/\s+/g, " ").trim();
    if (text) lines.push(text);
    line = "";
  };
  const re = /\/(T1_\d+)\s+[0-9.]+\s+Tf|([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+Tm|(-?[0-9.]+)\s+(-?[0-9.]+)\s+Td|(?:\[(?:[^\]\\]|\\.)*\]\s*TJ)|(?:\((?:\\.|[^)\\])*\)\s*Tj)/g;
  for (const match of src.matchAll(re)) {
    const token = match[0];
    if (token.startsWith("/")) {
      font = match[1];
      continue;
    }
    if (token.endsWith("Tm")) {
      flush();
      continue;
    }
    if (match[8] != null) {
      // A new row steps about three units. A fraction is the name sitting
      // on the same row as its ticker.
      if (Math.abs(Number(match[9])) > 1) flush();
      else if (line && !line.endsWith(" ")) line += " ";
      continue;
    }
    const cmap = face.get(font);
    if (!cmap) throw new Error(`text in an unknown font ${font || "(none)"}`);
    line += decodeBytes(literals(token), cmap);
  }
  flush();
  return lines;
}

function menuRows(buf) {
  const fonts = fontMaps(buf);
  const lines = [];
  for (const page of pagesOf(buf, fonts)) {
    lines.push(...linesOf(contentStream(buf, page.id, page.at).toString("latin1"), page.face));
  }
  const rows = [];
  for (const line of lines) {
    const match = line.match(/^([A-Z0-9]{2,6})\s+(.+)$/);
    if (!match) continue;
    const ticker = match[1];
    const name = normalize(match[2]);
    if (ticker === "TICKER" || ticker === "APIR" || ticker === "ETF") continue;
    if (/^VAN[0-9A-Z]{6}$/.test(ticker)) continue;
    if (/^Vanguard\b/.test(name) && /\bETFs?\b/.test(name)) {
      rows.push({ ticker, name, type: "ETF" });
      continue;
    }
    if (!/[A-Z]/.test(name) || name !== name.toUpperCase()) continue;
    rows.push({ ticker, name, type: "STOCK" });
  }
  return rows;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
    } else field += char;
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.some((cell) => cell !== "")) rows.push(row);
  }
  return rows;
}

function attachIsins(rows) {
  const index = new Map();
  for (const file of [STOCKS, ETFS]) {
    if (!fs.existsSync(file)) throw new Error(`missing ${file.pathname}`);
    const table = parseCsv(fs.readFileSync(file, "utf8"));
    const header = table[0]?.map((cell) => cell.trim().toLowerCase());
    if (header?.[0] !== "ticker" || header?.[1] !== "exchange" || header?.[2] !== "isin") {
      throw new Error(`${file.pathname} header is ${(header || []).join(",")}`);
    }
    for (const line of table.slice(1)) {
      const code = normalize(line[0]).toUpperCase().split(":").pop();
      const exchange = normalize(line[1]).toUpperCase();
      const isin = normalize(line[2]).toUpperCase();
      if (exchange !== "ASX" || !code || !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) continue;
      if (!index.has(code)) index.set(code, new Set());
      index.get(code).add(isin);
    }
  }
  const tally = { one: 0, none: 0, several: 0 };
  for (const row of rows) {
    const found = [...(index.get(row.ticker) || [])];
    if (found.length === 1) {
      row.isin = found[0];
      row.query = found[0];
      tally.one += 1;
    } else if (found.length === 0) {
      row.isin = "";
      tally.none += 1;
    } else {
      row.isin = "";
      tally.several += 1;
      stampIsinMatches(row, new Map([["ASX", new Set(found)]]), row.ticker);
    }
  }
  return tally;
}

const buf = await pdfOf();
const seen = new Set();
const rows = [];
for (const item of menuRows(buf)) {
  const key = `${item.ticker}:${item.type}`;
  if (seen.has(key)) throw new Error(`repeated ${item.ticker} ${item.type}`);
  seen.add(key);
  if (!/^[A-Z0-9]{2,6}$/.test(item.ticker)) throw new Error(`unread ticker ${item.ticker}`);
  rows.push({
    query: item.ticker,
    ticker: item.ticker,
    name: item.name,
    exchange: "ASX",
    currency: "AUD",
    type: item.type,
    raw: [item.ticker, item.name, "ASX", "AUD", item.type].join(" "),
    isin: "",
  });
}
const etf = rows.filter((row) => row.type === "ETF").length;
const stock = rows.filter((row) => row.type === "STOCK").length;
if (!etf || !stock) throw new Error(`the menu parsed ${etf} ETF and ${stock} shares`);

const isins = attachIsins(rows);
rows.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  return left.ticker.localeCompare(right.ticker);
});

fs.writeFileSync(new URL("vanguardau-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
const instruments = new Set(rows.map((row) => row.isin || row.ticker)).size;
console.error(
  `${rows.length} listings over ${instruments} instruments (${etf} ASX ETF, ${stock} ASX STOCK)`
);
console.error(`ISIN ${isins.one}. ${isins.several} codes match several. ${isins.none} match none.`);
