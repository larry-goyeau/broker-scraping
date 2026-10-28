// What one round trip costs at Banco Ciudad (Banco de la Ciudad de Buenos
// Aires, ALyC y AN Integral no. 108 at the CNV): buy n Buenos Aires shares
// or CEDEARs (ETF certificates included) at price p and sell them back, in
// dollars, ordered on-line from www.bancociudad.com.ar ("OPERATORIA DE
// INTERNET": "todas las operaciones de compra y venta de títulos valores
// ... on-line ... tanto en moneda local como en moneda extranjera"). Lines
// in pesos and in MEP dollars (D lines); the bank writes no cable (C) line.
//
// Read on 2026-10-26. Comitente account terms and "ANEXO COMISIONES" (the
// only fee sheet the bank serves without a login), section "6. COMPRA /
// VENTA DE VALORES MOBILIARIOS VIGENCIA 17/09/2025":
//   https://www.bancociudad.com.ar/cms/recursos/institucional/carpetarecurso/Informaci%C3%B3n%20al%20Usuario%20Financiero/Apertura_Cuenta_Comitente.pdf
//   "Títulos Privados 1,00%" (Compra/ Venta), each side; "A todos los
//   valores mencionados deberá adicionarse el IVA en caso de corresponder":
//   a broker commission on a share or a CEDEAR takes 21% IVA, 1.21% a side.
//   No minimum is printed.
//   The same table has "Títulos Públicos 0,50%" and "Comisión sobre el
//   valor de la transacción en Pesos 0,50%" / "en Dólares 0,50%". Those two
//   rows name no security; the private-securities row is the share price
//   and they are not added to it (read as the bank's currency / MEP
//   operation, not a share trade).
//   The terms debit "los costos por derechos de mercado correspondientes a
//   la operación" and print no rights line of their own, so BYMA's 0.05% +
//   IVA a side (../bancogalicia/bymaCost.mjs, BYMA "Derechos de Mercado
//   sobre Operaciones", 2026-08-14):
//   https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a7f24c87e8bd58f712c02d1_BYMA-Derechos-Mercado-sobre-Operaciones_2026-08-14-vf.pdf
//   "1. CUSTODIA–TÍTULOS ... Privados – Obligaciones Negociables, Acciones
//   0,36" % a year on the average daily holding at market value: a real
//   holding cost, in the remark.
//   No same-session rate is printed.
//
// Formula, each side: 1% × notional × 1.21 + 0.05% × notional × 1.21; plus
// the book, and a tax when taxMap.mjs names one (none on BYMA).
// Left out: custody (remark), dividends (2% of the credit, minimum $646 a
// month), transfers (0.10%, minimum $1,860), statements and certificates,
// and BYMA's day-trade bonus on the post-trade part (under 0.01% a side;
// the figure assumes another day).
//
// Cash: the account settles on the client's "Caja de Ahorro en Pesos" and
// "Caja de Ahorro en Dólares" (or current accounts) at the bank, so a line
// settles in its own currency and no FX enters the number; the MEP quote's
// half spread is the remark.
//
//   node brokers/bancociudad/bancociudad_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/bancociudad/bancociudad_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/bancociudad/bancociudad_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const file = bymaCostFile({
  folder: "bancociudad",
  name: "Banco Ciudad",
  catalogue: new URL("bancociudad-parsed.json", import.meta.url),
  schedule: {
    url: "https://www.bancociudad.com.ar/cms/recursos/institucional/carpetarecurso/Informaci%C3%B3n%20al%20Usuario%20Financiero/Apertura_Cuenta_Comitente.pdf",
    page: "https://www.bancociudad.com.ar/cms/recursos/institucional/carpetarecurso/Informaci%C3%B3n%20al%20Usuario%20Financiero/Apertura_Cuenta_Comitente.pdf",
    readOn: "2026-10-26",
    inForce: "2025-09-17",
    entity: "Banco de la Ciudad de Buenos Aires (ALyC y AN Integral n° 108)",
  },
  cash: ["ARS", "USD"],
  commission: { rate: 0.01 },
  vatOnCommission: true,
  basis: "annexe « Compra / Venta de valores mobiliarios » du 17/09/2025 : titres privés 1 % + IVA par sens, sans minimum ; droits BYMA 0,05 % + IVA",
  remark: "Custody 0.36% a year.",
  notes: [
    "garde 0,36 % par an (remarque)",
    "lignes « Comisión sobre el valor de la transacción en Pesos / en Dólares 0,50 % » non ajoutées (lues comme l'opération de change, pas l'achat d'actions)",
  ],
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
