// What imagin (imaginBank, CaixaBank's app bank) sells in its "BROker
// online" on the Spanish market and the US exchanges, with no login.
//
//   https://www.imagin.com/inversion
//   https://www.imagin.com/inversion/broker-online
// "Invierte de forma fácil y segura en los principales mercados del mundo
// con tu BROker online"; "Acciones: Un catálogo con las principales
// empresas de Europa y EE.UU."; "ETFs: Fondos cotizados con los principales
// índices de referencia del mundo"; "Más de 6.000 acciones internacionales,
// invierte en las mayores empresas de EEUU y Europa"; "Desde 1 € a 3 € por
// operación tanto nacional como internacional. (Máximo de compra 6.000 €,
// cambio de divisa aplicable.)" imagin publishes no list of its catalogue.
//
// Places: Spain and the United States, as broker-list.json gives them. The
// page's "Europa" (other European exchanges) is not a place of this broker
// in broker-list.json and is not read.
// - Spain ("nacional"): the Bolsa de Madrid book of ../kutxabank/bmeBook.mjs,
//   whole (Mercado Continuo shares, BME's ETFs, Latibex, the Madrid floor;
//   minus suspended lines and lines with no trade this year).
// - United States: the stated count. "Más de 6.000 acciones
//   internacionales" is imagin's number for its foreign shares (US and
//   Europe together); only the US is read here, so the US shares are the
//   6,000 most popular titles of the whole US book (../wellstrade/usBook.mjs,
//   one NBBO market), ranked by 30-day average traded value on
//   TradingView's US scanner (../tfcapital/usTop.mjs). The 6,000 bounds
//   the US shelf from above (it also counts European shares).
// - US ETFs: none. "En el buscador de ETFs podrás acceder a la web del
//   productor y al Folleto y los Datos Fundamentales para el inversor de
//   cada fondo": imagin sells only funds with a KID (PRIIPs Regulation
//   1286/2014), which US-domiciled ETFs and ETNs do not have, and its
//   clients are Spanish residents. A US-listed ETP that is not
//   US-domiciled (a foreign ISIN, six on 28 October 2026) stays.
//
// Restriction kept as a remark, not a removal: "No se permiten operaciones
// de compra superiores a 6.000 €" (an order-size cap, not a title limit).
//
// Fees: same page: "Tarifa de 1 € para operaciones (de compra o de venta)
// si el importe es de hasta 2.000 €. Si el importe es superior a 2.000 € y
// hasta 6.000 €, la tarifa aplicable será de 3 € por operación. No se
// permiten operaciones de compra superiores a 6.000 €"; "Estas tarifas
// incluyen los aranceles (derechos de contratación y liquidación)".
//
//   node brokers/imagin/imagin_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { madridBook } from "../kutxabank/bmeBook.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { usTop } from "../tfcapital/usTop.mjs";
import { pageSays } from "../bajaj/pageSays.mjs";
import fs from "node:fs";

const OUTPUT = new URL("imagin-parsed.json", import.meta.url);
const STATED = 6000;

await pageSays("https://www.imagin.com/inversion", [/6\.000 acciones/, /No se permiten operaciones de compra superiores a 6\.000/]);
await pageSays("https://www.imagin.com/inversion/broker-online", [/principales empresas de Europa y EE\.UU\./, /Datos Fundamentales para el inversor/]);

const spain = (await madridBook()).listed.filter((row) => ["STOCK", "ETF"].includes(row.type));
const us = await usBook();
const usShares = us.filter((row) => row.type === "STOCK");
const usFunds = us.filter((row) => row.type !== "STOCK" && row.isin && !/^US/.test(row.isin));
const top = await usTop(usShares, STATED);

const rows = [...spain, ...top, ...usFunds];
const kept = stampRows(withoutObligations(rows));
const spanish = kept.filter((r) => r.exchange === "Bolsa de Madrid").length;
if (spanish < 120) throw new Error(`only ${spanish} Madrid lines`);
if (top.length < 5000) throw new Error(`only ${top.length} US shares`);
for (const isin of ["ES0113900J37", "US0378331005"]) if (!kept.some((r) => r.isin === isin)) throw new Error(`${isin} missing`);
fs.writeFileSync(OUTPUT, JSON.stringify(kept, null, 2));
console.error(`${kept.length} lines: ${spanish} Bolsa de Madrid, ${kept.length - spanish} US (top ${STATED} shares: ${JSON.stringify(top.report)}; ${usFunds.length} non-US-domiciled US ETPs)`);
