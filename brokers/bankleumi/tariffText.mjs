// Readers for the published price lists (תעריפון) of the Israeli banks, so
// a scraper can check at run time that the fee and channel lines its header
// quotes are still printed. Israeli banks must publish their full tariff;
// most serve it as a workbook or a PDF next to pages that sit behind a bot
// wall (Radware, F5, Imperva), while the files themselves answer a plain
// request.
//
//   workbookText(url)  every string of an .xlsx (shared strings and inline
//                      strings of the sheets), as one text.
//   legacyXlsText(url) the UTF-16 strings of an old binary .xls (BIFF8), as
//                      one text (read at both byte alignments).
//   servedPdf(url)     throws unless the URL still serves a PDF; the bytes.
//   pageText(url)      the visible text of a page, or null when the answer
//                      is a bot-wall challenge rather than the page.
//   check(label, text, patterns)  throws on the first pattern not found.
//
// Used by ./bankleumi_scraping.mjs, ../mizrahi, ../fibi.

import { inflateRawSync } from "node:zlib";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const WALL = /JavaScript is disabled|Radware|Verifying your browser|perfdrive|Just a moment|TSPD|Request Rejected/i;

async function bytes(url, accept = "*/*") {
  let last = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA, Accept: accept, "Accept-Language": "he-IL,he;q=0.9,en;q=0.8" }, signal: AbortSignal.timeout(45_000) });
      if (response.ok) return { body: Buffer.from(await response.arrayBuffer()), type: response.headers.get("content-type") || "" };
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${url}: ${error.message || error}`;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000 * (attempt + 1)));
  }
  throw new Error(last);
}

const xmlText = (xml) =>
  xml
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

export async function workbookText(url) {
  const { body: zip } = await bytes(url);
  let end = zip.length - 22;
  while (end >= 0 && zip.readUInt32LE(end) !== 0x06054b50) end -= 1;
  if (end < 0) throw new Error(`${url} is not a workbook`);
  let offset = zip.readUInt32LE(end + 16);
  const parts = [];
  for (let index = 0; index < zip.readUInt16LE(end + 10); index += 1) {
    const nameLength = zip.readUInt16LE(offset + 28);
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    if (name === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(name)) {
      const local = zip.readUInt32LE(offset + 42);
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const stored = zip.subarray(start, start + zip.readUInt32LE(offset + 20));
      const xml = (zip.readUInt16LE(offset + 10) === 0 ? stored : inflateRawSync(stored)).toString("utf8");
      parts.push(name === "xl/sharedStrings.xml" ? xmlText(xml) : [...xml.matchAll(/<is>([\s\S]*?)<\/is>/g)].map((match) => xmlText(match[1])).join(" "));
    }
    offset += 46 + nameLength + zip.readUInt16LE(offset + 30) + zip.readUInt16LE(offset + 32);
  }
  if (!parts.length) throw new Error(`${url} has no strings`);
  return parts.join(" ");
}

export async function legacyXlsText(url) {
  const { body } = await bytes(url);
  if (body.readUInt32LE(0) !== 0xe011cfd0) throw new Error(`${url} is not a binary workbook`);
  const read = (from) =>
    body
      .subarray(from, from + ((body.length - from) & ~1))
      .toString("utf16le")
      .replace(/[^ -~א-ת׳״₪]+/g, " ");
  return `${read(0)} ${read(1)}`.replace(/\s+/g, " ");
}

export async function servedPdf(url) {
  const { body, type } = await bytes(url, "application/pdf,*/*");
  if (body.subarray(0, 5).toString() !== "%PDF-") throw new Error(`${url} no longer serves a PDF (${type})`);
  return body;
}

export async function pageText(url) {
  const { body } = await bytes(url, "text/html");
  const html = body.toString("utf8");
  if (WALL.test(html.slice(0, 4000)) && html.length < 20_000) return null;
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;|\s+/g, " ");
}

export function check(label, text, patterns) {
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${label} no longer says ${pattern}`);
}
