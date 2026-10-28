// What Progresión SCB sells online in shares and ETFs, with no login.
// Its online platform is Trader Pro. Its rules (ANV-RGL-002) say the
// platform "limita la negociación a títulos de renta variable inscritos en
// el RNVE que se puedan transar a través del sistema de negociación de la
// BVC, incluidos los títulos listados en el Mercado Global Colombiano", and
// the Trader Pro presentation says the client can buy "acciones inscritas
// en la Bolsa de Valores de Colombia" and trade "instrumentos
// internacionales a través del Mercado Global Colombiano". Progresión
// prints no list of its own, so the catalogue is the whole BVC equity book,
// both segments, all in pesos on XBOG (shared module
// brokers/progresion/bvcColombiaBook.mjs):
// - the local market (board EQTY): shares, preferred shares, local ETFs,
//   and the PEI and TIN real-estate participation titles, which are
//   "títulos de renta variable" traded on the same BVC system;
// - the Mercado Global Colombiano (board MGC): foreign shares, ETFs, the
//   Invesco physical gold ETC and the Compass DVA closed-end fund. The MGC
//   page: "A través del MGC, usted puede adquirir títulos de empresas
//   globales" (Progresión sponsors Microsoft, MSFTCO).
//
// Left out:
// - Suspended lines (BVC status "Suspendido"), lines never traded or with
//   no trade in the last 365 days, and subscription rights: the module
//   drops them and prints which.
// - Canacol Energy (CNEC): the BVC suspended its spot trading in November
//   2025 after the TSX halt, and the company is in a CCAA restructuring
//   (https://www.accivalores.com/en/otros-informes/canacol-energy-suspension-de-negociacion-en-la-bvc-y-orden-de-proteccion-frente-a-acreedores/).
//   The BVC still shows it "Inactivo", so the module alone would keep it.
// - Bonds, repos, TTV, simultaneous operations: not shares. The rules allow
//   spot buys and sells only ("Compra y/o venta de contado").
// The per-order and per-account limits in the rules (minimum half a
// monthly minimum wage, maximum 100 to 1,000) depend on the client and are
// not removals.
//
// Fees (Trader Pro tariff, page 4, "TARIFAS CLIENTES TRADER PRO"):
//   https://www.progresion.com.co/wp-content/uploads/2026/09/Tarifario-2026-1.pdf
// Sources:
//   https://www.progresion.com.co/canales-digitales/trader-pro/
//   https://www.progresion.com.co/wp-content/uploads/2026/05/ANV-RGL-002-Reglamento-y-Anexo-1.-ANV-RGL-002-Horarios-y-Esquema-de-Soporte-Plataforma-TraderPro-V0.pdf
//   https://www.progresion.com.co/wp-content/uploads/2025/10/Presentacion-TRADER-PRO-28102025.pdf
//   https://www.progresion.com.co/mercado-global-colombiano/
//
// Run (about 11 minutes, three gentle calls per BVC line):
//   node brokers/progresion/progresion_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bvcColombiaBook } from "./bvcColombiaBook.mjs";

const OUTPUT = new URL("progresion-parsed.json", import.meta.url);

// Suspended on the BVC and in CCAA restructuring, though the BVC status
// still reads "Inactivo".
const DROP = new Set(["CNEC"]);

const book = await bvcColombiaBook({ segments: ["EQTY", "MGC"] });

const rows = [];
for (const row of book) {
  if (DROP.has(row.ticker)) continue;
  const { segment, ...rest } = row;
  rows.push(rest);
}
if (rows.length < 100) throw new Error(`only ${rows.length} BVC lines kept`);

const stamped = stampRows(withoutObligations(rows));
for (const row of stamped) if (row.isin) row.query = row.isin;
fs.writeFileSync(OUTPUT, JSON.stringify(stamped, null, 2));

const byType = new Map();
for (const row of stamped) byType.set(row.type, (byType.get(row.type) || 0) + 1);
console.error(
  `${stamped.length} listings, ${stamped.filter((row) => row.isin).length} with ISIN ` +
    `(${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")})`,
);
