// What one round trip costs at CAF Securities (Securities CAF Argentina
// S.A., ALyC y AN Propio n° 643 CNV): buy n shares at price p and sell them
// back, in dollars, ordered on its online trading platform. Two places in
// the catalogue: BYMA (Buenos Aires shares and CEDEARs, ETF certificates
// included; peso, MEP (D) and cable (C) lines) and the US (NYSE and Nasdaq
// listings, in dollars).
//
// Read on 2026-10-26. "Tabla de comisiones máximas", the "Comisiones" link
// of the home page (file of June 2018, no later one published):
//   https://cafsecurities.com.ar/wp-content/uploads/2018/06/honorarios.pdf
//
//   "CONTADO Privados", "MÍNIMO ($) de $0 a $50", "MÁXIMO (%) 3%". The
//   maximum is the figure (owner rule): 3 % a side with a 50-peso minimum
//   (its peso equivalent on a dollar line).
//   "A los aranceles arriba expuestos se le debe agregar el IVA
//   correspondiente con excepción a ... títulos públicos, obligaciones
//   negociables ...": 21 % on a share or CEDEAR commission.
//   "(1) Solamente arancel de SECURITIES CAF ARGENTINA S.A.": market rights
//   are on top and not printed, so BYMA's 0.05 % + IVA a side
//   (../bancogalicia/bymaCost.mjs, BYMA "Derechos de Mercado sobre
//   Operaciones", 2026-08-14).
//
// US lines: the home page names NYSE and NASDAQ among the markets it
// trades, but the table has no line for them ("CONTADO" is the local cash
// market) and no other page prints a price: the total is N/A, the book is
// shown. The owner took the same "CONTADO Privados" 3 % + IVA as a
// stand-in (2026-10-26).
//
// Book: BYMA's own; on the US the quoted NBBO (no US dealer named). Tax:
// taxMap.mjs names none.
// Left out: dividends, custody and account upkeep (no figure printed),
// cauciones, options.
//
// Cash: pesos and dollars (deposits.mjs); a line settles in its own
// currency and no FX enters the number. The remark is the MEP half spread
// on a peso or MEP line, the CCL one on a cable or US line.
//
//   node brokers/cafsecurities/cafsecurities_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/cafsecurities/cafsecurities_cost.mjs GGAL BCBA ARS --shares=1 --price=1000
//   node brokers/cafsecurities/cafsecurities_cost.mjs US0378331005 XNAS USD --shares=4 --price=250
//   node brokers/cafsecurities/cafsecurities_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { arUsCostFile } from "../bullmarket/arUsCost.mjs";

const file = arUsCostFile({
  folder: "cafsecurities",
  name: "CAF Securities",
  catalogue: new URL("cafsecurities-parsed.json", import.meta.url),
  byma: {
    schedule: {
      url: "https://cafsecurities.com.ar/wp-content/uploads/2018/06/honorarios.pdf",
      page: "https://cafsecurities.com.ar/",
      readOn: "2026-10-26",
      inForce: "2018-06",
      entity: "Securities CAF Argentina S.A. (ALyC y AN Propio n° 643)",
    },
    cash: ["ARS", "USD"],
    commission: { rate: 0.03, minArs: 50 },
    vatOnCommission: true,
    basis: "« Tabla de comisiones máximas » (juin 2018) : contado privados 3 % + IVA par sens (maximum retenu), minimum 50 pesos + IVA ; droits BYMA 0,05 % + IVA",
  },
  us: {
    rate: 0.03,
    minArs: 50,
    vat: true,
    url: "https://cafsecurities.com.ar/wp-content/uploads/2018/06/honorarios.pdf",
    readOn: "2026-10-26",
    basis: "aucune ligne US publiée : la ligne « CONTADO Privados » 3 % + IVA (minimum 50 pesos) tient lieu (choix du propriétaire, 2026-10-26)",
    notes: ["aucun courtier américain nommé : NBBO coté", "SEC, TAF et CAT non imprimées : 0"],
  },
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
