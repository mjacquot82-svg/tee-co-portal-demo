// "Also known as" colour names: Tee & Co's colour name -> S&S colour name, used only to find the
// S&S photos. Customers still see Tee & Co's name. Only clear matches are listed here; see PR #74
// for colours left unmatched on purpose (different colour, two-tone combos, or not sold by S&S Canada).

// Any style.
export const GLOBAL_COLOR_ALIASES = {
  "athletic grey": "Sport Grey",
};

// Per S&S style key (see buildStyleKey), e.g. "ypclassics|6606".
export const STYLE_COLOR_ALIASES = {
  "rabbitskins|3317": { mauvelou: "Mauvelous" },
  "nextlevel|1533": { ingido: "Indigo" },
  // YP Classics 6606 is only sold in two-tone versions; these names have exactly one S&S match.
  "ypclassics|6606": {
    "coyote brown": "Coyote Brown/ Black",
    "green camo": "Green Camo/ Black",
    moss: "Moss/ Khaki",
    "multicam alpine": "Multicam Alpine/ White",
    "multicam black": "Multicam Black/ Black",
    "milticam tropic": "Multicam Tropic/ Green",
    "realtree edge": "Realtree Edge/ Brown",
    "realtree max7": "Realtree Max7/ Brown",
    "rustic orange": "Rustic Orange/ Khaki",
    "steel blue": "Steel Blue/ Silver",
    turquoise: "Turquoise/ White",
    maroon: "Maroon/ Grey",
    royal: "Royal/ White",
  },
};

function key(value) {
  return String(value ?? "").toLowerCase().replace(/[™®©�]/g, "").replace(/\s+/g, " ").trim();
}

// Returns the S&S colour name to look up, or "" when there is no alias.
export function resolveColorAlias(colorName, styleKey = "") {
  const k = key(colorName);
  return STYLE_COLOR_ALIASES[styleKey]?.[k] || GLOBAL_COLOR_ALIASES[k] || "";
}
