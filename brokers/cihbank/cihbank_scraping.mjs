// What CIH Bank (Morocco) sells in shares, with no login. The bank's
// "Bourse en ligne" service (CIH Bourse en ligne, cihbankbourse.ma) lets a
// client "Exécuter des ordres de bourse à distance sans besoin de se
// déplacer" and "Consulter le marché boursier en temps réel"; orders go to
// the Casablanca Stock Exchange. The page names no list and no exclusion,
// so the book is every share of the Casablanca cash market, read from the
// exchange's own pages by ../valoris/casablancaBook.mjs. Left out there:
// shares the exchange has suspended (today SAMIR, Delattre Levivier Maroc,
// Diac Salaf), rights, bonds and funds. Casablanca lists no ETF. Every line
// trades in MAD on XCAS. broker-list.json gives the same single place.
//
// Fees: the bank's tariff for individuals and professionals, "Achat et
// vente de titres cotés": "a - Collecte d'ordre 0,10% du montant de
// l'ordre", "b - Règlement / Livraison de titres 0,20% du montant à régler
// ou à recevoir" (prices HT); custody on shares "de 0,075% à 0,30% en
// fonction du portefeuille, Min. 50 DH".
// The PDF text is read with PyMuPDF (`python3 -c "import fitz"`).
//
//   https://www.cihbank.ma/Professionnels/nos-innovations/bourse-en-ligne
//   https://www.cihbankbourse.ma/
//   https://www.cihbank.ma/tarification
//   https://www.cihbank.ma/themes/ciht/pdf/Tarification_particuliers_VF.pdf (fees)
//   https://www.casablanca-bourse.com/marches-produits/actions
//   https://www.casablanca-bourse.com/live-market/actions
//   https://www.casablanca-bourse.com/live-market/etf
//
//   node brokers/cihbank/cihbank_scraping.mjs

import { writeCasablancaCatalogue } from "../valoris/casablancaBook.mjs";
import { pageSays, getBytes } from "../alphasec/pdfSays.mjs";
import { spawnSync } from "node:child_process";

const PAGE = "https://www.cihbank.ma/Professionnels/nos-innovations/bourse-en-ligne";
const TARIFF = "https://www.cihbank.ma/themes/ciht/pdf/Tarification_particuliers_VF.pdf";

await pageSays(PAGE, [/Exécuter des ordres de bourse à distance/, /CIH Bourse en ligne/]);

const { status, body } = await getBytes(TARIFF);
if (status !== 200 || body.subarray(0, 4).toString() !== "%PDF") throw new Error(`${TARIFF} answered ${status}`);
const python = spawnSync("python3", ["-c", "import sys, fitz\nd = fitz.open(stream=sys.stdin.buffer.read(), filetype='pdf')\nprint(' '.join(p.get_text() for p in d))"], { input: body, maxBuffer: 16 * 1024 * 1024 });
if (python.status !== 0) {
  const detail = python.stderr?.toString() || "";
  throw new Error(detail.includes("No module named 'fitz'") ? "PyMuPDF is missing: pip install pymupdf" : `could not read the CIH tariff: ${detail.trim()}`);
}
const tariff = python.stdout.toString("utf8").replace(/\s+/g, " ");
for (const pattern of [/Achat et vente de titres cotés/, /Collecte d.ordre 0,10% du montant de l.ordre/, /Règlement \/ Livraison de titres 0,20%/]) {
  if (!pattern.test(tariff)) throw new Error(`the CIH tariff no longer says ${pattern}`);
}

await writeCasablancaCatalogue(import.meta.url, "cihbank-parsed.json");
