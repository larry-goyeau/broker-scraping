// What Banco Santa Fe (Nuevo Banco de Santa Fe S.A., Grupo Petersen) sells
// in Buenos Aires shares and CEDEARs, with no login. The bank is a BYMA
// member (ALyC y AN integral; "Agente Participante de Bolsas y Mercado
// Argentino bajo el Nro.112 de la CNV") and its capital markets page says
// every product listed on BYMA can be traded:
//
//   https://www.bancosantafe.com.ar/personas/inversiones/mercado-de-capitales
//   FAQ "¿Cuáles Acciones y Bonos puedo comprar?": "Banco Santa Fe tiene
//   membresía en ByMA (Bolsas y Mercados Argentinos SA) por lo que podés
//   operar todos los productos que se encuentren listados en el mercado."
//   The same page: "Invertí en acciones, bonos, CEDEARS, letras y
//   obligaciones negociables", orders through Home Banking, and CEDEARs
//   "También permiten acceder a ETFs".
//
// So the catalogue is BYMA's own share and CEDEAR board, read by
// bymaWhole.mjs (in this folder, shared with the other Petersen banks): the
// peso line of every local share and CEDEAR that BYMA quotes and that
// traded in the last months, and the MEP-dollar (D) line BYMA lists next to
// each, however little it trades (the bank holds pesos and dollars and
// names no currency per title); block lines, closed-end funds, bond
// CEDEARs and dormant lines are left out. Cable (C) lines are not
// written: the bank's fee schedule has no cable or CCL line, and the only
// foreign-currency settlement it names is the MEP dollar (note 20:
// "compra venta de títulos valores con liquidación en moneda extranjera
// (dólar MEP)"; that note sits under the UVA mortgage lines). Bonds,
// letras, ONs and options are other products.
//
// Checked again on 2026-10-22, with no login: the capital-markets and
// investments pages, the help centre, the fee schedule and the comitente
// account terms (TITU-56, 13/07/2026: orders "en forma presencial en las
// sucursales ..., vía telefónica, correo electrónico, Internet"; the account
// is tied to one peso and one dollar "Cuenta a la Vista" at the bank) name
// no cable / CCL settlement and no restricted online list. Cable lines stay
// out, and the whole board stays in, until the bank says otherwise.
//   https://assets.ctfassets.net/e7eu92ue673r/3Zh2mxJTxj6TzuyRjEdkFt/c0d66f117935efcf21fb0cca8eaa153c/TITU-56_-_20260713.pdf
//
// Fees ("Cargos y Comisiones para Individuos", in force from 01/09/2026):
// "Compra/Venta de Títulos Privados por cuenta y orden de Terceros" 1%,
// ByMA market fee "Acciones, Cedear" 0.08%, custody at Caja de Valores
// 100% waived:
//   https://www.bancosantafe.com.ar/comisiones-y-tasas
//   https://assets.ctfassets.net/e7eu92ue673r/2hY5ulIda9r4MzQGDQjCZF/113234cef55b9ebc0e03b38defc0add3/6b56ead2-d786-4ce5-93c7-1829ccc55170.pdf
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   node brokers/bancosantafe/bancosantafe_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { wholeByma } from "./bymaWhole.mjs";

const { rows } = await wholeByma("Banco Santa Fe");
fs.writeFileSync(new URL("bancosantafe-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
