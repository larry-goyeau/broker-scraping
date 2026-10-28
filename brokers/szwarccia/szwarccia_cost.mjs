// What one round trip costs at Szwarc & Cía (Szwarc & Cía S.A., SZ
// Bursátil, ALyC y AN Propio n° 644 CNV): buy n Buenos Aires shares or
// CEDEARs (ETF certificates included) at price p and sell them back, in
// dollars, ordered online. Lines in pesos and in MEP dollars (D lines); the
// broker writes no cable (C) line.
//
// Read on 2026-10-26. "Tabla de aranceles", OPERACIONES (columns
// INTERNET / TELEFÓNICO / MÍNIMO):
//   https://szbursatil.com/tabla-de-aranceles/
//   "Acciones – Compra/Venta" "0.45% + I.V.A." online, "0.90% + I.V.A." by
//   phone, minimum "$ 45.00 + I.V.A.", each side. The online line is used.
//   "Acciones locales Trading intradiario" "0.25% + I.V.A." online: a
//   local share bought and sold the same day pays 0.25% instead of 0.45%
//   on both legs, 44% less commission (the remark; CEDEARs are not
//   "acciones locales").
//   "Mantenimiento de cuenta – SIN COSTO" ($60 + I.V.A. a month only after
//   90 days without activity): no holding cost.
//   The page prints no rights line, so BYMA's 0.05% + IVA a side
//   (../bancogalicia/bymaCost.mjs, BYMA "Derechos de Mercado sobre
//   Operaciones", 2026-08-14):
//   https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a7f24c87e8bd58f712c02d1_BYMA-Derechos-Mercado-sobre-Operaciones_2026-08-14-vf.pdf
//
// Formula, each side: max(0.45% × notional, 45 pesos) × 1.21 + 0.05% ×
// notional × 1.21; plus the book, and a tax when taxMap.mjs names one (none
// on BYMA). A dollar line takes the peso equivalent of the minimum.
// Left out: the phone rate, dividends (0.90% + IVA), "Canje" (0.60% + IVA),
// transfers, and BYMA's day-trade bonus (the figure assumes another day).
//
// Cash: pesos and dollars. The tariff prices "Transferencia Emisora u$s
// Local" (u$s 10 + IVA) and "Transferencia Receptora u$s Local" (0.00)
// beside the peso transfers, so the account takes and pays out both; a line
// settles in its own currency and no FX enters the number; the MEP quote's
// half spread is the remark.
//
//   node brokers/szwarccia/szwarccia_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/szwarccia/szwarccia_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/szwarccia/szwarccia_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const RATE = 0.0045;
const DAY_RATE = 0.0025;
const DAY_GAP = Math.round((100 * (RATE - DAY_RATE)) / RATE);

const file = bymaCostFile({
  folder: "szwarccia",
  name: "Szwarc & Cía",
  catalogue: new URL("szwarccia-parsed.json", import.meta.url),
  schedule: {
    url: "https://szbursatil.com/tabla-de-aranceles/",
    page: "https://szbursatil.com/",
    readOn: "2026-10-26",
    inForce: "",
    entity: "Szwarc & Cía S.A. (ALyC y AN Propio n° 644)",
  },
  cash: ["ARS", "USD"],
  commission: { rate: RATE, minArs: 45 },
  vatOnCommission: true,
  basis: "actions, internet : 0,45 % + IVA par sens, minimum 45 pesos + IVA ; droits BYMA 0,05 % + IVA",
  remark: ({ cedear }) => (cedear ? "" : `If bought and sold the same day, commission is ${DAY_GAP}% lower.`),
  notes: ["tarif internet (téléphone 0,90 %)"],
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
