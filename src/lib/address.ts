/* ───── Address parsing ─────
 * Nominatim-style comma-separated addresses look like:
 *   "Karl Johans gate 1, 0154 Oslo, Oslo, Norway"           (Norway — city == county)
 *   "221B Baker Street, London NW1 6XE, Greater London, England, United Kingdom"
 *   "350 5th Ave, New York, NY 10118, United States"
 *   "Some Cafe, Springfield, Greene, Missouri, United States"
 *   "Cafe Marco, Rome"
 *   "Main Cafe (downtown), Berlin, Berlin (state), Germany"
 *
 * The array goes left-to-right: street → city → county/(state) → region/continent → country.
 * The trickiest pieces are stripping postcodes (which sometimes embed a city), recognising
 * sub-country regions ("England", "Scotland"), and skipping "looks like street" vs "looks
 * like POI" tokens that aren't actually administrative levels.
 */

export function parsePlaceAddress(address: string | null | undefined): { city?: string; county?: string } {
  if (!address || typeof address !== 'string') return {}
  let parts = address.split(',').map((s) => s.trim()).filter(Boolean)
  if (parts.length === 0) return {}
  parts = parts.map((p) => p.replace(/\s*\([^)]*\)/g, '').trim()).filter(Boolean)
  if (parts.length === 0) return {}

  // 1. Walk every part: discard noise, keep an "admins" list.
  //    A noisy part is one of: country, sub-country region, US-style state abbreviation,
  //    bare postcode. Otherwise we keep the part — and if it looks like a "postcode+city"
  //    or "city+postcode" combo, we extract the city portion.
  //
  //    We deliberately do NOT dedupe identical names: in Nominatim's comma-order the
  //    same string can legitimately appear twice (e.g. "Oslo, Oslo, Norway" where the
  //    first Oslo is the city/municipality level and the second is the county level).
  //    Keeping the duplicate gives us n=2 and the second position resolves to county.
  const admins: string[] = []

  for (const raw of parts) {
    const lo = raw.toLowerCase()
    if (COUNTRY_HINTS.has(lo)) continue
    if (SUB_COUNTRY_REGIONS.has(lo)) continue
    if (/^[A-Za-z]{1,3}$/.test(raw)) continue        // state abbrev like NY
    if (/^\d/.test(raw) && !/\s/.test(raw)) continue // bare postcode like 10118

    const extracted = extractCityFromPostcodeCombo(raw)
    const piece = (extracted || raw).trim()
    if (!piece) continue

    // Classify: skip POIs and streets (those aren't administrative levels).
    if (isStreetLike(piece) || isVenueLike(piece)) continue
    admins.push(piece)
  }

  if (admins.length === 0) return {}

  // 2. Keyword-first: anything tagged CITY_RE / COUNTY_RE wins outright.
  const taggedCity = admins.find((p) => CITY_RE.test(p))
  const taggedCounty = admins.find((p) => COUNTY_RE.test(p))

  // 3. Length-based positional fallback. In comma-order the array reads
  //    from street → city → county → state/region → country, so the FIRST admin
  //    item is the deepest (closest to street = city) and the last is the
  //    shallowest (county/region/state).
  const n = admins.length
  let city = taggedCity
  let county = taggedCounty

  if (!city) {
    // n >= 1: the leftmost admin item is always the city tier.
    city = admins[0]
  }
  if (!county) {
    if (n === 1) {
      // Only one admin tier known — leave county undefined so we don't double-count
      // city == county for an Oslo-style address would have already produced n=2.
      county = undefined
    } else if (n === 2) {
      county = admins[1]
    } else {
      county = admins[1]
    }
  }

  return { city, county }
}

/* ───── helpers ───── */

function extractCityFromPostcodeCombo(p: string): string | null {
  // UK style: "London NW1 6XE" → "London"
  const uk = p.match(/^(.+?)\s+[A-Z]{1,2}\d{1,2}[A-Z]?\s+\d[A-Z]{2}$/)
  if (uk) return uk[1].trim()
  // Norwegian / continental style: "0154 Oslo" → "Oslo"
  const num = p.match(/^\d{3,5}\s+(.+)$/)
  if (num) return num[1].trim()
  return null
}

function isStreetLike(p: string): boolean {
  if (/\b(Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Lane|Ln\.?|Boulevard|Blvd\.?|Drive|Dr\.?|Place|Pl\.?|Way|Highway|Hwy\.?|Court|Ct\.?|Circle|Cir\.?|Terrace|Ter\.?|Parkway|Pkwy\.?|Alley|Path)\b/i.test(p)) return true
  if (/\b(gate|gatan|gade|vei|allée|allee|platz|straße|strasse|str\.?|chaussee|chaussée)\b/i.test(p)) return true
  if (/^\d+[A-Z]?\s+\S/.test(p)) return true // "221B Baker Street"
  return false
}

function isVenueLike(p: string): boolean {
  if (/\b(Cafe|Restaurant|Coffee|Bar|Museum|Gallery|Building|Tower|Plaza|Market|Shop|Store|Center|Centre|Hostel|Theatre|Theater|Library|Mall|Inn|Church|Cathedral|Square|Park)\b/i.test(p)) return true
  return false
}

const COUNTY_RE = /(county|kommune|shire|council|region|province|department|prefecture|oblast|governorate|landskap|fylke|parish|municipality|borough)\b/i
const CITY_RE = /(city|town|village|hamlet|borough|municipality|parish|by|stad|stadt|bourg)\b/i

// Major countries (full names + common abbreviations). Anything matching is treated
// as the last token of the address and dropped.
const COUNTRY_HINTS = new Set([
  'united states', 'usa', 'u.s.a.', 'us', 'america',
  'united kingdom', 'uk', 'great britain', 'gb',
  'norway', 'sweden', 'denmark', 'den', 'finland', 'iceland',
  'germany', 'germany', 'de', 'france', 'spain', 'italy', 'portugal', 'ireland', 'netherlands', 'holland',
  'belgium', 'austria', 'switzerland', 'poland', 'czechia', 'czech republic', 'slovakia',
  'hungary', 'romania', 'bulgaria', 'greece', 'turkey', 'russia',
  'china', 'japan', 'korea', 'south korea', 'north korea', 'taiwan',
  'canada', 'mexico', 'brazil', 'argentina', 'chile', 'colombia', 'peru', 'venezuela',
  'australia', 'new zealand', 'indonesia', 'thailand', 'vietnam', 'malaysia',
  'india', 'pakistan', 'bangladesh', 'nepal', 'sri lanka', 'philippines', 'singapore',
  'egypt', 'morocco', 'south africa', 'kenya', 'nigeria', 'ghana',
  'united arab emirates', 'uae', 'saudi arabia', 'israel', 'iran', 'iraq',
  'hong kong', 'macao', 'macau',
])

// Sub-country admin regions that appear between county and country in UK / a few others.
// We treat them like countries and drop them so they don't get mis-classified as counties.
const SUB_COUNTRY_REGIONS = new Set([
  'england', 'scotland', 'wales', 'northern ireland',
  'corsica', 'sicily', 'sardinia',
  'taiwan', 'hawaii', 'alaska',
])
