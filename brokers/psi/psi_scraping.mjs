// What PetroVietnam Securities (PSI) sells in shares and exchange-traded funds, with
// no login. The broker's price board is the book. It loads each floor with
// one call: marketIndexCd 100 is HOSE, 200 HNX, 300 UPCOM. secType 1 is a
// share, 4 an ETF, 3 a bond. A secType 1 line named "Quỹ …" is a closed-end
// fund. Shares and ETFs are kept; bonds and closed-end funds are other
// products and are not written. A ticker shows once per order book, so
// repeats on one floor collapse. The board prints no ISIN; the Vietnamese
// number is built from the ticker. The shared rules are in
// ../vix/vnboard.mjs.
//
//   https://price.psi.vn/HNX-IDX?lang=vi
//   https://price.psi.vn/rest/market/api/initSession?marketIndexCd=100&secType=0
//
//   node brokers/psi/psi_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { finish, stockBoardRest } from "../vix/vnboard.mjs";

const HOST = "https://price.psi.vn";

const { lines, leftOut } = await stockBoardRest(HOST);
const rows = finish(lines, leftOut);
fs.writeFileSync(new URL("psi-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
