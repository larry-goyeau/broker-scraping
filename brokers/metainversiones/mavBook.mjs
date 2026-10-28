// The share and ETF board of the Mercado Argentino de Valores (MAV, Rosario,
// CNV market no. 15), for the scrapers of the brokers whose place is MAV
// (brokers/metainversiones: Meta Inversiones S.A., "Agente de Negociación
// N°343 ante CNV", MAV operator 802 in MAV's own roster).
//
// MAV has no share or ETF board, so the book is empty. What MAV says:
// - Its listing page names three kinds of listed securities and nothing
//   else: "Valores Negociables Listados: Cheque de Pago Diferido – Pagaré,
//   Fideicomisos Financieros, Obligaciones Negociables".
//     https://mav-sa.com.ar/normativa/listado-de-valores-negociables/
// - Its trading hours page has two segments: "Financiamiento e Inversiones
//   PyME" (cheques, pagarés, facturas de crédito) and "Operaciones Mercado
//   de Concurrencia" (contados y plazos, caución y pase).
//     https://mav-sa.com.ar/horarios-de-negociacion/
// - Its "¿Qué es el MAV?" page explains the split with BYMA: "la formación
//   de precios de referencia de valores negociables de alta liquidez
//   –seniors– confluye en BYMA" while MAV keeps cheques, pagarés, facturas,
//   PyME securities, PyME ONs, trusts, pases and provincial and municipal
//   bonds. Shares of non-PyME companies (and so every share and CEDEAR on
//   BYMA's panels) trade on BYMA, not on MAV.
//     https://mav-sa.com.ar/nosotros/que-es-el-mav/
// - "Títulos privados calificados como PyME" (PyME shares) are allowed on
//   MAV, but none is listed: MAV's listing page has no share list, the BCR
//   daily bulletin of the MAV capital market (www.bcr.com.ar/es/mercados/
//   boletin-diario/mercado-de-capitales) carries only cheque and pagaré
//   tables, and the MAV 2025 yearbook counts only cheques (43 %), pagarés
//   (55 %) and facturas de crédito (2 %) in the volume traded. No ETF, ETN
//   or ETC is listed anywhere in Argentina outside BYMA's CEDEARs.
// - Suspensions ("Individualizaciones - Ruedas Reducidas - Suspensiones",
//   on the BCR site) concern cheque and ON issuers only, so there is no
//   suspended share line to drop.
//     https://www.bcr.com.ar/es/mercados/mav/mav-sitio/mercado-de-capitales-individualizaciones-rueda-reducida-suspensiones
//
// So mavBook() reads MAV's listing page and its "¿Qué es el MAV?" page and
// returns no rows, after checking that MAV still lists only cheques and
// pagarés, trusts and ONs. If MAV ever adds a share, equity or ETF kind to
// its listed securities ("Acciones", "Renta variable", "CEDEAR", "ETF"),
// it throws, so that somebody writes the reading of that new board.
//
// Use, from a scraper:
//   import { mavBook } from "../metainversiones/mavBook.mjs";
//   const { rows, reason } = await mavBook("Meta Inversiones");
// rows is always [] today (house shape if it ever fills: query, ticker,
// name, exchange, mic, currency, type, isin, raw; no MIC found for MAV in
// ISO 10383, XMVL being the Mercado de Valores del Litoral in Santa Fe).
// reason is a one-line sentence to quote in the scraper's header or log.
//
//   node brokers/metainversiones/mavBook.mjs

import fs from "node:fs";
import { fileURLToPath } from "node:url";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const LISTING = "https://mav-sa.com.ar/normativa/listado-de-valores-negociables/";
const ABOUT = "https://mav-sa.com.ar/nosotros/que-es-el-mav/";

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Visible text of a page, one block per line.
async function pageText(url) {
  let last = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(30_000) });
      if (response.ok) {
        const html = await response.text();
        return html
          .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
          .replace(/<[^>]+>/g, "\n")
          .replace(/&#8211;|&ndash;/g, "–")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .split("\n")
          .map((line) => line.replace(/\s+/g, " ").trim())
          .filter(Boolean);
      }
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await pause(2000 * (attempt + 1));
  }
  throw new Error(last);
}

const EQUITY = /\b(acciones|accion|acción|renta variable|cedears?|etfs?|fondos cotizados|equity)\b/i;

// The kinds under "Valores Negociables Listados", up to "Cómo tramitar".
function listedKinds(lines) {
  const start = lines.findIndex((line) => /^Valores Negociables Listados$/i.test(line));
  if (start < 0) throw new Error(`MAV's listing page has no "Valores Negociables Listados" block: ${LISTING}`);
  const end = lines.findIndex((line, index) => index > start && /^Cómo tramitar/i.test(line));
  if (end < 0) throw new Error(`MAV's listing page changed shape after "Valores Negociables Listados": ${LISTING}`);
  return lines.slice(start + 1, end).filter((line) => !/^(Leer|Descargar.*)$/i.test(line));
}

export async function mavBook(label = "MAV") {
  const listing = await pageText(LISTING);
  const kinds = listedKinds(listing);
  const expected = [/cheque/i, /fideicomiso/i, /obligaciones negociables/i];
  for (const pattern of expected) {
    if (!kinds.some((kind) => pattern.test(kind))) throw new Error(`MAV's listed kinds changed (${kinds.join("; ")}): ${LISTING}`);
  }
  const equity = kinds.filter((kind) => EQUITY.test(kind));
  if (equity.length) throw new Error(`MAV now lists ${equity.join("; ")}: write the reading of that board (${LISTING})`);
  if (kinds.length > 3) throw new Error(`MAV lists a new kind of security (${kinds.join("; ")}): check it (${LISTING})`);
  await pause(1000);

  const about = await pageText(ABOUT);
  if (!about.some((line) => /alta liquidez/i.test(line) && /BYMA/.test(line))) {
    throw new Error(`MAV's "¿Qué es el MAV?" page no longer says liquid securities trade on BYMA: ${ABOUT}`);
  }

  const reason =
    `MAV lists no shares, ETFs, ETNs or ETCs: its listed securities are ${kinds.join(", ")} ` +
    `(${LISTING}), and liquid securities trade on BYMA under the MAV-BYMA split (${ABOUT}).`;
  console.log(`${label}: 0 rows on MAV. ${reason}`);
  return { rows: [], dropped: [], kinds, reason };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const { rows, kinds } = await mavBook();
  console.log(`${rows.length} rows; MAV listed kinds: ${kinds.join(" | ")}`);
}
