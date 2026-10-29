// What Becerra Bursátil S.A. (BBSA, Córdoba, ALyC CNV, BYMA member) sells
// in Buenos Aires shares and CEDEARs, with no login. Clients trade online
// through its virtual broker (virtualbroker-becerra.aunesa.com, "Acceso
// Clientes"); the site sells "ACCESO A LOS PRINCIPALES MERCADOS LOCALES Y
// GLOBALES" and "DIRECT MARKET ACCESS". It publishes no list and names no
// restriction on the local market.
//
//   https://bbsa.com.ar/
//
// So the catalogue is BYMA's whole share and CEDEAR board, read by
// ../bancogalicia/bymaBook.mjs (CEDEARs of US ETFs included; block lines,
// closed-end funds, bond CEDEARs, rights, warrants and dormant or delisted
// lines left out there). Cable (C) lines are kept: the 2026 fee schedule
// prices "Transferencia dólares CABLE u$s 100" and "Liquidación operaciones
// USDC u$s 35", so a client holds and settles dollars abroad.
//
// Not added: the New York Stock Exchange that broker-list.json gives with
// the restriction "By phone/advisor only". Becerra's schedule prices it as
// "Compra/Venta Mandato Exterior 2,00%" (an order the broker places abroad
// on the client's mandate), and the home page offers foreign markets with
// advice ("Le abrimos las puertas a prestigiosas entidades financieras de
// Argentina, USA y Europa, así como asesoramiento personalizado"); no page
// sells US shares through the online platform.
//
// Fees ("TABLA DE ARANCELES", 2026, maximum rates, plus IVA and market
// rights): "Contado Renta Variable 2,00%"; "Liquidación operaciones ARS
// $1000":
//   https://bbsa.com.ar/wp-content/uploads/2026/05/BBSA-Aranceles-2026.pdf
//
//   node brokers/becerra/becerra_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";
import { evidence, pdf } from "../bullmarket/bymaUs.mjs";

await evidence("https://bbsa.com.ar/", [/virtualbroker-becerra/, /MERCADOS LOCALES Y GLOBALES/i]);
await pdf("https://bbsa.com.ar/wp-content/uploads/2026/05/BBSA-Aranceles-2026.pdf");

const { rows } = await bymaBook("Becerra Bursátil", { cable: true });
if (rows.length < 500) throw new Error(`only ${rows.length} BYMA lines`);
fs.writeFileSync(new URL("becerra-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`Becerra Bursátil: ${rows.length} BYMA lines (cable lines kept)`);
