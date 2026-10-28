// What Codepe Corretora (Codepe Corretora de Valores e Câmbio, Barueri)
// sells on B3, with no login. Its cost page prints one "Tabela de
// Corretagem - Mesa de Operações e Home Broker B3 (Segmento Bovespa)"
// (R$ 2,70 fixed up to R$ 135,07, then 2% / 1,5% / 1% / 0,5%, plus 5%
// ISS) and the B3 fees for "Ações e Fundos de Investimento", naming
// "ETF de Renda Fixa" among them. Its rules (Regras e Parâmetros de
// Atuação) take orders for the cash market of the Bovespa segment, "lote
// padrão e fracionário". The broker prints no security list of its own
// and names no board, segment or line it does not trade, so the book is
// the whole B3 cash equity book: shares, units, BDRs of foreign shares,
// Brazilian ETFs (equity and fixed income), BDRs of foreign ETFs and the
// 21Shares crypto ETP BDRs, read by ../nubank/b3Book.mjs (what it keeps
// and leaves out, suspended and never-traded lines included, is written
// there). Listed property funds, options, rights, warrants and
// subscription receipts stay out. One place, B3 (MIC BVMF), everything
// in reais.
//
//   https://www.codepe.com.br/custos-operacionais   (tariff)
//   https://www.codepe.com.br/regras-e-parametros
//
//   node brokers/codepecorretora/codepecorretora_scraping.mjs

import { writeB3Catalogue } from "../nubank/b3Book.mjs";

await writeB3Catalogue(import.meta.url, "codepecorretora-parsed.json");
