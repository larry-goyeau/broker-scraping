// What one round trip costs at Portfolio Investment (Portfolio Investment
// S.A., PISA, ALyC Integral n° 282, ACyDI n° 130 CNV): buy n Buenos Aires
// shares or CEDEARs (ETF certificates included) at price p and sell them
// back, in dollars, ordered on its web platform or app ("A través de nuestra
// web o descargá la APP para acceder al Mercado de Capitales de forma
// directa"; trading.portfolioinvestment.com.ar). Lines in pesos and in MEP
// dollars (D lines); the catalogue holds no cable (C) line.
//
// Read on 2026-10-26. "Aranceles, Comisiones y Recupero" (image on the
// Aranceles page, file dated 2026-05-04):
//   https://portfolioinvestment.com.ar/aranceles/
//   https://portfolioinvestment.com.ar/wp-content/uploads/2026/05/PI_Aranceles_4_05_2026.png
//   Operaciones, "Contado (Renta Fija y Renta Variable)": "Mínimo % 0,01%",
//   "Máximo % 3,00%", each side, no amount minimum. The sheet does not say
//   which client pays which rate, so the figure is the 3% ceiling (owner
//   rule: a range takes the max), as ../arata and ../cohen do.
//   IVA: the sheet prints none; a broker's commission on a share or a
//   CEDEAR bears 21% IVA in Argentina, as in ../arata: 3.63% a side.
//   "Adicionalmente se sumarán los derechos de mercado ... que fije Bolsas
//   y Mercados de Argentina S.A.": BYMA's 0.05% + IVA a side
//   (../bancogalicia/bymaCost.mjs, BYMA "Derechos de Mercado sobre
//   Operaciones", 2026-08-14):
//   https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a7f24c87e8bd58f712c02d1_BYMA-Derechos-Mercado-sobre-Operaciones_2026-08-14-vf.pdf
//   No same-session rate is printed. The 0.01% floor of the range is the
//   remark.
//
// Formula, each side: 3% × notional × 1.21 + 0.05% × notional × 1.21; plus
// the book, and a tax when taxMap.mjs names one (none on BYMA).
// Left out: "Asesoramiento preferencial USD 9,99 MENSUAL" (an optional
// service), dividends (0.01% to 3%), Caja de Valores charges passed on, and
// BYMA's day-trade bonus on the post-trade part (under 0.01% a side; the
// figure assumes another day). Account opening, custody services and
// transfers "NO SE COBRA ARANCEL".
//
// Cash: pesos and dollars ("Dólar Mep: Operá Dolar Mep con nosotros y
// dolarizá tu cartera"; "Cedears: Dolarizá tu cartera"), so a line settles
// in its own currency and no FX enters the number; the MEP quote's half
// spread is the remark.
//
//   node brokers/portfolio/portfolio_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/portfolio/portfolio_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/portfolio/portfolio_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const file = bymaCostFile({
  folder: "portfolio",
  name: "Portfolio Investment",
  catalogue: new URL("portfolio-parsed.json", import.meta.url),
  schedule: {
    url: "https://portfolioinvestment.com.ar/wp-content/uploads/2026/05/PI_Aranceles_4_05_2026.png",
    page: "https://portfolioinvestment.com.ar/aranceles/",
    readOn: "2026-10-26",
    inForce: "2026-05-04",
    entity: "Portfolio Investment S.A. (ALyC Integral n° 282)",
  },
  cash: ["ARS", "USD"],
  commission: { rate: 0.03 },
  vatOnCommission: true,
  basis: "« Aranceles, Comisiones y Recupero » : contado renta variable 0,01 % à 3,00 % (maximum retenu) + IVA par sens, sans minimum ; droits BYMA 0,05 % + IVA",
  remark: "Commission might be as low as 0.01%.",
  notes: ["ouverture de compte et garde sans frais"],
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
