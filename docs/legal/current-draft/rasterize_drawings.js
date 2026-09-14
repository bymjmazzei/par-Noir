#!/usr/bin/env node
/** Rasterize FIG-*.svg → PNG at portrait aspect (resvg). */
const fs = require("fs");
const path = require("path");
const { Resvg } = require("@resvg/resvg-js");

const dir = path.join(__dirname, "drawings");
const width = 1224; // 2× 612pt

for (let i = 1; i <= 13; i++) {
  const svgPath = path.join(dir, `FIG-${i}.svg`);
  const pngPath = path.join(dir, `FIG-${i}.png`);
  const svg = fs.readFileSync(svgPath);
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: width } });
  fs.writeFileSync(pngPath, resvg.render().asPng());
  console.log("wrote", path.basename(pngPath));
}
