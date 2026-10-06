// One copy of the order books. Node keeps a module, so every cost script
// that imports this file shares the object. A script run on its own still
// reads the file; it is parsed once, not once per broker.

import fs from "node:fs";

const file = new URL("./spread.json", import.meta.url);
export const spreads = fs.existsSync(file)
  ? JSON.parse(fs.readFileSync(file, "utf8")).spreads || {}
  : {};
