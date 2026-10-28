// What one round trip costs at Buenos Aires Valores (BAVSA, ALyC y AN
// Integral no. 497 at the CNV): buy n Buenos Aires shares or CEDEARs (ETF
// certificates included) at price p and sell them back, in dollars, ordered
// on its client platform (clientes.bavsa.com). Lines in pesos and in MEP
// dollars (D lines); no cable (C) line is written.
//
// Read on 2026-10-26. Fee schedule ("aranceles"):
//   https://www.bavsa.com/assets/aranceles/1764853082_arances-p-pagina-webpdf.pdf
//   "Compra / Venta de Acciones": "Desde 0.01%", "Hasta 2.00%", "Mínimo
//   N/A", each side. A range with no rule for where a client falls: the
//   maximum, 2.00%, is the figure (owner's rule), with no minimum.
//   Note 1: "Se deberá adicionar el IVA sobre el importe de la comisión o
//   arancel ... con excepción de los informados para Títulos Públicos,
//   Bonos, Letras": 2% × 1.21 = 2.42% a side.
//   Note 2: "Se deberá adicionar los Derechos de Mercado ... podrán
//   verificarse en las páginas web de BYMA": BYMA's 0.05% + IVA a side
//   (../bancogalicia/bymaCost.mjs, BYMA "Derechos de Mercado sobre
//   Operaciones", 2026-08-14):
//   https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a7f24c87e8bd58f712c02d1_BYMA-Derechos-Mercado-sobre-Operaciones_2026-08-14-vf.pdf
//   "Mantenimiento de Cuenta (mensual) AR$ 60" + IVA: negligible, left out.
//   No same-session rate is printed.
//
// Formula, each side: 2% × notional × 1.21 + 0.05% × notional × 1.21; plus
// the book, and a tax when taxMap.mjs names one (none on BYMA).
// Left out: dividends (up to 1%), cable settlements (USD 50 a transaction;
// no cable line is on the platform), foreign transfers, the AR$ 60 monthly
// fee, and BYMA's day-trade bonus (the figure assumes another day).
//
// Cash: pesos and dollars (the platform shows the account in "pesos (ARS)
// y dólares (USD)", gives a CBU per currency to fund it, and its order form
// offers "ARS (pesos) o USD (dólares)"), so a line settles in its own
// currency and no FX enters the number; the MEP quote's half spread is the
// remark.
//   https://clientes.bavsa.com/manualUsuario.html
//
//   node brokers/buenosairesvalor/buenosairesvalor_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/buenosairesvalor/buenosairesvalor_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/buenosairesvalor/buenosairesvalor_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const file = bymaCostFile({
  folder: "buenosairesvalor",
  name: "Buenos Aires Valores",
  catalogue: new URL("buenosairesvalor-parsed.json", import.meta.url),
  schedule: {
    url: "https://www.bavsa.com/assets/aranceles/1764853082_arances-p-pagina-webpdf.pdf",
    page: "https://clientes.bavsa.com/manualUsuario.html",
    readOn: "2026-10-26",
    entity: "Buenos Aires Valores S.A. (ALyC y AN Integral n° 497)",
  },
  cash: ["ARS", "USD"],
  commission: { rate: 0.02 },
  vatOnCommission: true,
  basis: "aranceles : actions de 0,01 % à 2,00 % par sens, maximum retenu 2,00 % + IVA, sans minimum ; droits BYMA 0,05 % + IVA",
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
