// Every share and ETF quoted on the ASX, and the Cboe Australia book of
// each, for the Australian brokers whose shelf is "all ASX-listed
// securities" (netwealth, thinkmarketsau). Nothing here decides what a
// broker sells; each scraper names the places its own pages give.
//
// ASX shares: the ASX list of listed entities ("ASX listed companies as at
// <date>", rebuilt daily) names each entity once, under its main code. A
// code that list files under a GICS industry group is a share or a unit.
// Debt-only issuers (securitisation trusts, banks' note programmes,
// governments) are filed "Not Applic" and stay out unless the Cboe file
// below quotes that very code as an ordinary line; "Class Pend" codes
// (not yet classified, not yet quoted) stay out on the same terms.
//   https://www.asx.com.au/asx/research/ASXListedCompanies.csv
// The Cboe Australia tradable-securities file (daily) lists the ASX lines
// Cboe matches, with ISIN and type: type 1 is an equity line (subtype 1 an
// ordinary share, 6 a stapled security or trust unit, 16 the ASX physical
// gold product, 17 a preference share), 3 an exchange-traded fund, 5 and 6
// options and hybrids. Ordinary lines that the entity list does not name
// (a second class such as NWSLV or SGLLV, a listing newer than the entity
// list) are kept from it; deferred-settlement, contributing and
// partly-paid lines (DEF, CTG, PPD) and preference shares stay out. An
// entity-list code that Cboe does not quote and that has no ISIN in the
// shared lists (SGL, whose quoted class is SGLLV; long-suspended names)
// stays out.
//   https://www.tmxaustralia.com/equities/support/reference-data
//     (PROD_CXATSL_<date>.txt tradable list, PROD_CXALSL_<date>.txt listed list)
// ASX ETFs: the ETP list of the ASX investment-products monthly report
// (sheet "Spotlight ETP List": types ETF, Active, Complex and SP, the
// structured metal products; the Index lines are benchmarks), plus the
// funds the daily Cboe file quotes on the ASX that the month-old report
// does not have yet.
//   https://www.asx.com.au/issuers/investment-products/asx-investment-products-monthly-report
// Cboe Australia: an ASX line that the Cboe tradable file quotes (open for
// on-market trading) gets a second row on Cboe Australia, same ISIN; the
// funds listed on Cboe itself (record F of the listed file, MIC CHIA) get a
// Cboe Australia row only.
// ISIN: the Cboe files, else ../../assets/stocks.csv and etfs.csv (ASX).

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { inflateRawSync } from "node:zlib";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const ASX_COMPANIES = "https://www.asx.com.au/asx/research/ASXListedCompanies.csv";
const ASX_PRODUCTS = "https://www.asx.com.au/issuers/investment-products/asx-investment-products-monthly-report.html";
const CBOE_REFERENCE = "https://www.tmxaustralia.com/equities/support/reference-data";

const ETP_KEEP = new Set(["ETF", "Active", "Complex", "SP"]);
const CBOE_SHARE = new Set(["1", "6"]);
const CBOE_FUND = new Set(["7", "33", "36"]);
const NOT_A_SHARE = /\b(DEF|CTG|PPD|DEF SET|OPT|RIGHTS?)\b/;
const MONTH = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
export const PLACE = { ASX: { exchange: "ASX", mic: "XASX" }, "Cboe Australia": { exchange: "Cboe Australia", mic: "CHIA" } };

export function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A server that leaves its intermediate certificate out (Netwealth's) fails
// Node's check; curl completes the chain from the system store.
function curl(url, kind, headers) {
  const args = ["-sfL", "--max-time", "120", "-A", UA];
  for (const [name, value] of Object.entries(headers)) args.push("-H", `${name}: ${value}`);
  const body = execFileSync("curl", [...args, url], { maxBuffer: 256 << 20 });
  if (kind === "bytes") return body;
  if (kind === "json") return JSON.parse(body.toString("utf8"));
  return body.toString("utf8");
}

export async function fetchWith(url, { kind = "text", tries = 4, headers = {} } = {}) {
  let last = "";
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA, ...headers }, signal: AbortSignal.timeout(90_000) });
      if (response.ok) {
        if (kind === "bytes") return Buffer.from(await response.arrayBuffer());
        if (kind === "json") return await response.json();
        return await response.text();
      }
      last = `${url} answered ${response.status}`;
      if (response.status === 403 || response.status === 404) break;
    } catch (error) {
      last = `${url}: ${error?.message || error}`;
      if (/CERT|VERIFY|SIGNATURE/.test(error?.cause?.code || "")) {
        try {
          return curl(url, kind, headers);
        } catch (failure) {
          last = `${url}: curl ${failure?.message || failure}`;
        }
      }
    }
    if (attempt < tries - 1) await sleep(2000 * (attempt + 1));
  }
  throw new Error(last);
}

// The visible text of an HTML page, one line per block.
export function pageText(html) {
  return normalize(
    String(html)
      .replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;|&#160;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&#39;|&rsquo;|&#8217;/g, "'")
      .replace(/&quot;/g, '"')
  ).replace(/\s+([,.;:])/g, "$1");
}

// ---------- xlsx ----------

function zipFiles(bytes) {
  let end = bytes.length - 22;
  while (end >= 0 && bytes.readUInt32LE(end) !== 0x06054b50) end -= 1;
  if (end < 0) throw new Error("not a zip archive");
  const count = bytes.readUInt16LE(end + 10);
  let offset = bytes.readUInt32LE(end + 16);
  const files = new Map();
  for (let index = 0; index < count; index += 1) {
    if (bytes.readUInt32LE(offset) !== 0x02014b50) throw new Error("broken zip directory");
    const method = bytes.readUInt16LE(offset + 10);
    const size = bytes.readUInt32LE(offset + 20);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const local = bytes.readUInt32LE(offset + 42);
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    const stored = bytes.subarray(start, start + size);
    files.set(name, method === 0 ? stored : inflateRawSync(stored));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

function unescapeXml(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&");
}

function columnIndex(ref) {
  let n = 0;
  for (const char of ref) n = n * 26 + char.charCodeAt(0) - 64;
  return n - 1;
}

function sheetRows(bytes, sheetName) {
  const files = zipFiles(bytes);
  const shared = [];
  const sharedXml = files.get("xl/sharedStrings.xml")?.toString("utf8") || "";
  for (const item of sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    shared.push([...item[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((node) => node[1]).join(""));
  }
  const workbook = files.get("xl/workbook.xml")?.toString("utf8") || "";
  const rels = files.get("xl/_rels/workbook.xml.rels")?.toString("utf8") || "";
  const entry = [...workbook.matchAll(/<sheet\b[^>]*>/g)].find((node) => unescapeXml(node[0].match(/\bname="([^"]*)"/)?.[1] || "") === sheetName);
  const id = entry?.[0].match(/\br:id="([^"]+)"/)?.[1];
  const rel = id && [...rels.matchAll(/<Relationship\b[^>]*>/g)].find((node) => node[0].includes(`Id="${id}"`));
  const target = rel?.[0].match(/\bTarget="([^"]+)"/)?.[1];
  if (!target) throw new Error(`the workbook has no sheet "${sheetName}"`);
  const sheet = files.get(target.startsWith("/") ? target.slice(1) : `xl/${target}`);
  const rows = [];
  for (const row of sheet.toString("utf8").matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const values = [];
    for (const cell of row[1].matchAll(/<c\b([^>]*?)\/>|<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      if (cell[3] === undefined) continue;
      const ref = cell[2].match(/\br="([A-Z]+)\d+"/)?.[1] || "A";
      const type = cell[2].match(/\bt="([^"]+)"/)?.[1] || "";
      const raw = cell[3].match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
      const inline = [...cell[3].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((node) => node[1]).join("");
      values[columnIndex(ref)] = unescapeXml(type === "s" ? shared[Number(raw)] ?? "" : type === "inlineStr" ? inline : raw);
    }
    rows.push(values);
  }
  return rows;
}

// ---------- sources ----------

async function asxEntities() {
  const csv = await fetchWith(ASX_COMPANIES);
  const heading = normalize(csv.split(/\r?\n/)[0]);
  if (!/^ASX listed companies as at/i.test(heading)) throw new Error(`the ASX entity list opens with "${heading}"`);
  const entities = new Map();
  for (const line of csv.split(/\r?\n/)) {
    const match = line.match(/^"((?:[^"]|"")*)","([A-Z0-9]{3,6})","((?:[^"]|"")*)"/);
    if (match) entities.set(match[2], { name: normalize(match[1].replace(/""/g, '"')), group: normalize(match[3]) });
  }
  if (entities.size < 1800) throw new Error(`the ASX entity list has ${entities.size} codes`);
  return { entities, heading };
}

async function asxProducts() {
  const page = await fetchWith(ASX_PRODUCTS);
  let best = null;
  for (const match of page.matchAll(/\/content\/dam\/asx\/issuers\/asx-investment-products-reports\/(\d{4})\/excel\/asx-investment-products-([a-z]+)-\d{4}-abs\.xlsx/g)) {
    const month = MONTH[match[2].slice(0, 3)];
    if (!month) continue;
    const rank = Number(match[1]) * 12 + month;
    if (!best || rank > best.rank) best = { rank, url: `https://www.asx.com.au${match[0]}` };
  }
  if (!best) throw new Error("the ASX investment-products page links no workbook");
  const table = sheetRows(await fetchWith(best.url, { kind: "bytes" }), "Spotlight ETP List");
  const header = table.findIndex((row) => /^ASX\s*Code$/i.test(normalize(row[1])) && normalize(row[2]) === "Type");
  if (header < 0) throw new Error("the ASX ETP list has no header");
  const products = new Map();
  for (const row of table.slice(header + 1)) {
    const code = normalize(row[1]).toUpperCase();
    if (/^[A-Z0-9]{3,6}$/.test(code) && ETP_KEEP.has(normalize(row[2])) && !products.has(code)) {
      products.set(code, { name: normalize(row[4]) || code, kind: normalize(row[2]) });
    }
  }
  if (products.size < 400) throw new Error(`the ASX ETP list has ${products.size} codes`);
  return { products, report: best.url };
}

function pipeTable(text, record) {
  const lines = text.split(/\r?\n/);
  const header = lines.find((line) => line.startsWith("H|"))?.split("|").slice(1);
  if (!header) throw new Error("a Cboe file has no header");
  return lines
    .filter((line) => record.test(line))
    .map((line) => {
      const cells = line.split("|").slice(1);
      return Object.fromEntries(header.map((name, index) => [name, normalize(cells[index])]));
    });
}

async function cboeFiles() {
  const page = await fetchWith(CBOE_REFERENCE);
  const link = (code) => {
    const found = [...new Set(page.match(new RegExp(`https://cdn\\.cboe\\.com/data/au/equities/${code.toLowerCase()}/cxa/PROD_${code}_[0-9_]+\\.txt`, "g")) || [])];
    if (found.length !== 1) throw new Error(`the Cboe reference page links ${found.length} ${code} files`);
    return found[0];
  };
  const tradableUrl = link("CXATSL");
  const listedUrl = link("CXALSL");
  const tradable = pipeTable(await fetchWith(tradableUrl), /^D\|/);
  const listed = pipeTable(await fetchWith(listedUrl), /^F\|/);
  if (tradable.length < 2000) throw new Error(`the Cboe tradable list has ${tradable.length} lines`);
  if (listed.length < 10) throw new Error(`the Cboe listed list has ${listed.length} funds`);
  return { tradable, listed, tradableUrl, listedUrl };
}

function csvIsins() {
  const map = new Map();
  for (const file of ["../../assets/stocks.csv", "../../assets/etfs.csv"]) {
    const target = new URL(file, import.meta.url);
    if (!fs.existsSync(target)) continue;
    for (const line of fs.readFileSync(target, "utf8").split(/\r?\n/)) {
      const cells = line.split(",");
      if (normalize(cells[1]).toUpperCase() !== "ASX") continue;
      const code = normalize(cells[0]).split(":").pop().toUpperCase();
      const isin = normalize(cells[2]).toUpperCase();
      if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) continue;
      if (!map.has(code)) map.set(code, new Set());
      map.get(code).add(isin);
    }
  }
  return map;
}

const cboeName = (line) => normalize(line.DESC.replace(/\s*\[[A-Z0-9]+\]\s*$/, ""));

// ---------- the listing ----------

// places: the subset of ["ASX", "Cboe Australia"] the broker names.
export async function australianRows({ places = ["ASX"] } = {}) {
  for (const place of places) if (!PLACE[place]) throw new Error(`unknown place ${place}`);
  const [{ entities, heading }, { products, report }, cboe] = [await asxEntities(), await asxProducts(), await cboeFiles()];
  const fromAssets = csvIsins();
  const dropped = new Map();
  const drop = (reason) => dropped.set(reason, (dropped.get(reason) || 0) + 1);

  const onCboe = new Map();
  for (const line of cboe.tradable) {
    if (line.MIC === "XASX" && line.CURR === "AUD" && line.ALLOWONMKT === "1") onCboe.set(line.CXACODE.toUpperCase(), line);
  }

  // code -> { name, type, source }
  const asx = new Map();
  for (const [code, product] of products) asx.set(code, { name: product.name, type: "ETF", source: `ASX ETP list (${product.kind})` });
  for (const [code, line] of onCboe) {
    if (asx.has(code)) continue;
    const subtype = line.INSTRUMENTSUBTYPE;
    if (line.TYPE === "3" && CBOE_FUND.has(subtype)) {
      asx.set(code, { name: entities.get(code)?.name || cboeName(line), type: "ETF", source: "Cboe tradable list, ASX fund" });
      continue;
    }
    if (line.TYPE === "1" && subtype === "16") {
      asx.set(code, { name: cboeName(line), type: "ETF", source: "Cboe tradable list, ASX structured product" });
      continue;
    }
    if (line.TYPE !== "1" || !CBOE_SHARE.has(subtype)) {
      drop(`Cboe ASX line type ${line.TYPE}/${subtype || "-"} (option, hybrid, preference)`);
      continue;
    }
    if (!entities.has(code) && NOT_A_SHARE.test(line.DESC)) {
      drop("Cboe ASX deferred, contributing or partly paid line");
      continue;
    }
    asx.set(code, { name: entities.get(code)?.name || cboeName(line), type: "STOCK", source: entities.has(code) ? "ASX entity list" : "Cboe tradable list, ordinary line" });
  }
  for (const [code, entity] of entities) {
    if (asx.has(code)) continue;
    if (/^(Not Applic|Class Pend)$/i.test(entity.group) || !entity.group) {
      drop(`ASX entity filed "${entity.group || "-"}" and not quoted as a share`);
      continue;
    }
    if (!fromAssets.has(code)) {
      drop("ASX entity Cboe does not quote and no ISIN on file (suspended, or an unquoted class)");
      continue;
    }
    asx.set(code, { name: entity.name, type: "STOCK", source: "ASX entity list" });
  }

  const isinOf = (code, fallback = "") => {
    const isin = onCboe.get(code)?.ISIN || fallback;
    if (/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) return isin;
    const found = [...(fromAssets.get(code) || [])];
    return found.length === 1 ? found[0] : "";
  };
  const rowOf = (ticker, item, place, isin, source) => ({
    query: ticker,
    ticker,
    name: item.name || ticker,
    exchange: PLACE[place].exchange,
    mic: PLACE[place].mic,
    currency: "AUD",
    type: item.type,
    isin,
    raw: [ticker, item.name, PLACE[place].exchange, "AUD", item.type, source].filter(Boolean).join(" | "),
  });

  const rows = [];
  for (const [code, item] of [...asx].sort(([left], [right]) => left.localeCompare(right))) {
    const isin = isinOf(code);
    if (places.includes("ASX")) rows.push(rowOf(code, item, "ASX", isin, item.source));
    if (places.includes("Cboe Australia") && onCboe.has(code)) rows.push(rowOf(code, item, "Cboe Australia", isin, `${item.source}, Cboe tradable list`));
  }
  if (places.includes("Cboe Australia")) {
    for (const fund of cboe.listed) {
      if (fund.MIC !== "CHIA" || fund.CURR !== "AUD" || fund.ALLOWONMKT !== "1") continue;
      if (fund.LISTINGSTATUS && fund.LISTINGSTATUS !== "Active") {
        drop(`Cboe-listed fund ${fund.LISTINGSTATUS}`);
        continue;
      }
      const code = fund.CXACODE.toUpperCase();
      rows.push(rowOf(code, { name: fund.LONGDESCRIPTION || fund.DESC, type: "ETF" }, "Cboe Australia", isinOf(code, fund.ISIN), "Cboe listed list"));
    }
  }

  const count = (place, type) => rows.filter((row) => row.exchange === place && row.type === type).length;
  if (places.includes("ASX") && (count("ASX", "STOCK") < 1700 || count("ASX", "ETF") < 400)) {
    throw new Error(`the ASX listing kept ${count("ASX", "STOCK")} shares and ${count("ASX", "ETF")} ETFs`);
  }
  if (places.includes("Cboe Australia") && count("Cboe Australia", "STOCK") + count("Cboe Australia", "ETF") < 2000) {
    throw new Error(`the Cboe Australia book kept ${rows.filter((row) => row.exchange === "Cboe Australia").length} lines`);
  }
  return { rows, dropped, sources: { heading, report, tradable: cboe.tradableUrl, listed: cboe.listedUrl } };
}

export function logCounts(rows, dropped) {
  const counts = {};
  for (const row of rows) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
  console.error(`${rows.length} rows, ${rows.filter((row) => row.isin).length} with ISIN`);
  console.table(counts);
  console.error("left out", Object.fromEntries(dropped));
}
