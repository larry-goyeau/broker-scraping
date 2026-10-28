// What one round trip costs at Les Cinq Capital (Les Cinq Capital S.A.,
// ALyC Integral n° 2305 CNV): buy n shares at price p and sell them back,
// in dollars. Two places in the catalogue: BYMA (leader and general panel
// shares and the 300 most traded CEDEARs; peso, MEP (D) and cable (C)
// lines) and NYSE, "NYSE Vía Interactive Brokers", in dollars.
//
// Read on 2026-10-26. "Aranceles y Comisiones", linked as "Cargos y
// Comisiones" from the home page, headed "Arancel Máximo":
//   https://cinqcapital.com/Tarifario_CINQ.pdf
//
//   "Operaciones al contado (Compra/Venta) Acciones - Cedears Hasta 1.5%".
//   A discretionary "hasta" is a published tariff and the maximum is the
//   figure (owner rule): 1.5 % a side, no minimum printed.
//   IVA: the sheet does not mention it; a broker's commission on a share or
//   a CEDEAR bears 21 % IVA (only public bonds and ONs are exempt), so it
//   is added, as on the other BYMA files whose sheet is silent.
//   Market rights are not printed: BYMA's 0.05 % + IVA a side
//   (../bancogalicia/bymaCost.mjs, table of 2026-08-14).
//   "Apertura de cuenta / Mantenimiento de cuenta Sin Cargo"; custody is a
//   Caja de Valores pass-through with no figure.
//
// NYSE lines: the home page says "NYSE Vía Interactive Brokers"; no line of
// the sheet names foreign shares and no page prints a price for them, so
// the total is N/A and the book is shown (605 × Q of Interactive Brokers
// LLC, the dealer named). The owner took the sheet's "Acciones - Cedears
// Hasta 1.5%" + IVA on the NYSE order as a stand-in (2026-10-26).
//
// Tax: taxMap.mjs names none.
//
// Cash: pesos and dollars (deposits.mjs); a line settles in its own
// currency and no FX enters the number. The remark is the MEP half spread
// on a peso or MEP line, the CCL one on a cable or NYSE line.
//
//   node brokers/lescinq/lescinq_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/lescinq/lescinq_cost.mjs SPY BCBA ARS --shares=20 --price=20930
//   node brokers/lescinq/lescinq_cost.mjs US46625H1005 XNYS USD --shares=4 --price=300
//   node brokers/lescinq/lescinq_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { arUsCostFile } from "../bullmarket/arUsCost.mjs";

const file = arUsCostFile({
  folder: "lescinq",
  name: "Les Cinq Capital",
  catalogue: new URL("lescinq-parsed.json", import.meta.url),
  rule606: "interactivebrokers",
  byma: {
    schedule: {
      url: "https://cinqcapital.com/Tarifario_CINQ.pdf",
      page: "https://www.cinqcapital.com/",
      readOn: "2026-10-26",
      entity: "Les Cinq Capital S.A. (ALyC Integral n° 2305)",
    },
    cash: ["ARS", "USD"],
    commission: { rate: 0.015 },
    vatOnCommission: true,
    basis: "« Aranceles y Comisiones » : acciones / cedears « Hasta 1.5% » (maximum retenu) + IVA par sens, sans minimum ; droits BYMA 0,05 % + IVA",
  },
  us: {
    rate: 0.015,
    vat: true,
    url: "https://cinqcapital.com/Tarifario_CINQ.pdf",
    readOn: "2026-10-26",
    basis: "aucune ligne NYSE publiée : « Acciones - Cedears Hasta 1.5% » + IVA par sens tient lieu (choix du propriétaire, 2026-10-26)",
    notes: ["NYSE « vía Interactive Brokers » : carnet 605 × Q d'Interactive Brokers LLC", "SEC, TAF et CAT non imprimées : 0"],
  },
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
