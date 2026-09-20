/**
 * Classify a hex colour into a basic colour family.
 *
 * The catalogue names colours like a paint chart — "Gun Powder", "Cinereous",
 * "Creole", "Napa" — so a shopper asking for "black" or "blue" matches nothing
 * by name. Every colour variant does carry a hex `colorCode`, so we derive the
 * family the shopper actually means from the hex instead.
 */

export type ColorFamily =
  | "black"
  | "white"
  | "gray"
  | "brown"
  | "beige"
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "navy"
  | "purple"
  | "pink";

/** Words a shopper might use, mapped to the family they mean. */
const FAMILY_SYNONYMS: Record<string, ColorFamily> = {
  black: "black",
  white: "white",
  gray: "gray",
  grey: "gray",
  silver: "gray",
  charcoal: "black",
  brown: "brown",
  tan: "beige",
  beige: "beige",
  cream: "beige",
  ivory: "beige",
  khaki: "beige",
  nude: "beige",
  red: "red",
  maroon: "red",
  burgundy: "red",
  orange: "orange",
  peach: "orange",
  yellow: "yellow",
  gold: "yellow",
  mustard: "yellow",
  green: "green",
  olive: "green",
  mint: "green",
  blue: "blue",
  navy: "navy",
  teal: "blue",
  cyan: "blue",
  purple: "purple",
  violet: "purple",
  lavender: "purple",
  pink: "pink",
  rose: "pink",
  magenta: "pink",
};

function hexToRgb(hex: string): [number, number, number] | null {
  const cleaned = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(cleaned)) return null;

  return [
    parseInt(cleaned.slice(0, 2), 16),
    parseInt(cleaned.slice(2, 4), 16),
    parseInt(cleaned.slice(4, 6), 16),
  ];
}

/** Standard RGB -> HSL, with hue in degrees and s/l as 0..1. */
function rgbToHsl(
  r: number,
  g: number,
  b: number,
): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;

  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const delta = max - min;

  if (delta === 0) return { h: 0, s: 0, l };

  const s = delta / (1 - Math.abs(2 * l - 1));

  let h: number;
  if (max === rn) h = 60 * (((gn - bn) / delta) % 6);
  else if (max === gn) h = 60 * ((bn - rn) / delta + 2);
  else h = 60 * ((rn - gn) / delta + 4);

  if (h < 0) h += 360;

  return { h, s, l };
}

/**
 * Family for a hex colour, or null if the hex is unusable.
 *
 * Classifies by hue/saturation/lightness rather than nearest-RGB, which keeps
 * dark desaturated colours out of the chromatic buckets — "Gun Powder" (#404558)
 * reads as near-black rather than blue.
 */
export function hexToColorFamily(hex: string): ColorFamily | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;

  const { h, s, l } = rgbToHsl(rgb[0], rgb[1], rgb[2]);

  // Near-neutral: decide on lightness, except that a faint warm tint at high
  // lightness is what people call beige/sand rather than gray ("Bison Hide").
  if (s < 0.15 || l < 0.08 || l > 0.95) {
    if (s >= 0.07 && l > 0.6 && l <= 0.9 && h >= 20 && h < 75) return "beige";
    if (l < 0.2) return "black";
    if (l > 0.85) return "white";
    return "gray";
  }

  // Muted mid-tones in the warm range read as brown or beige, not orange.
  const isWarm = h < 45 || h >= 330;
  if (isWarm && s < 0.45) {
    if (l < 0.35) return "brown";
    if (l > 0.65) return "beige";
    return "brown";
  }

  if (h >= 20 && h < 45 && s < 0.6 && l < 0.45) return "brown";
  // Pale warm tones are sand/beige rather than yellow or orange, even when
  // fairly saturated ("Coral Reef", "Desert Sand"). Vivid oranges sit darker.
  if (h >= 20 && h < 75 && l > 0.75 && s < 0.7) return "beige";
  if (h >= 20 && h < 75 && l > 0.65 && s < 0.4) return "beige";

  // Chromatic buckets.
  if (h < 15 || h >= 345) return "red";
  if (h < 40) return "orange";
  if (h < 70) return "yellow";
  if (h < 165) return "green";
  if (h < 255) {
    // Dark blues are what people call navy.
    return l < 0.35 ? "navy" : "blue";
  }
  if (h < 290) return "purple";
  if (h < 345) return "pink";

  return null;
}

/** Resolve a shopper's colour word to a family, or null if unrecognised. */
export function normalizeColorQuery(query: string): ColorFamily | null {
  const key = query.trim().toLowerCase();
  return FAMILY_SYNONYMS[key] ?? null;
}

/**
 * Does a product variant match the colour the shopper asked for?
 * Matches on the stored colour name first, then falls back to the hex family.
 */
export function variantMatchesColor(
  variantColorName: string | undefined,
  variantHex: string | undefined,
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return false;

  // Direct name match still wins, e.g. someone typing "gun powder".
  if (variantColorName && variantColorName.toLowerCase().includes(needle)) {
    return true;
  }

  const wantedFamily = normalizeColorQuery(needle);
  if (!wantedFamily || !variantHex) return false;

  return hexToColorFamily(variantHex) === wantedFamily;
}
