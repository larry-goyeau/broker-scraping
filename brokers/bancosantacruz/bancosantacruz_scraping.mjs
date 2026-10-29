// What Banco Santa Cruz (Banco de Santa Cruz S.A., Grupo Petersen) sells in
// Buenos Aires shares and CEDEARs, with no login. The bank is a BYMA member
// ("Agente de Liquidación y Compensación y Agente de Negociación Integral
// registrado bajo el Nro. 68 de la CNV", "Agente Participante de Bolsas y
// Mercados Argentinos bajo el Nro. 246 de la CNV") and its capital markets
// page says every product listed on BYMA can be traded:
//
//   https://www.bancosantacruz.com/personas/inversiones/mercado-de-capitales
//   FAQ "¿Cuáles Acciones y Bonos puedo comprar?": "Banco Santa Cruz tiene
//   membresía en ByMA (Bolsas y Mercados Argentinos SA) por lo que podés
//   operar todos los productos que se encuentren listados en el mercado."
//   The same page: "Invertí en acciones, bonos, CEDEARS, letras y
//   obligaciones negociables", orders through Home Banking with a Cuenta
//   Comitente, and CEDEARs "También permiten acceder a ETFs".
//
// The bank publishes no list of its own, so the catalogue is BYMA's share
// and CEDEAR board, read by ../bancosantafe/bymaWhole.mjs (shared with
// brokers/bancosantafe and brokers/bancoentrerios): the peso line of every
// local share and CEDEAR that BYMA quotes and that traded in the last
// months, and the MEP-dollar (D) line BYMA lists next to each, however
// little it trades (the bank holds pesos and dollars and names no currency
// per title); block lines, closed-end funds, bond CEDEARs and dormant lines
// are left out. Cable (C) lines are not written: the fee
// schedule has no cable or CCL line, and the only foreign-currency
// settlements it names are MEP dollar ones (note 12: "Compra Dólar Mep
// (Compra en $ y Venta USD) con AL30"; note 15: "liquidación en moneda
// extranjera (dólar MEP)"). Bonds, letras, ONs and options are other
// products.
//
// Fees ("Comisiones y cargos ... - Personas Físicas y Personas Jurídicas sin
// actividad comercial - Vigentes a partir del 1/8/2026", linked from the
// bank's comisiones-y-tasas page): "Compra/Venta de Títulos privados" 1%,
// ByMA market fee "Acciones, Cedear" 0.08%, custody at Caja de Valores and
// the comitente account free. The commercial-portfolio schedule (vig. jul
// 26) has the same 1% and 0.08% lines.
//   https://www.bancosantacruz.com/comisiones-y-tasas
//   https://assets.ctfassets.net/e7eu92ue673r/a8PmGbsl5CjUwfClFT4jW/7631f0f16ea0f209506224f626068bf7/WEB_BSC_Nota_Aumento_de_Comisiones_Todos_lo_productos__01-08-2026___clientes_CCPJ_Aclaraciones.pdf
//   https://assets.ctfassets.net/e7eu92ue673r/67ZPaQSKVmgddlQJuu8ogX/138fc6e181533d45cda034ba22f33bed/BSC_-_Cuentas__Tarjetas_Comerciales__Cobros_y_Pagos_-_vig_jul_26_v1.pdf
//
// Checked on 2026-10-23, with no login: the capital markets page, the
// account-opening page and both fee schedules name no cable / CCL
// settlement and no restricted online list. broker-list.json names one
// place, BYMA, with no restriction.
//
//   node brokers/bancosantacruz/bancosantacruz_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { wholeByma } from "../bancosantafe/bymaWhole.mjs";

const { rows } = await wholeByma("Banco Santa Cruz");
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("bancosantacruz-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
const types = {};
for (const row of written) types[row.type] = (types[row.type] || 0) + 1;
console.error(`Banco Santa Cruz: wrote ${written.length} rows (${Object.entries(types).map(([type, n]) => `${type} ${n}`).join(", ")})`);
