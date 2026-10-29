// What Banco Piano (Banco Piano S.A., ALyC y AN Integral no. 320 at the CNV,
// BYMA member) sells in Buenos Aires shares and CEDEARs online, with no
// login. Its only place is BYMA (BCBA / XBUE).
//
// Its pages, read 2026-10-28: "realizar tus operaciones bursátiles online en
// nuestra plataforma Piano Inversiones" (orders by WhatsApp to advisers
// too); products "Cedears", "ETF", "Dólar MEP", "Bonos, Acciones y
// Cedears". It publishes no list and names no excluded board. Fees ("Guía
// de Comisiones", 9. Operaciones bursátiles, "Operaciones de Contado"):
// "Renta Variable 1,75 % ... Minimo $832,08 - Maximo 1,75%".
//   https://www.bancopiano.com.ar/Inversiones/Servicios/OperarOnline/
//   https://www.bancopiano.com.ar/Inversiones/Productos/BonosAccionesYCedears/
//   https://www.bancopiano.com.ar/Img/Download/GuiadeComisiones.pdf   (fees)
//
// So the catalogue is BYMA's whole share and CEDEAR board, read by
// ../bancogalicia/bymaBook.mjs: local shares and CEDEARs (ETF CEDEARs
// included) that trade, each with its peso line and its MEP-dollar (D)
// line; block lines, closed-end funds, rights, bond CEDEARs and dormant
// lines are left out there. Cable (C) lines are not written: the pages and
// the fee guide name the MEP dollar and no cable / CCL settlement.
// broker-list.json gives "BYMA".
//
//   node brokers/bancopiano/bancopiano_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";
import { evidence } from "../bullmarket/bymaUs.mjs";

await evidence("https://www.bancopiano.com.ar/Inversiones/Servicios/OperarOnline/", [/operaciones bursátiles online en nuestra plataforma Piano Inversiones/]);
await evidence("https://www.bancopiano.com.ar/Inversiones/Productos/BonosAccionesYCedears/", [/Cedears/]);
const guide = await fetch("https://www.bancopiano.com.ar/Img/Download/GuiadeComisiones.pdf", {
  headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", Accept: "application/pdf,*/*" },
  signal: AbortSignal.timeout(60_000),
});
if (!guide.ok || !Buffer.from(await guide.arrayBuffer()).subarray(0, 5).toString().startsWith("%PDF-")) throw new Error(`the Piano fee guide is no longer served (${guide.status})`);

const { rows } = await bymaBook("Banco Piano", { cable: false });
console.error(`Banco Piano: ${rows.length} rows`);
fs.writeFileSync(new URL("bancopiano-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
