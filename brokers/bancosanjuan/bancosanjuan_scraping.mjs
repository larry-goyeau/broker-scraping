// What Banco San Juan (Banco de San Juan S.A., Grupo Petersen) sells in
// Buenos Aires shares and CEDEARs, with no login. The bank is a BYMA member
// ("Agente de Liquidación y Compensación y Agente de Negociación Integral
// registrado bajo el Nro. 34 de la CNV", "Agente Participante de Bolsas y
// Mercados Argentinos bajo el Nro. 42 de la CNV") and its capital markets
// page says every product listed on BYMA can be traded:
//
//   https://www.bancosanjuan.com/personas/inversiones/mercado-de-capitales
//   FAQ "¿Cuáles Acciones y Bonos puedo comprar?": "Banco San Juan tiene
//   membresía en ByMA (Bolsas y Mercados Argentinos SA) por lo que podés
//   operar todos los productos que se encuentren listados en el mercado."
//   The same page: "Invertí en acciones, bonos, CEDEARS, letras y
//   obligaciones negociables", orders through Home Banking with a Cuenta
//   Comitente, and CEDEARs "También permiten acceder a ETFs".
//
// The bank publishes no list of its own, so the catalogue is BYMA's share
// and CEDEAR board, read by ../bancosantafe/bymaWhole.mjs (shared with
// brokers/bancosantafe and brokers/bancoentrerios): the peso and MEP-dollar
// (D) lines of every local share and CEDEAR that BYMA quotes and that traded
// in the last months; block lines, closed-end funds, bond CEDEARs and
// dormant lines are left out. Cable (C) lines are not written: the fee
// schedule has no cable or CCL line, and the only foreign-currency
// settlement it names is the MEP dollar (note 28: "compra venta de títulos
// valores con liquidación en moneda extranjera (dólar MEP)"; that note sits
// under the UVA mortgage lines). Bonds, letras, ONs and options are other
// products.
//
// Fees ("Cargos y Comisiones para Individuos y Personas Jurídicas sin fines
// de lucro", Vigencia: Septiembre 2026, linked from the bank's
// comisiones-y-tasas page): "Compra/Venta de Títulos Privados" 1%, ByMA
// market fee "Acciones, Cedear" 0.08%, custody at Caja de Valores and the
// comitente account free. The commercial-portfolio schedule (vig. jul 26)
// has the same 1% and 0.08% lines.
//   https://www.bancosanjuan.com/comisiones-y-tasas
//   https://assets.ctfassets.net/e7eu92ue673r/3TPVnRodZS14IgLyrdPQbu/e637f552e03ad759cdb059506d9d5cd0/8e2dd0ee-8d7a-45ec-ba69-2dfd04f1254a.pdf
//   https://assets.ctfassets.net/e7eu92ue673r/5gzNBmLZTSzy93EGSx5qPI/ff04b6031a3c871fddcd19a2a0b40e02/BSJ_-_Cuentas__Tarjetas_Comerciales__Cobros_y_pagos_-_vig_jul_26_v1.pdf
//
// Checked on 2026-10-23, with no login: the capital markets page, the
// account-opening page and both fee schedules name no cable / CCL
// settlement and no restricted online list. broker-list.json names one
// place, BYMA, with no restriction.
//
//   node brokers/bancosanjuan/bancosanjuan_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { wholeByma } from "../bancosantafe/bymaWhole.mjs";

const { rows } = await wholeByma("Banco San Juan");
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("bancosanjuan-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
const types = {};
for (const row of written) types[row.type] = (types[row.type] || 0) + 1;
console.error(`Banco San Juan: wrote ${written.length} rows (${Object.entries(types).map(([type, n]) => `${type} ${n}`).join(", ")})`);
