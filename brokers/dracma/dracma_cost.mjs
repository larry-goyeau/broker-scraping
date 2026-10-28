// What one round trip costs at Dracma Investments (Dracma S.A., ALyC n° 238
// CNV, BYMA agent n° 184): buy n Buenos Aires shares or CEDEARs (ETF
// certificates included) at price p and sell them back, in dollars. Lines in
// pesos and in MEP dollars (D lines).
//
// Read on 2026-10-26. "Tabla de Comisiones" (page modified 2026-06-25), the
// broker's only fee table, headed "Operaciones por Email, Presencial y
// Teléfono"; the FAQ "¿Cuáles son las comisiones mínimas?" sends to it, and
// no other rate (app or online platform) is printed, so it is used for the
// app as well, as a ceiling ("COMISIÓN MÁXIMA POR OPERACIÓN"):
//   https://dracmainv.com.ar/como-comenzar/tabla-de-comisiones/
//   https://dracmainv.com.ar/como-comenzar/preguntas-frecuentes/
//   Compra-Venta de      "1% + IVA + 0,08% Derechos de Mercado", "MÍNIMO
//   acciones (1)         $1000 o u$2", each side: 1% + 21% IVA, at least
//                        1,000 pesos on a peso line and USD 2 on a dollar
//                        line (+ IVA on the amount the minimum sets).
//   Market rights        The broker prints its own line, 0.08% each side.
//                        BYMA's rights on a share or a CEDEAR bear IVA (the
//                        bond line, "1% + 0,01%", carries none, as the law
//                        exempts it), so the figure adds 21%: 0.0968%, as at
//                        Banco Santa Cruz's identical 0.08% line.
//   Note (1)             "BONIFICACION DEL 50% DE LAS COMISIONES POR
//                        OPERATORIA INTRADIA DE TRADING (MISMO TITULO)": the
//                        remark; the figure assumes the sale is another day.
//   Custody              "HASTA 2% ANUAL (TRIMESTRAL) + SE TRASLADA EL COSTO
//                        DE CUSTODIA DE CAJA DE VALORES CON UN MINIMO DE $100
//                        + IVA": sizeable, so in the remark.
//   Left out             "Mantenimiento de cuentas $2000 + IVA" (no period,
//                        about USD 1.6), dividends "2% + IVA", CEDEAR
//                        issue / cancellation (USD 10 + IVA), transfers: not
//                        this order.
//
// Formula, each side: max(1% × notional, minimum) × 1.21 + 0.08% × notional
// × 1.21, plus the book (spreads/byma-touch.mjs) and a tax when taxMap.mjs
// names one.
//
// Cash: "Los depósitos en Pesos y/o en Dólares pueden ser realizados
// mediante transferencia a nuestras cuentas bancarias" (FAQ), so a line
// settles in its own currency and no FX enters the number; the remark is
// the MEP quote.
//
//   node brokers/dracma/dracma_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/dracma/dracma_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/dracma/dracma_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const file = bymaCostFile({
  folder: "dracma",
  name: "Dracma Investments",
  catalogue: new URL("dracma-parsed.json", import.meta.url),
  schedule: {
    url: "https://dracmainv.com.ar/como-comenzar/tabla-de-comisiones/",
    readOn: "2026-10-26",
    inForce: "2026-06-25",
    entity: "Dracma S.A. (ALyC n° 238 CNV)",
  },
  cash: ["ARS", "USD"],
  commission: { rate: 0.01, minArs: 1000, minUsd: 2 },
  vatOnCommission: true,
  market: 0.0008,
  marketVat: true,
  basis:
    "« Tabla de Comisiones » (page du 2026-06-25), relue le 2026-10-26 : compra-venta de acciones 1 % + IVA par sens, minimum 1 000 $ ou 2 u$, " +
    "« 0,08% Derechos de Mercado » + IVA par sens ; seule table publiée (titrée email, présentiel, téléphone), prise comme plafond pour l'appli",
  remark: "If the sale is the same day the commission is half. Custody up to 2% a year + VAT.",
  notes: ["bonification intrajournalière de 50 % hors calcul (vente supposée un autre jour)", "maintenance 2 000 $ + IVA sans période : hors calcul"],
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
