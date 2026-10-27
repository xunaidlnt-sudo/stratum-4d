// Vector marks for the Stratum 4D / Miqyas Labs identity. Colours are the
// brand palette: Deep Navy #0B2545, Warm Gold #D4A574, Steel Blue #355B7D,
// Light Stone #EBECEF, Stratum Red #E10600.
const C = { navy: "#0B2545", gold: "#D4A574", steel: "#355B7D", stone: "#EBECEF", red: "#E10600", white: "#FFFFFF" };

/**
 * The Stratum mark, traced from the brand sheet (viewBox 0 0 165 170):
 * rising bars split by a white channel along the red progress line, which
 * climbs from the lower left and turns straight up into a milestone node.
 * Above the line: navy, gold, steel; below it: navy; a slim gold bar at right.
 */
let uidN = 0;
function stratumMark({ upper = [C.navy, C.gold, C.steel], lower = C.navy, slim = C.gold, line = C.red, node = C.white } = {}) {
  const id = `sm${uidN++}`;
  const L = "M9,160 C24,160 34,155 46,148 L120,100 C134,91 141,82 141,66 L141,40";
  // Regions above and below the line, leaving a white channel around it.
  const above = `M0,0 L165,0 L165,170 L141,170 L141,${66 - 0} C141,82 134,91 120,100 L46,148 C34,155 24,160 9,160 L0,160 Z`;
  const base = 164;
  const col = (x0, x1, yl, yr) => `M${x0},${yl} L${x1},${yr} L${x1},${base} L${x0},${base} Z`;
  const cols = [
    [8, 37, 104, 86],
    [49.6, 78, 77, 59],
    [90.4, 119.6, 49.6, 31],
  ];
  const up = cols.map(([a, b, l, r], i) => `<path d="${col(a, b, l, r)}" fill="${upper[i]}" clip-path="url(#${id}u)"/>`).join("");
  const low = cols.slice(1).map(([a, b]) => `<path d="${col(a - 3, b, 60, 40)}" fill="${lower}" clip-path="url(#${id}l)"/>`).join("");
  return `<defs>
    <clipPath id="${id}u"><path transform="translate(0 -19)" d="${above}"/></clipPath>
    <clipPath id="${id}l"><path transform="translate(0 15)" d="M0,170 L165,170 L165,0 L141,0 L141,66 C141,82 134,91 120,100 L46,148 C34,155 24,160 9,160 L0,160 Z"/></clipPath>
  </defs>
  ${up}${low}
  <path d="M132,105 L143.6,100 L143.6,${base} L132,${base} Z" fill="${slim}"/>
  <path d="${L}" fill="none" stroke="${line}" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/>
  <g transform="translate(145 21) rotate(18)"><rect x="-12.5" y="-12.5" width="25" height="25" rx="6.5" fill="${node}" stroke="${line}" stroke-width="8.5"/></g>`;
}

/** Miqyas Labs monogram: a building-like M with a doorway, a right pillar and gold facets. */
function miqyasMark({ navy = C.navy, gold = C.gold } = {}) {
  return `<path d="M4,40 L44,18 L44,98 L4,98 Z M16,58 L32,49 L32,98 L16,98 Z" fill="${navy}" fill-rule="evenodd"/>
  <path d="M52,28 L70,18 L70,88 L52,98 Z" fill="${navy}"/>
  <path d="M38,0 L52,8 L38,16 L24,8 Z" fill="${gold}"/>
  <path d="M48,14 L60,7 L60,21 Z" fill="${gold}"/>
  <path d="M74,66 L88,74 L74,82 Z" fill="${gold}"/>`;
}

module.exports = { C, stratumMark, miqyasMark };
