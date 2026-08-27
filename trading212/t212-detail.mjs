import fs from "node:fs";

const log = JSON.parse(fs.readFileSync(process.argv[2] || new URL("../parsed_json/t212-experiment.json", import.meta.url), "utf8"));
const stream = log.quoteStream.filter((q) => q.kind === "quote").sort((a, b) => a.at - b.at);

const nearest = (at) =>
  stream.reduce((best, q) => (Math.abs(q.at - at) < Math.abs(best.at - at) ? q : best), stream[0]);

const t0 = log.rounds[0].before.at;
console.log("round | buyFill  sellFill  crossed | CFD bid/ask at buy      at sell     | CFD spread | fillMid  cfdMid");
for (const r of log.rounds) {
  const buyQ = nearest(r.afterBuy.at);
  const sellQ = nearest(r.afterSell.at);
  const buyFill = r.debited / r.heldQuantity;
  const sellFill = r.credited / r.heldQuantity;
  const crossed = buyFill - sellFill;
  const fillMid = (buyFill + sellFill) / 2;
  const cfdMid = ((buyQ.bid + buyQ.ask) / 2 + (sellQ.bid + sellQ.ask) / 2) / 2;
  console.log(
    `n=${String(r.n).padEnd(2)} r${r.rep} | ${buyFill.toFixed(4)} ${sellFill.toFixed(4)} ${crossed.toFixed(4)}` +
      ` | ${buyQ.bid.toFixed(3)}/${buyQ.ask.toFixed(3)} (${((r.afterBuy.at - t0) / 1000).toFixed(0)}s)` +
      ` ${sellQ.bid.toFixed(3)}/${sellQ.ask.toFixed(3)} (${((r.afterSell.at - t0) / 1000).toFixed(0)}s)` +
      ` | ${(buyQ.ask - buyQ.bid).toFixed(4)}/${(sellQ.ask - sellQ.bid).toFixed(4)}` +
      ` | ${fillMid.toFixed(4)} ${cfdMid.toFixed(4)}` +
      ` | ratio ${(crossed / ((buyQ.ask - buyQ.bid + sellQ.ask - sellQ.bid) / 2)).toFixed(3)}`
  );
}

console.log("\n--- full quote stream ---");
for (const q of stream) {
  console.log(
    `${((q.at - t0) / 1000).toFixed(1)}s  bid ${q.bid.toFixed(3)} ask ${q.ask.toFixed(3)} spread ${(q.ask - q.bid).toFixed(4)} mid ${((q.ask + q.bid) / 2).toFixed(4)}`
  );
}

const last = log.quoteStream.filter((q) => q.kind === "last");
console.log("\n--- last-traded prints on the real ETF ---");
for (const q of last) console.log(`${((q.at - t0) / 1000).toFixed(1)}s  ${q.price}`);
