/** Fictional name generator. Every output passes the real-name guard or is regenerated. */
import { realNameHit } from "@/lib/safety/realnames";
import type { Rng } from "./rng";

const FIRST = [
  "Ines", "Tobias", "Marisol", "Odile", "Kwame", "Priya", "Lennart", "Saoirse", "Dmitri", "Amara", "Caspian", "Wren", "Ishaan", "Noor", "Bastian",
  "Femi", "Ottilie", "Rafe", "Yara", "Ansel", "Delphine", "Kofi", "Mirela", "Teodor", "Anouk", "Jovan", "Esme", "Rohan", "Linnea", "Cyrus", "Halima",
  "Edda", "Matteo", "Zainab", "Florin", "Ilse", "Tariq", "Vesna", "Oren", "Maelle", "Idris", "Sunniva", "Arjun", "Clio", "Emeka", "Rosalind", "Henrik",
  "Ayesha", "Lucan", "Thea", "Nikhil", "Marguerite", "Bram", "Selin", "Dario", "Imke", "Leocadia", "Ravi", "Soledad", "Ewan",
];
const LAST = [
  "Calloway", "Vantongeren", "Okonkwo", "Haldane", "Brightwater", "Sarnoff", "Delacroix-Moss", "Fenwick", "Ilunga", "Marchetti", "Quist", "Ravensworth",
  "Szabo", "Thornbury", "Underhill", "Varga", "Whitlock", "Yilmaz", "Abernathy", "Castellano", "Duquesne", "Ebbesen", "Farrow", "Galloway", "Hollis",
  "Iyer", "Juniper", "Kestrel", "Lindqvist", "Merriweather", "Nakashima", "Oyelaran", "Pemberton", "Quarles", "Rourke", "Stavros", "Tolliver", "Umeh",
  "Vasquez-Lane", "Wexford", "Achterberg", "Bellweather", "Corrigan", "Dunmore", "Esterhazy", "Fairlie", "Grantham", "Hargreave", "Ingersoll", "Jablonski",
];
const COMPANY = [
  "Mulch", "Tessera", "Halfpint", "Ledgerleaf", "Ferrule", "Basalt", "Orrery", "Quillfeather", "Wickerwork", "Tessellate Labs", "Brine & Co", "Cobalt Hearth",
  "Sundial", "Gristmill", "Lanternfish", "Kiln", "Marrow", "Thimble", "Paddock", "Fathom", "Cinderwick", "Plover", "Bellows", "Sorrel", "Tidewright", "Copperleaf",
  "Hearthstone", "Larkspur", "Millrace", "Oxbow", "Quarry", "Rookery", "Spindle", "Tallow", "Umber", "Verdigris", "Wainscot", "Yarrow", "Alder", "Bramble",
  "Caraway", "Dovetail", "Eddy", "Flintlock", "Gantry", "Hollowell", "Inkwell", "Jetty", "Keel", "Loam", "Mortar", "Nettle", "Orchard", "Pumice", "Rivet",
  "Saltmarsh", "Trellis", "Vellum", "Whetstone", "Zephyrine", "Ambergrid", "Bluefin Works", "Coldframe", "Driftline", "Emberly", "Foxglove", "Graphite Row",
  "Haystack", "Ironwood", "Juniper Six", "Kettle", "Lodestar", "Meadowlark", "Nimbus Field", "Outrigger", "Pinecone", "Quayside", "Redshank", "Slipstream",
  "Tinderbox", "Undertow", "Vantage Hill", "Wayfarer", "Yeoman", "Zinnia",
];
const FUND_A = ["Brightline", "Greywether", "Obelisk", "Halyard", "Cormorant", "Ashgrove", "Tamarisk", "Copperfield", "Marlowe", "Kingfisher", "Saltash", "Northwick",
  "Blackthorn", "Larchmont", "Pellucid", "Windrose", "Stonebridge", "Corvid", "Aldergate", "Fenmore"];
const FUND_SUFFIX = ["Capital", "Partners", "Ventures", "Fund", "& Co"];
const PAIRS = [["Atlas", "Ash"], ["Rook", "Rye"], ["Hart", "Haven"], ["Flint", "Fern"], ["Salt", "Sable"], ["Moss", "Merit"]];
const ACQ = ["Monolith Corp", "Meridian Holdings", "Ironclad Group", "Paragon Industries", "Consolidated Lantern", "Vastwater Holdings"];

export const RESERVED = { demoFounder: "Ines Calloway", demoFund: "Greywether Partners", demoCompany: "Mulch" };

function guarded(rng: Rng, make: () => string, used: Set<string>, fallback: (i: number) => string): string {
  for (let i = 0; i < 40; i++) {
    const n = make();
    if (!used.has(n) && !realNameHit(n).hit) {
      used.add(n);
      return n;
    }
  }
  for (let i = 2; ; i++) {
    const n = fallback(i);
    if (!used.has(n) && !realNameHit(n).hit) {
      used.add(n);
      return n;
    }
  }
}

export function founderName(rng: Rng, used: Set<string>): string {
  return guarded(rng, () => `${rng.pick(FIRST)} ${rng.pick(LAST)}`, used, (i) => `${rng.pick(FIRST)} ${rng.pick(LAST)} ${["II", "III", "IV"][i % 3]}`);
}

export function companyName(rng: Rng, used: Set<string>): string {
  return guarded(rng, () => rng.pick(COMPANY), used, (i) => `${rng.pick(COMPANY)} ${["Labs", "Works", "Co", "Systems", "Field"][i % 5]}${i > 5 ? ` ${i}` : ""}`);
}

export function fundName(rng: Rng, used: Set<string>): string {
  const firstWords = new Set([...used].map((n) => n.split(" ")[0]));
  const fresh = <T,>(xs: readonly T[], key: (x: T) => string) => {
    const left = xs.filter((x) => !firstWords.has(key(x)));
    return rng.pick(left.length ? left : xs);
  };
  return guarded(
    rng,
    () => (rng.next() < 0.2 ? (([a, b]) => `${a} & ${b}`)(fresh(PAIRS, (p) => p[0])) : `${fresh(FUND_A, (x) => x)} ${rng.pick(FUND_SUFFIX)}`),
    used,
    (i) => `${rng.pick(FUND_A)} ${rng.pick(FUND_SUFFIX)} ${["II", "III", "IV", "V"][i % 4]}`,
  );
}

export function acquirerName(rng: Rng, used: Set<string>): string {
  return guarded(rng, () => rng.pick(ACQ), used, (i) => `${rng.pick(ACQ)} ${i}`);
}

export function isSafeName(name: string): boolean {
  return !realNameHit(name).hit;
}
