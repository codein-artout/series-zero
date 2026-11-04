import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

export interface CompareResult {
  width: number;
  height: number;
  diffPixels: number;
  diffRatio: number;
  sideBySidePath?: string;
  diffPath?: string;
}

function crop(png: PNG, w: number, h: number): PNG {
  const out = new PNG({ width: w, height: h });
  PNG.bitblt(png, out, 0, 0, w, h, 0, 0);
  return out;
}

/**
 * Compares two screenshots over their common area. Writes a diff image and a
 * side-by-side (left: reference, right: actual) when `outDir` is given.
 */
export function compareScreenshots(
  referencePath: string,
  actualPath: string,
  outDir?: string,
  threshold = 0.15,
): CompareResult {
  const ref = PNG.sync.read(fs.readFileSync(referencePath));
  const act = PNG.sync.read(fs.readFileSync(actualPath));
  const w = Math.min(ref.width, act.width);
  const h = Math.min(ref.height, act.height);
  const a = crop(ref, w, h);
  const b = crop(act, w, h);
  const diff = new PNG({ width: w, height: h });
  const diffPixels = pixelmatch(a.data, b.data, diff.data, w, h, { threshold });
  const result: CompareResult = { width: w, height: h, diffPixels, diffRatio: diffPixels / (w * h) };
  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    const base = path.basename(actualPath, ".png");
    result.diffPath = path.join(outDir, `${base}.diff.png`);
    fs.writeFileSync(result.diffPath, PNG.sync.write(diff));
    const gap = 16;
    const sbs = new PNG({ width: ref.width + act.width + gap, height: Math.max(ref.height, act.height) });
    sbs.data.fill(0x30);
    PNG.bitblt(ref, sbs, 0, 0, ref.width, ref.height, 0, 0);
    PNG.bitblt(act, sbs, 0, 0, act.width, act.height, ref.width + gap, 0);
    result.sideBySidePath = path.join(outDir, `${base}.side-by-side.png`);
    fs.writeFileSync(result.sideBySidePath, PNG.sync.write(sbs));
  }
  return result;
}
