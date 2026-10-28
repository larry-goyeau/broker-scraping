// What one round trip costs at Ualá México (Ualá, S.A., Institución de Banca
// Múltiple, "Acciones"; orders executed and shares held by DriveWealth, LLC):
// buy n shares at price p, sell them straight back, in the app, in dollars.
// US-listed shares and ETFs, whole or fractional.
//
// Page and FAQ, read in full 2026-10-26:
//   https://www.uala.mx/acciones
//
//   commission   "Ualá cobra 0% de comisión tanto por la compra como por la
//                venta de acciones"; "no pagas comisión por comprar
//                acciones desde la app"; "Opera sin costos ni comisiones."
//   currency     "En la app de Ualá siempre operas en pesos mexicanos (MXN),
//                aunque las acciones coticen en dólares (USD). La conversión
//                se realiza automáticamente al comprar y al vender." Rate:
//                "el vigente al momento exacto de tu operación", shown on the
//                confirmation screen. No spread or markup is printed.
//   SEC/TAF/CAT  not printed: 0
//
// The general cost table (https://www.uala.mx/tabla-costos, PDF
// "Tabla_de_comisiones_y_rendimientos_VSep2") has no Acciones line.
//
// Cash is pesos only and every line is in dollars, so each leg is a forced
// MXN/USD conversion at a rate Ualá does not publish. Owner rule: an
// unpublished forced FX makes the total N/A; no Ualá or DriveWealth page
// prints a nearby figure to stand in. The file still returns the book, the
// $0 commission and the parts.
//
// Formula: book (605 × Q of DriveWealth) + $0 + $0 + FX (unknown) = N/A.
//
// Routing: "La ejecución y tenencia de las acciones es operado directamente
// por DriveWealth, LLC" (CRD 165429), which files its own 606: rule606 key
// "drivewealth".
//
// Not costs: orders from $20 MXN, at most $200,000 MXN of buys a day.
//
//   node brokers/ualamexico/ualamexico_cost.mjs US0378331005 XNAS USD --shares=2.8758 --price=347.725
//   node brokers/ualamexico/ualamexico_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const SCHEDULE = {
  broker: "Ualá México",
  folder: "ualamexico",
  catalogueUrl: new URL("ualamexico-parsed.json", import.meta.url),
  url: "https://www.uala.mx/acciones",
  readOn: "2026-10-26",
  entity: "Ualá, S.A., Institución de Banca Múltiple (advice); DriveWealth, LLC (execution, custody)",
  rule606: "drivewealth",
  cash: "MXN",
  deposits: ["MXN"],
  feeCurrency: "USD",
  ticket: () => 0,
  levies: { sec: false, taf: false, cat: false },
  fx: { unpublished: true },
  basis:
    "FAQ Ualá Acciones, relue le 2026-10-26 : « Ualá cobra 0% de comisión tanto por la compra como por la venta de acciones », " +
    "opérations toujours en pesos, conversion automatique au taux « vigente », marge non publiée",
  notes: [
    "change MXN/USD forcé aux deux jambes, taux non publié : total N/A (règle du propriétaire)",
    "exécution et garde chez DriveWealth, LLC (CRD 165429) : Q de DriveWealth",
  ],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
