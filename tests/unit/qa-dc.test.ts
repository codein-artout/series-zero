import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { evalRenderVals, resolveTemplate, unwrapDc } from "@/lib/qa/dc";

const pitch = fs.readFileSync("design/mockups/PitchRoom.dc.html", "utf8");

describe("dc mockup unwrapping", () => {
  it("evaluates the pitch room beat machine", () => {
    expect(evalRenderVals(pitch, { beat: 2 })).toMatchObject({ beatNo: "3", r2: true, r3: false, nv: true });
    expect(evalRenderVals(pitch, { beat: 4 })).toMatchObject({ v: true, nextLabel: "Replay pitch" });
  });
  it("resolves sc-if and holes", () => {
    const out = resolveTemplate('<sc-if value="{{a}}">A</sc-if><sc-if value="{{b}}">B</sc-if>{{c}}', { a: true, b: false, c: "x" });
    expect(out).toBe("Ax");
  });
  it("drops google fonts and scripts", () => {
    const html = unwrapDc(pitch, { cssHref: "/sz.css", fontHrefs: ["/f.css"], state: { beat: 4 } });
    expect(html).not.toContain("fonts.googleapis");
    expect(html).not.toContain("DCLogic");
    expect(html).toContain("Seeded roll");
    expect(html).not.toContain("{{");
  });
});
