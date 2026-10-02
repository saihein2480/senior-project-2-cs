/**
 * Delivery coverage for online orders.
 *
 * The shop only delivers inside Tachileik town, so the city and state are fixed
 * and the customer picks their ward or local area from a fixed list, then types
 * only the street/house details.
 *
 * `address` stays a single composed string because the POS, invoices, order
 * emails and the payment routes all read it as-is. The structured parts are
 * stored alongside it (`addressLine`, `addressWard`) so the profile form can be
 * refilled exactly.
 */

export const DELIVERY_CITY = "Tachileik";
export const DELIVERY_STATE = "Shan State";
export const DELIVERY_AREA_LABEL = `${DELIVERY_CITY}, ${DELIVERY_STATE}`;

export const DELIVERY_AREA_NOTICE =
  "We currently deliver only within Tachileik town. Please choose your ward or area from the list.";

export type DeliveryAreaKind = "ward" | "local";

export type DeliveryArea = {
  /** English name; stored on the profile as `addressWard`. Must be unique. */
  name: string;
  /** Myanmar name, shown in the dropdown and searchable. */
  mm: string;
  kind: DeliveryAreaKind;
  /** Official ward a local area belongs to, added to the delivery address. */
  parentWard?: string;
  /** Short hint shown under the option. */
  note?: string;
  /** Other spellings customers type, used for search only. */
  aliases?: string[];
  /** Exact names saved by earlier versions of the form, still accepted. */
  legacyNames?: string[];
};

export const DELIVERY_AREA_GROUPS: { kind: DeliveryAreaKind; label: string }[] = [
  { kind: "ward", label: "Official wards" },
  { kind: "local", label: "Local areas" },
];

/** Wards and local areas of Tachileik town that we deliver to. */
export const DELIVERY_AREAS: readonly DeliveryArea[] = [
  // --- Official wards ---
  {
    name: "Ma Ka Ho Kham Ward",
    mm: "မကာဟိုခမ်းရပ်ကွက်",
    kind: "ward",
    aliases: ["Ma Ka Ho Hkam", "Makahokham"],
    legacyNames: ["Ma Ka Ho Hkam Ward"],
  },
  {
    name: "Mae Khaung Ward",
    mm: "မယ်ခေါင်ရပ်ကွက်",
    kind: "ward",
    aliases: ["Mae Khawng", "Mae Kong"],
    legacyNames: ["Mae Khawng Ward"],
  },
  { name: "Par Sat Ward", mm: "ပါဆတ်ရပ်ကွက်", kind: "ward", aliases: ["Pa Sat", "Parsat"] },
  {
    name: "Pone Htun Ward",
    mm: "ပုန်းထွန်းရပ်ကွက်",
    kind: "ward",
    aliases: ["Pone Tun", "Pon Tun", "Ponehtun"],
    legacyNames: ["Pone Tun Ward"],
  },
  {
    name: "San Sai Ward (A)",
    mm: "ဆန်ဆိုင်းရပ်ကွက် (က)",
    kind: "ward",
    aliases: ["San Sai A", "Sansai A", "Sang Hseng A", "San Sai Ka"],
  },
  {
    name: "San Sai Ward (B)",
    mm: "ဆန်ဆိုင်းရပ်ကွက် (ခ)",
    kind: "ward",
    aliases: ["San Sai B", "Sansai B", "Sang Hseng B", "San Sai Kha"],
  },
  { name: "Sae Kham Ward", mm: "ဆေခမ်းရပ်ကွက်", kind: "ward", aliases: ["Se Kham", "Saekham"] },
  {
    name: "Tar Lawt Ward",
    mm: "တာလော့ရပ်ကွက်",
    kind: "ward",
    aliases: ["Ta Lawt", "Talawt"],
  },
  {
    name: "Wan Kaung Ward",
    mm: "ဝမ်ကောင်းရပ်ကွက်",
    kind: "ward",
    aliases: ["Wan Kong", "Wankaung"],
  },
  {
    name: "Wain Kyaut Ward",
    mm: "ဝိန်းကျောက်ရပ်ကွက်",
    kind: "ward",
    aliases: ["Wein Kyauk", "Wain Kyauk"],
  },
  {
    name: "Yan Aung Myay Ward",
    mm: "ရန်အောင်မြေရပ်ကွက်",
    kind: "ward",
    aliases: ["Yan Aung Mye", "Yanaungmyay"],
  },

  // --- Local areas ---
  {
    name: "Par Hlan 1",
    mm: "ပါလျှံ (၁)",
    kind: "local",
    parentWard: "Yan Aung Myay Ward",
    aliases: ["Pa Hlan 1", "Parhlan 1"],
  },
  {
    name: "Par Hlan 2",
    mm: "ပါလျှံ (၂)",
    kind: "local",
    parentWard: "Yan Aung Myay Ward",
    aliases: ["Pa Hlan 2", "Parhlan 2"],
  },
  {
    name: "Par Hlan 3",
    mm: "ပါလျှံ (၃)",
    kind: "local",
    parentWard: "Yan Aung Myay Ward",
    aliases: ["Pa Hlan 3", "Parhlan 3"],
  },
  {
    name: "Par Hlan Kwet Thit",
    mm: "ပါလျှံကွက်သစ်",
    kind: "local",
    note: "Local subdivision",
    aliases: ["Pa Hlan Kwet Thit"],
  },
  {
    name: "Hong Leik",
    mm: "ဟောင်လိတ်",
    kind: "local",
    note: "Also addressed under Sae Kham / nearby areas",
    aliases: ["Haung Leik", "Hawng Leik", "Hongleik"],
  },
  {
    name: "Wang Hao",
    mm: "ဝမ်ဟောင်",
    kind: "local",
    note: "Around Hong Leik",
    aliases: ["Wan Haung", "Wanghao"],
  },
  {
    name: "Wang Lung",
    mm: "ဝမ်လုံ",
    kind: "local",
    note: "Hong Leik area",
    aliases: ["Wan Lone", "Wanglung"],
  },
  {
    name: "Hwe Khaik",
    mm: "ဟွေခိုက်",
    kind: "local",
    aliases: ["Hway Khaik", "Hwekhaik"],
  },
  {
    name: "Hwe Khaik Kwet Thit",
    mm: "ဟွေခိုက်ကွက်သစ်",
    kind: "local",
    note: "New development area",
    aliases: ["Hway Khaik Kwet Thit"],
  },
  {
    name: "Industrial Zone",
    mm: "စက်မှုဇုန်",
    kind: "local",
    aliases: ["Industry Zone", "Set Hmu Zone"],
  },
  {
    name: "Banana Field / Airport Area",
    mm: "ငှက်ပျောတော / လေယာဉ်ကွင်းအောက်",
    kind: "local",
    aliases: ["Banana Field", "Airport", "Nga Pyaw Taw", "Hnget Pyaw Taw"],
  },
  {
    name: "Lwe Satone",
    mm: "လွယ်စတုံ",
    kind: "local",
    aliases: ["Lway Sa Tone", "Lwesatone"],
  },
  {
    name: "Wan Mai",
    mm: "ဝမ်မိုင်",
    kind: "local",
    aliases: ["Wun Maing", "Wunmaing", "Wan Maing"],
  },
];

const SUFFIX = `, ${DELIVERY_AREA_LABEL}`;

/**
 * Lowercase and drop spaces/punctuation so "San-Sai" matches "sansai".
 * Myanmar characters (U+1000–U+109F) are kept so Burmese search works.
 */
function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\u1000-\u109f]/g, "");
}

/**
 * How the area appears inside the delivery address. Local areas carry their
 * ward so the rider knows where they are, e.g. "Par Hlan 1 (Yan Aung Myay Ward)".
 * Must not contain a comma: the address is split on the last comma.
 */
export function areaAddressLabel(area: DeliveryArea) {
  return area.parentWard ? `${area.name} (${area.parentWard})` : area.name;
}

/**
 * The area record for a stored name or address label, if it is one of ours.
 * Exact match only (ignoring case/spacing), so free text can't sneak through.
 */
export function findWard(name: string | undefined | null) {
  const key = normalize(name || "");
  if (!key) return undefined;
  return DELIVERY_AREAS.find((area) =>
    [area.name, areaAddressLabel(area), ...(area.legacyNames || [])].some(
      (label) => normalize(label) === key,
    ),
  );
}

function searchLabels(area: DeliveryArea) {
  return [area.name, area.mm, area.parentWard || "", ...(area.aliases || [])].filter(
    Boolean,
  );
}

/** Areas matching a search query (English, Myanmar, alias or parent ward). */
export function searchWards(query: string) {
  const q = normalize(query.replace(/\bward\b/gi, "").replace(/ရပ်ကွက်/g, ""));
  if (!q) return [...DELIVERY_AREAS];
  return DELIVERY_AREAS.filter((area) =>
    searchLabels(area).some((label) => normalize(label).includes(q)),
  );
}

/**
 * The area named in a free-text address. Picks the most specific match
 * ("Par Hlan Kwet Thit" over "Par Hlan"); returns nothing when the best match
 * is ambiguous, e.g. a bare "San Sai" could be (A) or (B).
 */
function detectWard(text: string) {
  const haystack = normalize(text);
  let best: DeliveryArea | undefined;
  let bestLen = 0;
  let tie = false;

  for (const area of DELIVERY_AREAS) {
    const labels = [area.name.replace(/ Ward.*$/, ""), area.mm, ...(area.aliases || [])];
    const len = Math.max(
      0,
      ...labels.map(normalize).filter((l) => l && haystack.includes(l)).map((l) => l.length),
    );
    if (!len) continue;
    if (len > bestLen) {
      best = area;
      bestLen = len;
      tie = false;
    } else if (len === bestLen) {
      tie = true;
    }
  }
  return tie ? undefined : best;
}

export type DeliveryAddressParts = {
  /** House number, street, landmark. */
  line: string;
  /** Area name from DELIVERY_AREAS. */
  ward: string;
};

/** Build the stored address string from its parts. */
export function composeDeliveryAddress({ line, ward }: DeliveryAddressParts) {
  const area = findWard(ward);
  const parts = [line.trim(), area ? areaAddressLabel(area) : ward.trim()].filter(Boolean);
  if (!parts.length) return "";
  return `${parts.join(", ")}${SUFFIX}`;
}

/**
 * Best-effort split of a stored address back into its parts, for profiles
 * saved before the structured fields existed. Addresses we composed are split
 * exactly; for anything else the city is stripped and an area is pre-selected
 * if the text clearly names one.
 */
export function parseDeliveryAddress(address: string): DeliveryAddressParts {
  const value = (address || "").trim();
  if (!value) return { line: "", ward: "" };

  if (value.endsWith(SUFFIX)) {
    const body = value.slice(0, -SUFFIX.length);
    const lastComma = body.lastIndexOf(",");
    const tail = lastComma === -1 ? body : body.slice(lastComma + 1);
    const area = findWard(tail.trim());
    if (area) {
      return {
        line: lastComma === -1 ? "" : body.slice(0, lastComma).trim(),
        ward: area.name,
      };
    }
    return { line: body.trim(), ward: "" };
  }

  // Legacy free text: drop city/state mentions so they aren't duplicated.
  const line = value
    .replace(/,?\s*shan\s*state\.?/gi, "")
    .replace(/,?\s*(tachileik|tachilek|tachilik)\.?/gi, "")
    .replace(/,?\s*တာချီလိတ်(မြို့)?။?/g, "")
    .replace(/[,\s]+$/, "")
    .trim();
  return { line, ward: detectWard(value)?.name || "" };
}

/**
 * True when the address is one we can deliver to: it ends with Tachileik and
 * names one of the listed areas. Used by checkout and re-checked by the order
 * routes, since the address arrives in a client-supplied payload.
 */
export function isDeliverableAddress(address: string | undefined | null) {
  const value = (address || "").trim();
  if (!value.endsWith(SUFFIX)) return false;
  const body = value.slice(0, -SUFFIX.length);
  const tail = body.slice(body.lastIndexOf(",") + 1).trim();
  return !!findWard(tail);
}
