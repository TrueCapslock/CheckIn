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

export interface ParsedAddress {
  city?: string
  county?: string
  country?: string
}

export function parsePlaceAddress(address: string | null | undefined): ParsedAddress {
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
  let country: string | undefined
  // Tracks whether the FIRST admin piece was inferred from a "postcode+locality" combo
  // (e.g. "1366 Lysaker" → "Lysaker"). For a 3-token Norwegian address
  // [road, pcode+locality, country] this flag says "the only admin we have is the
  // postcode's sub-area, not a real city", which is what lets us suppress the city
  // assignment further below without breaking 4-token Norwegian addresses (where the
  // second admin IS the actual county).
  let firstAdminIsPostcodeDerived = false

  for (const raw of parts) {
    const lo = raw.toLowerCase()
    if (lo in COUNTRY_MAP) {
      // Canonicalise so "U.S.A." and "USA" don't fracture the user's list/counts.
      if (country === undefined) country = COUNTRY_MAP[lo]
      continue
    }
    if (SUB_COUNTRY_REGIONS.has(lo)) continue
    if (/^[A-Za-z]{1,3}$/.test(raw)) continue        // state abbrev like NY
    if (/^\d/.test(raw) && !/\s/.test(raw)) continue // bare postcode like 10118

    const extracted = extractCityFromPostcodeCombo(raw)
    const piece = (extracted || raw).trim()
    if (!piece) continue

    // Classify: skip POIs and streets (those aren't administrative levels).
    if (isStreetLike(piece) || isVenueLike(piece)) continue
    if (admins.length === 0 && extracted !== null) firstAdminIsPostcodeDerived = true
    admins.push(piece)
  }

  if (admins.length === 0) return { country }

  // 2. Keyword-first: anything tagged CITY_RE / COUNTY_RE wins outright.
  const taggedCity = admins.find((p) => CITY_RE.test(p))
  const taggedCounty = admins.find((p) => COUNTY_RE.test(p))

  // 3. Length-based positional fallback. In comma-order the array reads
  //    from street → city → county → state/region → country, so the FIRST admin
  //    item is the deepest (closest to street = city) and the last is the
  //    shallowest (county/region/state).
  const n = admins.length
  let city = taggedCity
  let county2 = taggedCounty

  if (!city) {
    // n >= 1: the leftmost admin item is always the city tier.
    city = admins[0]
  }
  if (!county2) {
    if (n === 1) {
      // Only one admin tier known — leave county undefined so we don't double-count
      // city == county for an Oslo-style address would have already produced n=2.
      county2 = undefined
    } else if (n === 2) {
      county2 = admins[1]
    } else {
      county2 = admins[1]
    }
  }

  // Norwegian 3-token pattern: "[road, postcode+locality, country]". The locality is
  // almost always a suburb/village (e.g. "Lysaker", "Lørenskog", "Ski") rather than a
  // proper city, so promoting it to "city" inflates the user's city list with junk.
  // Drop the city in that narrow case UNLESS the locality is one of the major
  // municipalities that Nominatim also occasionally surfaces in this 3-token form.
  if (n === 1 && firstAdminIsPostcodeDerived && country === 'Norway' && SAFE_NORWEGIAN_CITIES.has(city!)) {
    // Keep Oslo/Bergen/Trondheim/etc. — they're real cities even at 3 tokens.
    // (Lysaker falls through; flag above isn't enough; the whitelist gates it.)
  } else if (n === 1 && firstAdminIsPostcodeDerived && country === 'Norway' && city) {
    city = undefined
  }

  return { city, county: county2, country }
}

/* ───── helpers ───── */

function extractCityFromPostcodeCombo(p: string): string | null {
  // UK style: "London NW1 6XE" → "London"
  const uk = p.match(/^(.+?)\s+[A-Z]{1,2}\d{1,2}[A-Z]?\s+\d[A-Z]{2}$/)
  if (uk) return uk[1].trim()
  // Swedish style: "291 66 Kristianstad" or "111 60 Stockholm"
  //   (3-5 digit postcode + 1-5 digit locality area + city). Must be checked BEFORE
  //   the generic num pattern, otherwise the greedy `.+` swallows the locality code.
  const se = p.match(/^\d{3,5}\s+\d{1,5}\s+(.+)$/)
  if (se) return se[1].trim()
  // Norwegian / continental style: "0154 Oslo" → "Oslo"
  const num = p.match(/^\d{3,5}\s+(.+)$/)
  if (num) return num[1].trim()
  return null
}

function isStreetLike(p: string): boolean {
  if (/\b(Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Lane|Ln\.?|Boulevard|Blvd\.?|Drive|Dr\.?|Place|Pl\.?|Way|Highway|Hwy\.?|Court|Ct\.?|Circle|Cir\.?|Terrace|Ter\.?|Parkway|Pkwy\.?|Alley|Path)\b/i.test(p)) return true
  // Scandi/German/French street suffixes. We list the BASE ("väg", "vei") and the
  // DEFINITE form ("vägen", "veien") as separate alternation branches so that the
  // `?` modifier doesn't silently flip "väg" into "väge" the way `vägen?` would
  // (the `?` only applies to the immediately preceding character). The lookahead
  // `(?=\s|\d|$)` requires the suffix to be followed by whitespace, a digit, or
  // end of string — so we don't false-match the "stad" inside "Kristianstad".
  if (/(gate|gatan|gate[ns]?|vei|veien|veg|vegen|väg|vägen|gade|gaden|allée|allee|platz|straße|strasse|str\.?|chaussee|chaussée)(?=\s|\d|$)/i.test(p)) return true
  if (/^\d+[A-Z]?\s+\S/.test(p)) return true // "221B Baker Street"
  return false
}

function isVenueLike(p: string): boolean {
  if (/\b(Cafe|Restaurant|Coffee|Bar|Museum|Gallery|Building|Tower|Plaza|Market|Shop|Store|Center|Centre|Hostel|Theatre|Theater|Library|Mall|Inn|Church|Cathedral|Square|Park)\b/i.test(p)) return true
  return false
}

const COUNTY_RE = /(county|kommune|shire|council|region|province|department|prefecture|oblast|governorate|landskap|fylke|parish|municipality|borough)\b/i
const CITY_RE = /(city|town|village|hamlet|borough|municipality|parish|by|stad|stadt|bourg)\b/i

// Map from lower-cased country token (or abbreviation / alternate spelling) to the
// canonical English name we store / display. Anything matching a key here is treated
// as a country token and stripped from the admins list — the canonical name is kept
// separately so we can list "Countries visited" without fracturing the user list
// (e.g. so "USA" and "United States" collapse to one entry).
const COUNTRY_MAP: Record<string, string> = {
  'united states': 'United States',
  'usa': 'United States',
  'u.s.a.': 'United States',
  'us': 'United States',
  'america': 'United States',
  'united kingdom': 'United Kingdom',
  'uk': 'United Kingdom',
  'great britain': 'United Kingdom',
  'gb': 'United Kingdom',
  'norway': 'Norway',
  'sweden': 'Sweden',
  'denmark': 'Denmark',
  'den': 'Denmark',
  'finland': 'Finland',
  'iceland': 'Iceland',
  'germany': 'Germany',
  'de': 'Germany',
  'france': 'France',
  'spain': 'Spain',
  'italy': 'Italy',
  'portugal': 'Portugal',
  'ireland': 'Ireland',
  'netherlands': 'Netherlands',
  'holland': 'Netherlands',
  'belgium': 'Belgium',
  'austria': 'Austria',
  'switzerland': 'Switzerland',
  'poland': 'Poland',
  'czechia': 'Czechia',
  'czech republic': 'Czechia',
  'slovakia': 'Slovakia',
  'hungary': 'Hungary',
  'romania': 'Romania',
  'bulgaria': 'Bulgaria',
  'greece': 'Greece',
  'turkey': 'Turkey',
  'russia': 'Russia',
  'china': 'China',
  'japan': 'Japan',
  'korea': 'South Korea',
  'south korea': 'South Korea',
  'north korea': 'North Korea',
  'taiwan': 'Taiwan',
  'canada': 'Canada',
  'mexico': 'Mexico',
  'brazil': 'Brazil',
  'argentina': 'Argentina',
  'chile': 'Chile',
  'colombia': 'Colombia',
  'peru': 'Peru',
  'venezuela': 'Venezuela',
  'australia': 'Australia',
  'new zealand': 'New Zealand',
  'indonesia': 'Indonesia',
  'thailand': 'Thailand',
  'vietnam': 'Vietnam',
  'malaysia': 'Malaysia',
  'india': 'India',
  'pakistan': 'Pakistan',
  'bangladesh': 'Bangladesh',
  'nepal': 'Nepal',
  'sri lanka': 'Sri Lanka',
  'philippines': 'Philippines',
  'singapore': 'Singapore',
  'egypt': 'Egypt',
  'morocco': 'Morocco',
  'south africa': 'South Africa',
  'kenya': 'Kenya',
  'nigeria': 'Nigeria',
  'ghana': 'Ghana',
  'united arab emirates': 'United Arab Emirates',
  'uae': 'United Arab Emirates',
  'saudi arabia': 'Saudi Arabia',
  'israel': 'Israel',
  'iran': 'Iran',
  'iraq': 'Iraq',
  'hong kong': 'Hong Kong',
  'macao': 'Macao',
  'macau': 'Macao',
}

// Sub-country admin regions that appear between county and country in UK / a few others.
// We treat them like countries and drop them so they don't get mis-classified as counties.
const SUB_COUNTRY_REGIONS = new Set([
  'england', 'scotland', 'wales', 'northern ireland',
  'corsica', 'sicily', 'sardinia',
  'taiwan', 'hawaii', 'alaska',
])

// Major Norwegian municipalities that Nominatim still surfaces in the 3-token
// "road, postcode+city, country" form. Used to gate the city suppression rule so
// these aren't accidentally demoted to "no city" (compare: Lysaker, Lørenskog, Ski).
const SAFE_NORWEGIAN_CITIES = new Set([
  'Oslo', 'Bergen', 'Trondheim', 'Stavanger', 'Kristiansand', 'Tromsø', 'Drammen',
])
