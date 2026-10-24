// What Banco Entre Ríos (Nuevo Banco de Entre Ríos S.A., Grupo Petersen)
// sells in Buenos Aires shares and CEDEARs, with no login. The bank is a
// BYMA member (ALyC y AN integral no. 65 of the CNV; "Agente Participante de
// Bolsas y Mercado Argentino bajo el Nro.108 de la CNV") and its capital
// markets page says every product listed on BYMA can be traded:
//
//   https://www.bancoentrerios.com.ar/personas/inversiones/mercado-de-capitales
//   FAQ "¿Cuáles Acciones y Bonos puedo comprar?": "Banco Entre Ríos tiene
//   membresía en ByMA (Bolsas y Mercados Argentinos SA) por lo que podés
//   operar todos los productos que se encuentren listados en el mercado."
//   The same page: "Invertí en acciones, bonos, CEDEARS, letras y
//   obligaciones negociables", orders through Home Banking, and CEDEARs
//   "También permiten acceder a ETFs".
//
// So the catalogue is BYMA's own share and CEDEAR board, read by
// ../bancosantafe/bymaWhole.mjs (shared with brokers/bancosantafe): the peso
// and MEP-dollar (D) lines of every local share and CEDEAR that BYMA quotes
// and that traded in the last months; block lines, closed-end funds, bond
// CEDEARs and dormant lines are left out. Cable (C) lines are not written:
// the bank's fee schedule has no cable or CCL line, and the only
// foreign-currency settlement it names is the MEP dollar (note 5:
// "compra venta de títulos valores con liquidación en moneda extranjera
// (dólar MEP)"). Bonds, letras, ONs and options are other products.
//
// Checked again on 2026-10-22, with no login: the capital-markets and
// investments pages, the help centre, the fee schedule and the comitente
// account terms (F14604, 14/07/2026: orders "en forma presencial en las
// sucursales ... así como por vía telefónica, correo electrónico,
// internet"; the account is tied to one peso and one dollar "Cuenta a la
// Vista" at the bank) name no cable / CCL settlement and no restricted
// online list. Cable lines stay out, and the whole board stays in, until
// the bank says otherwise.
//   https://assets.ctfassets.net/e7eu92ue673r/7iIQZWvXg1QIPHBbqxUhkH/c3f2a5a08f9ce68ddc36cc0df138460b/F14604_-_20260714.pdf
//
// Fees ("Cargos y Comisiones para Individuos", in force from 01/09/2026):
// "Compra/Venta de Títulos Privados" 1%, "ByMA (Bolsa y Mercados
// Argentinos) - Acciones, Cedear" 0.08%, custody at Caja de Valores free,
// comitente account free:
//   https://www.bancoentrerios.com.ar/comisiones-y-tasas
//   https://assets.ctfassets.net/e7eu92ue673r/392uCSfw9HyWTmt9g5GZDY/9b4137d909570a762152bd44b631cb7b/TARIFARIO_WEB_1092026.pdf
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   node brokers/bancoentrerios/bancoentrerios_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { wholeByma } from "../bancosantafe/bymaWhole.mjs";

const { rows } = await wholeByma("Banco Entre Ríos");
fs.writeFileSync(new URL("bancoentrerios-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
