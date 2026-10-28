// BRM SSIF (SSIF Bursa Romana de Marfuri) sells online, through the BVB's
// Arena XT platform, the shares and ETFs of the Bucharest Stock Exchange:
// its regulated market and the AeRO alternative trading system. Its
// presentation document says it executes orders on "instrumentele
// financiare tranzactionabile pe piata reglementata [...] administrata de
// Bursa de Valori Bucuresti" and "pe sistemele alternative de
// tranzactionare (AeRO)", through "platforma Arena XT". Its trading-venue
// report for 2025 names one venue: "BURSA DE VALORI BUCURESTI", 100% of
// the equity volume.
//
//   https://ssif.brm.ro/platforma-bvb/
//   https://ssif.brm.ro/wp-content/uploads/document_de_prezentare_ssif_brm_sa.pdf
//   https://ssif.brm.ro/wp-content/uploads/Raport-privind-locurile-de-tranzactionare-2025.pdf
//
// BRM names no BVB segment, board or instrument it leaves out, so the
// catalogue is the whole BVB book: the regulated market, AeRO and the
// SMT Intl lines (German shares traded in lei on the BVB's MTF, reached
// through the same Arena XT order book), in RON. Left out: suspended and
// never-traded lines, the closed-end fund units (BTF, STK, XFOA), and
// warrants, certificates, bonds and rights. The foreign markets BRM offers
// through Interactive Brokers on TradeStation are another service and
// not this place.
//
// The BVB crawl lives in ./bvbBook.mjs, shared with Share Invest.
//
// Fees (percentage by portfolio value, 0.55% to 0.25%, plus 1 leu per order):
//   https://ssif.brm.ro/wp-content/uploads/TAXE-SI-COMISIOANE-PENTRU-TRANZACTIONAREA-PRIN-BRM.docx
//
//   node brokers/brmssif/brmssif_scraping.mjs

import { writeBvbCatalogue } from "./bvbBook.mjs";

await writeBvbCatalogue(import.meta.url, "brmssif-parsed.json");
