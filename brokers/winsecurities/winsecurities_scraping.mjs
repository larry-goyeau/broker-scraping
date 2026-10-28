// What Win Securities (Win Securities S.A., ALyC y AN Propio n° 298 CNV,
// Agente ByMA 118) sells in Buenos Aires shares and CEDEARs, with no login.
// The broker publishes no list of its own. Its FAQ names the products and
// no restricted list:
//
//   https://winsa.com.ar/quienes-somos/#faq
//   "¿Qué productos ofrecemos? Con Win Securities podes invertir en bonos,
//   obligaciones negociables, acciones, CEDEARS, futuros, cauciones,
//   cheques, opciones y fondos comunes de inversión."
//
// So the catalogue is BYMA's whole share and CEDEAR board (CEDEARs of US
// ETFs such as SPY and QQQ included), read by ../bancogalicia/bymaBook.mjs:
// the peso and MEP-dollar (D) lines of every local share and CEDEAR that
// BYMA quotes and that traded in the last months; block lines, closed-end
// funds, bond CEDEARs, rights, warrants and dormant or delisted lines are
// left out there. Cable (C) lines are not written: no page of the site
// (home, FAQ, fee page, terms) names cable or CCL dollars or a transfer of
// cash abroad; the only foreign line of the fee page moves securities
// ("Transferencias Depositarias del Exterior"). Bonds, letras, ONs and
// options are other products.
//
// Fees ("Aranceles y comisiones"): "Acciones Locales" minimum $0 – 50,
// "hasta 1,5%", plus IVA and BYMA market rights:
//   https://winsa.com.ar/aranceles-y-comisiones/
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   node brokers/winsecurities/winsecurities_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("Win Securities", { cable: false });
fs.writeFileSync(new URL("winsecurities-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`Win Securities: ${rows.length} rows`);
