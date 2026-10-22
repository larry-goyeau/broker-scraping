// What Futuro Casa de Valores (FUTUROCAPITAL S.A., Ecuador) sells in shares
// and exchange-traded funds, with no login. The book is the "Acciones"
// section of its Portafolio marketplace. The page reads one JSON list from
// the marketplace service (method C21, anonymous, empty token). Each line is
// one title of the Ecuadorian equity market with its price and the house and
// exchange commission. A line with no stock on hand (existencia false) is
// still offered at a price, so it is kept.
//
// Kept: shares, common and preferred, and the "fondos de inversión
// cotizados", the market's exchange-traded funds (Fiducia ETF, LegacyPrime).
// Left out: "fondos de inversión colectivos" (closed-end fund units),
// "fideicomisos mercantiles" (trust participation units) and the Mutualista
// Pichincha contribution certificates. None of these is a share or an ETF.
//
// The list prints no ticker, no ISIN and no exchange. The ticker is the
// title number (tiv_id), which is also the number at the end of the Quito
// exchange title code (BLVACC000000000003 is title 3, Banco Bolivariano).
// The firm is a member of both Ecuadorian exchanges, Quito and Guayaquil,
// and every title is quoted on both, so each title gets one row per
// exchange. Ecuador uses the US dollar.
//
// Fees: the tariff is published on the "Legalidad y Transparencia" page
// (TARIFAS_APROBADAS_FCV_2024.pdf), and each list line carries the house and
// exchange commission.
//
//   https://portafolio.futurocasadevalores.com/
//   https://api-ec.futurocasadevalores.com/JBoxService.php   (POST, metodo C21)
//   https://www.futurocasadevalores.com/legalidad-y-transparencia
//   https://www.futurocasadevalores.com/assets/documentos/resolucion-aprobacion/TARIFAS_APROBADAS_FCV_2024.pdf
//   https://www.bolsadevaloresguayaquil.com/mercados/precios-de-acciones.asp
//
//   node brokers/futuro/futuro_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const API = "https://api-ec.futurocasadevalores.com/JBoxService.php";
const SITE = "https://portafolio.futurocasadevalores.com/";
const APP = "49b06244f1c84ae18c4b0d7f0a1ae226";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130 Safari/537.36";

const PLACES = [
  { exchange: "Bolsa de Valores de Quito", mic: "XQUI" },
  { exchange: "Bolsa de Valores de Guayaquil", mic: "XGUA" },
];

// The service answers an empty body unless the device fields the site sends
// are present. Their values are not checked.
async function marketplace() {
  const body = JSON.stringify({
    aplicacion: APP,
    id_qrt: 155,
    data: {
      zona: -5,
      metodo: "C21",
      token: "",
      equipo: "OS X 10.15.7 64bits",
      idequipo: "0.0.0.0",
      idkernel: "Chrome 130",
      tiv_id: 0,
      periodo: "u",
    },
  });
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "text/plain", Origin: SITE.slice(0, -1), Referer: SITE, "User-Agent": UA },
        body,
        signal: AbortSignal.timeout(45_000),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!text.trim()) throw new Error("empty answer");
      return JSON.parse(text);
    } catch (error) {
      last = String(error.message || error);
    }
    await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
  }
  throw new Error(`Futuro marketplace: ${last}`);
}

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const plain = (value) => clean(value).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

function kindOf(name) {
  const key = plain(name);
  if (/^FONDO (DE INVERSION )?COTIZADO\b/.test(key)) return "ETF";
  if (/^FONDO\b/.test(key)) return null;
  if (/^FIDEICOMISO\b/.test(key)) return null;
  if (/\bMUTUALISTA\b/.test(key)) return null;
  return "STOCK";
}

// The alias names the share class when an issuer has several titles. A
// single-title issuer keeps its plain name (Holcim's alias is a par value).
function nameOf(line, classes) {
  const issuer = clean(line.EMI_NOMBRE);
  const alias = clean(line.alias);
  if (!alias || classes < 2 || plain(alias) === plain(issuer)) return issuer;
  if (plain(alias).startsWith(plain(issuer))) return alias;
  return `${issuer} (${alias})`;
}

function book(answer) {
  const lines = answer?.datos;
  if (!Array.isArray(lines) || lines.length < 45) throw new Error(`Futuro listed ${lines?.length ?? 0} titles`);
  const classes = new Map();
  for (const line of lines) {
    const key = plain(line.EMI_NOMBRE);
    classes.set(key, (classes.get(key) ?? new Set()).add(Number(line.tiv_id)));
  }
  const titles = new Map();
  const leftOut = [];
  for (const line of lines) {
    const id = Number(line.tiv_id);
    const issuer = clean(line.EMI_NOMBRE);
    if (!Number.isInteger(id) || id <= 0 || !issuer) throw new Error(`unreadable line ${JSON.stringify(line).slice(0, 200)}`);
    if (!Number.isFinite(Number(line.precio))) throw new Error(`title ${id} has no price`);
    const name = nameOf(line, classes.get(plain(issuer)).size);
    const prior = titles.get(id);
    // A title can appear twice under two issuer ids (the Guayaquil exchange,
    // LegacyPrime). It is one title.
    if (prior) {
      if (plain(prior.issuer) !== plain(issuer)) throw new Error(`title ${id} is ${prior.issuer} and ${issuer}`);
      continue;
    }
    const type = kindOf(issuer);
    titles.set(id, { issuer, name, type });
    if (!type) leftOut.push(name);
  }
  const kept = [...titles].filter(([, title]) => title.type);
  if (kept.filter(([, title]) => title.type === "STOCK").length < 30) throw new Error(`only ${kept.length} shares and ETFs`);
  const rows = [];
  for (const [id, title] of kept.sort((left, right) => left[0] - right[0])) {
    const ticker = String(id);
    for (const place of PLACES) {
      rows.push({
        query: ticker,
        ticker,
        name: title.name,
        exchange: place.exchange,
        currency: "USD",
        type: title.type,
        mic: place.mic,
        raw: [ticker, title.name, place.exchange, "USD", title.type].join(" "),
      });
    }
  }
  return { rows, leftOut };
}

const { rows, leftOut } = book(await marketplace());
fs.writeFileSync(new URL("futuro-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
const count = (type, place) => rows.filter((row) => row.type === type && row.exchange === place).length;
console.error(
  `${rows.length} listings (${rows.filter((row) => row.type === "STOCK").length} STOCK, ${rows.filter((row) => row.type === "ETF").length} ETF; ` +
    PLACES.map((place) => `${place.exchange} ${count("STOCK", place.exchange)}+${count("ETF", place.exchange)}`).join(", ") +
    `), ${leftOut.length} funds, trusts and certificates left out`,
);
