// What one round trip costs at Veta Capital (Veta Capital S.A., ALyC
// propio n° 903 CNV): buy n shares at price p and sell them back, in
// dollars, placed by the client on the web platform ("Puede realizar las
// operaciones usted mismo desde nuestra plataforma web"). Two places from
// one account: BYMA (Buenos Aires shares and CEDEARs, ETF certificates
// included; peso, MEP (D) and cable (C) lines) and the US (the whole US
// exchange book, in dollars).
//
// Read on 2026-10-26. "Aranceles y Comisiones" prints its table as an image
// ("tabla comisiones para web (15 mayo 2023)"), columns "A través de
// asesor: Mínimo / Estándar" and "Web (persona física)":
//   https://www.vetacapital.com.ar/aranceles-y-comisiones
//   https://static.wixstatic.com/media/135c82_9f1879735982404abbc085ce57aea5e6~mv2.png
//
//   "Acciones Compra/venta $ 50 1% 0,15%", "CEDEARs Compra/venta $ 50 1%
//   0,15%": web 0.15 % a side; the $ 50 minimum sits in the adviser
//   columns, the web column prints none.
//   "Acciones exterior $ 50 1,50% 0,75%": web 0.75 % a side.
//   "Trading acciones/bonos por lado $ 50 0,50% 0,10%": a same-day round
//   trip pays 0.10 % a side on the web; the figure assumes another day, the
//   cut is the remark on a share line (the line names shares and bonds,
//   not CEDEARs): 0.15 → 0.10 % = 33 % lower commission.
//   IVA: the image does not mention it; a broker's commission on a share
//   bears 21 % IVA, so it is added, as on the other BYMA files whose sheet
//   is silent.
//   Market rights are not printed: BYMA's 0.05 % + IVA a side
//   (../bancogalicia/bymaCost.mjs, table of 2026-08-14). No US market fee
//   is printed: SEC, TAF and CAT stay 0.
//   "Apertura de cuenta Sin Cargo", "Mantenimiento de cuenta Sin Cargo".
//
// Book: BYMA's own; on the US the quoted NBBO (no US dealer named). Tax:
// taxMap.mjs names none.
// Left out: dividends (web 0.15 %), transfers (USD cable up to $ 100 plus
// bank costs), adviser orders (1 % / 1.50 %, min $ 50).
//
// Cash: pesos and dollars (deposits.mjs); a line settles in its own
// currency and no FX enters the number. The remark is the MEP half spread
// on a peso or MEP line, the CCL one on a cable or US line.
//
//   node brokers/veta/veta_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/veta/veta_cost.mjs US0378331005 XNAS USD --shares=4 --price=250
//   node brokers/veta/veta_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { arUsCostFile } from "../bullmarket/arUsCost.mjs";

const IMG = "https://static.wixstatic.com/media/135c82_9f1879735982404abbc085ce57aea5e6~mv2.png";

const file = arUsCostFile({
  folder: "veta",
  name: "Veta Capital",
  catalogue: new URL("veta-parsed.json", import.meta.url),
  byma: {
    schedule: {
      url: "https://www.vetacapital.com.ar/aranceles-y-comisiones",
      table: IMG,
      readOn: "2026-10-26",
      inForce: "2023-05-15",
      entity: "Veta Capital S.A. (ALyC propio n° 903)",
    },
    cash: ["ARS", "USD"],
    commission: { rate: 0.0015 },
    vatOnCommission: true,
    basis: "tableau web du 15 mai 2023 : acciones / CEDEARs 0,15 % + IVA par sens, sans minimum sur le web ; droits BYMA 0,05 % + IVA",
    // "Trading acciones/bonos": shares, not CEDEARs.
    remark: ({ cedear }) => (cedear ? "" : "Same day sell fees are 33% lower."),
  },
  us: {
    rate: 0.0075,
    vat: true,
    url: "https://www.vetacapital.com.ar/aranceles-y-comisiones",
    readOn: "2026-10-26",
    basis: "tableau web du 15 mai 2023 : « Acciones exterior » 0,75 % + IVA par sens, sans minimum sur le web",
    notes: ["aucun courtier américain nommé : NBBO coté", "SEC, TAF et CAT non imprimées : 0"],
  },
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
