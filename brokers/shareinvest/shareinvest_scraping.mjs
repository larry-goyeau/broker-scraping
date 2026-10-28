// Share Invest (SSIF Share Invest, Craiova) sells online the shares and
// ETFs of the Bucharest Stock Exchange through the BVB's Arena XT platform
// ("Tranzactionare online - Arena XT", https://shareinvest.arenaxt.ro/).
// It is a BVB member firm with BVB-authorised brokers ("Agent Bursa,
// Autorizat prin decizia BVB") and its fee page prices "fiecare tranzactie
// de cumparare sau vanzare" of shares on the BVB.
//
//   https://www.shareinvest.ro/index.php
//   https://www.shareinvest.ro/despre-noi.php
//
// Share Invest names no BVB segment, board or instrument it leaves out,
// so the catalogue is the whole BVB book: the regulated market, AeRO and
// the SMT Intl lines (German shares traded in lei on the BVB's MTF), in
// RON. Left out: suspended and never-traded lines, the closed-end fund
// units (BTF, STK, XFOA), and warrants, certificates, bonds and rights.
//
// The BVB crawl lives in ../brmssif/bvbBook.mjs, shared with BRM SSIF.
//
// Fees (1.5% / 1.0% / 0.7% by annual turnover, 0.5% intraday):
//   https://www.shareinvest.ro/taxe-si-comisioane.php
//
//   node brokers/shareinvest/shareinvest_scraping.mjs

import { writeBvbCatalogue } from "../brmssif/bvbBook.mjs";

await writeBvbCatalogue(import.meta.url, "shareinvest-parsed.json");
