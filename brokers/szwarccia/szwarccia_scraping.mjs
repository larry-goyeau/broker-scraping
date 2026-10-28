// What Szwarc & Cía S.A. (SZ Bursátil, ALyC y AN Propio n° 644 CNV, BYMA
// member n° 256) sells in Buenos Aires shares and CEDEARs, with no login.
// It publishes no list of its own and names no product page beyond its
// tariff, which prices shares bought online and by phone:
//
//   https://szbursatil.com/
//   "Agente de Liquidación y Compensación y Agente de Negociación Propio
//   ... miembro Bolsas y Mercados Argentinos (BYMA)"; "PLATAFORMA ÁGIL Y
//   MODERNA. Para que puedas operar desde el lugar donde estés".
//
// So the catalogue is BYMA's whole share and CEDEAR board (CEDEARs of US
// ETFs such as SPY and QQQ included: BYMA quotes CEDEARs as shares and no
// page leaves them out), read by ../bancogalicia/bymaBook.mjs: the peso and
// MEP-dollar (D) lines of every local share and CEDEAR that BYMA quotes and
// that trades; block lines, closed-end funds, bond CEDEARs, rights, warrants
// and dormant or delisted lines are left out there. Cable (C) lines are not
// written: the tariff's dollar lines are "Transferencia Emisora u$s Local"
// and "Transferencia Receptora u$s Local", with no cable / CCL settlement
// or dollar account abroad. No page names a segment, board or title it does
// not trade.
//
// Fees ("Tabla de aranceles"): "Acciones – Compra/Venta" 0.45% + I.V.A.
// online ("INTERNET"), 0.90% + I.V.A. by phone, minimum $ 45.00 + I.V.A.;
// "Acciones locales Trading intradiario" 0.25% + I.V.A. online; account
// maintenance "SIN COSTO" ($60 + I.V.A. a month after 90 days inactive):
//   https://szbursatil.com/tabla-de-aranceles/
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   node brokers/szwarccia/szwarccia_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("Szwarc & Cía", { cable: false });
fs.writeFileSync(new URL("szwarccia-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`Szwarc & Cía: ${rows.length} BYMA lines`);
