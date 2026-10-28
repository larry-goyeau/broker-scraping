// The Bolsa de Valores de Montevideo (BVM, MIC XMNT) share book, for the
// Uruguayan stockbrokers (corredores de bolsa) that sell the local market,
// first Maiorano & Cía. The corredores de bolsa are BVM members (the BVM's
// "Corredores de Bolsa" page lists Maiorano). BEVSA, the banks' electronic
// exchange, is a debt market; the BVM's share board is the Uruguayan list.
//
// No broker prints its own list, so the exchange's list is read:
//   - the full daily closing report ("Operativa Bursátil, cierre diario",
//     Completa) has an "Acciones" block that names every share line the
//     BVM quotes, with its last trade date; "# = con cotización suspendida"
//     marks a suspended line, which stays out;
//   - the "Papeles" register gives each line's ISIN, BVM code and issuer
//     (it also keeps dead companies such as FUNSA or Barreiro y Ramos, so
//     it is not the book on its own: only lines on the closing report are
//     kept);
//   - each line's page gives "Moneda en la que cotiza", the trading currency.
// A line that never traded (no last trade date) stays out. A line with no
// ISIN stays out. Uruguay lists no ETF. Bonds, notes, trust certificates
// (fideicomisos) and investment funds are not shares and stay out.
//
//   https://www.bvm.com.uy/operativa/cierre
//   https://www.bvm.com.uy/operativa/completa_export3/?tipo=diario&fecha=23/10/2026
//   https://www.bvm.com.uy/operativa/papeles?especie=ACC
//   https://www.bvm.com.uy/operativa/instrumento/id/MODELOES
//   https://www.bvm.com.uy/operadores/emisores-de-acciones   (full issuer names)
//   https://www.bvm.com.uy/operadores/corredores-de-bolsa
//
// About 12 page loads, half a second apart; nothing is cached.

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const BASE = "https://www.bvm.com.uy";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const EXCHANGE = "Bolsa de Valores de Montevideo";
const MIC = "XMNT";
const CURRENCY = { "U$S": "USD", $: "UYU", UI: "UYI", EU: "EUR" };

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function text(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&aacute;/g, "á")
    .replace(/&eacute;/g, "é")
    .replace(/&iacute;/g, "í")
    .replace(/&oacute;/g, "ó")
    .replace(/&uacute;/g, "ú")
    .replace(/&ntilde;/g, "ñ")
    .replace(/\s+/g, " ")
    .trim();
}

function isinOf(value) {
  const code = text(value).toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(code) ? code : "";
}

async function getText(path) {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) {
        const body = await response.text();
        await sleep(500);
        return body;
      }
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await sleep(1500 * (attempt + 1));
  }
  throw new Error(last);
}

function cells(row) {
  return [...row.matchAll(/<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi)].map((match) => ({
    attrs: match[1],
    value: text(match[2]),
  }));
}

// "GRALADO S.A.(SHOPPING 3 CRUCES" -> "Gralado S.A."
function issuerName(raw) {
  let name = text(raw);
  const open = name.lastIndexOf("(");
  if (open > 0 && !name.slice(open).includes(")")) name = name.slice(0, open).trim();
  return name
    .toLowerCase()
    .replace(/(^|[\s.(\-/])([a-záéíóúñ])/g, (_, lead, letter) => lead + letter.toUpperCase())
    .replace(/\bS\.a\./g, "S.A.")
    .replace(/\bS\.a\b/g, "S.A")
    .replace(/\bDe\b/g, "de")
    .replace(/\bDel\b/g, "del");
}

// The date of the latest daily closing report, from the closing page.
async function latestReport() {
  const html = await getText("/operativa/cierre");
  const match = html.match(/\/operativa\/completa_export3\/\?tipo=diario&(?:amp;)?fecha=(\d{2}\/\d{2}\/\d{4})/);
  if (!match) throw new Error("the BVM closing page links no daily report");
  return match[1];
}

// Every share line of the report's "Acciones" block, with its section
// currency, last trade date and suspended mark.
function boardLines(html) {
  const head = html.match(/<td[^>]*class=['"]?([\w-]+)[^>]*>\s*Acciones\s*<\/td>/i);
  if (!head) throw new Error("the BVM daily report has no Acciones block");
  const start = head.index + head[0].length;
  // The next family heading ("Cert. Participacion Fid. Fin.", ...) ends the
  // block. A blank heading of the same class opens a further Acciones
  // section (the preferred shares) and does not end it.
  const familyClass = head[1];
  const tail = html.slice(start);
  const next = tail.search(new RegExp(`<td[^>]*class=['"]?${familyClass}\\b[^>]*>\\s*[^<\\s]`, "i"));
  const block = next >= 0 ? tail.slice(0, next) : tail;

  const lines = [];
  let section = "";
  for (const row of block.match(/<tr\b[\s\S]*?<\/tr>/gi) || []) {
    const values = cells(row);
    const first = values[0]?.value || "";
    if (!first) continue;
    if (/colspan/i.test(values[0].attrs)) {
      section = first;
      continue;
    }
    if (first === "Instrumento") {
      const want = ["Instrumento", "Fecha Balance", "Moneda"];
      if (want.some((label, index) => values[index]?.value !== label)) throw new Error("the BVM Acciones table changed");
      if (values[9]?.value !== "F.ult. Oper.") throw new Error("the BVM Acciones table has no last trade column");
      continue;
    }
    const market = section.match(/MERC\.(PRIMARIO|SECUNDARIO)\s+(\S+)/);
    if (!market) throw new Error(`BVM line ${first} sits under no market heading`);
    const suspended = first.includes("#");
    const name = first.replace(/^[*#\s]+/, "").replace(/[*#]/g, "").trim();
    const lastTrade = /^\d{2}\/\d{2}\/\d{2}$/.test(values[9]?.value || "") ? values[9].value : "";
    lines.push({ name, section, market: market[1], sectionCurrency: market[2], suspended, lastTrade, reference: values[10]?.value || "" });
  }
  if (!lines.length) throw new Error("the BVM Acciones block is empty");
  return lines;
}

// The "Papeles" register lines whose type starts with ACC (shares).
async function register() {
  const out = new Map();
  let offset = 0;
  for (let page = 0; page < 20; page += 1) {
    const html = await getText(`/operativa/papeles?offset=${offset}&especie=ACC`);
    const table = html.match(/<table[\s\S]*?<\/table>/i)?.[0] || "";
    const rows = (table.match(/<tr\b[\s\S]*?<\/tr>/gi) || []).slice(1);
    let read = 0;
    for (const row of rows) {
      const values = cells(row).map((cell) => cell.value);
      if (values.length < 8) continue;
      read += 1;
      const id = row.match(/\/operativa\/instrumento\/id\/([^"']+)/)?.[1] || "";
      const [short, isin, , maturity, , , kind, issuer] = values;
      if (!short) continue;
      out.set(short, { short, isin: isinOf(isin), id: decodeURIComponent(id), maturity, kind, issuer });
    }
    if (!read) break;
    offset += read;
  }
  if (out.size < 10) throw new Error(`the BVM register gives only ${out.size} share lines`);
  return out;
}

function plainKey(value) {
  return text(value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// The full issuer names on the BVM's "Emisores de Acciones" page. The
// register truncates them ("ZORZAL INVERSIONES TECNOLOGICA").
async function issuers() {
  const html = await getText("/operadores/emisores-de-acciones");
  const names = [...html.matchAll(/class="contTextoCorredor">\s*<h4>([\s\S]*?)<\/h4>/gi)]
    .map((match) => text(match[1]))
    .filter(Boolean);
  if (names.length < 4) throw new Error(`the BVM issuer page names only ${names.length} issuers`);
  return names;
}

function fullName(registerIssuer, names) {
  const short = plainKey(issuerName(registerIssuer));
  const hit =
    names.find((name) => plainKey(name).startsWith(short)) ||
    names.find((name) => plainKey(name).includes(`(${short})`));
  return hit || issuerName(registerIssuer);
}

async function instrument(id) {
  const html = await getText(`/operativa/instrumento/id/${encodeURIComponent(id)}`);
  const plain = text(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ""));
  const field = (label) => plain.match(new RegExp(`${label}\\s+(.+?)\\s+(?:Cantidad cotizable|Descripción Ampliada|Fecha de Emisión|Comportamiento)`))?.[1] || "";
  return { currency: field("Moneda en la que cotiza"), long: field("Descripción Ampliada") };
}

// Every BVM share line open to trade, as catalogue rows (with mic), plus
// the suspended lines and the lines left out.
export async function bvmBook() {
  const date = await latestReport();
  const report = await getText(`/operativa/completa_export3/?tipo=diario&fecha=${date}`);
  const lines = boardLines(report);
  const papers = await register();
  const names = await issuers();

  const listed = [];
  const suspended = [];
  const leftOut = [];
  for (const line of lines) {
    if (line.market !== "SECUNDARIO") {
      leftOut.push(`${line.name} primary market`);
      continue;
    }
    if (line.suspended) {
      suspended.push(line.name);
      continue;
    }
    if (!line.lastTrade) {
      leftOut.push(`${line.name} never traded`);
      continue;
    }
    const paper = papers.get(line.name);
    if (!paper) throw new Error(`BVM line ${line.name} is not in the register`);
    if (!paper.isin) {
      leftOut.push(`${line.name} no ISIN`);
      continue;
    }
    if (!/^ACC/.test(paper.kind)) throw new Error(`BVM line ${line.name} is ${paper.kind}`);
    const page = await instrument(paper.id);
    const currency = CURRENCY[page.currency] || CURRENCY[line.sectionCurrency];
    if (!currency) throw new Error(`BVM line ${line.name} trades in ${page.currency || line.sectionCurrency}`);
    if (page.currency && CURRENCY[page.currency] !== CURRENCY[line.sectionCurrency]) {
      throw new Error(`BVM line ${line.name}: page says ${page.currency}, report says ${line.sectionCurrency}`);
    }
    let name = fullName(paper.issuer, names);
    if (/PREF/.test(paper.kind)) name += " (preferred shares)";
    listed.push({
      query: paper.id,
      ticker: paper.id,
      name,
      exchange: EXCHANGE,
      mic: MIC,
      currency,
      type: "STOCK",
      isin: paper.isin,
      raw: [paper.id, line.name, paper.kind, paper.issuer, EXCHANGE, paper.isin, `last trade ${line.lastTrade}`].join(" | "),
    });
  }

  listed.sort((left, right) => left.ticker.localeCompare(right.ticker));
  const seen = new Set();
  for (const row of listed) {
    if (seen.has(row.isin)) throw new Error(`${row.isin} is listed twice`);
    seen.add(row.isin);
  }
  for (const ticker of ["MODELOES", "GRALAESC", "VALENTIN"]) {
    if (!listed.some((row) => row.ticker === ticker) && !suspended.length) throw new Error(`missing ${ticker}`);
  }
  if (listed.length < 4) throw new Error(`only ${listed.length} BVM shares`);
  if (leftOut.length) console.error(`${leftOut.length} BVM lines left out: ${leftOut.join(", ")}`);
  return { date, listed, suspended, leftOut, lines };
}

// Writes <file> next to the calling scraper.
export async function writeBvmCatalogue(here, file) {
  const { date, listed, suspended } = await bvmBook();
  const kept = stampRows(withoutObligations(listed));
  fs.writeFileSync(new URL(file, here), JSON.stringify(kept, null, 2));
  console.error(`${kept.length} BVM shares (report of ${date})`);
  console.error(`${suspended.length} suspended left out${suspended.length ? `: ${suspended.join(", ")}` : ""}`);
  if (kept.length < listed.length) console.error(`${listed.length - kept.length} bonds left out`);
  return kept;
}
