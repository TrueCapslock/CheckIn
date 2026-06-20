import { describe, it, expect } from 'vitest'
import { escapeRegex, osmTagToType, overpassToPlace } from './overpass'
import type { OverpassResult } from './overpass'

describe('escapeRegex', () => {
  it('passes through simple strings', () => {
    expect(escapeRegex('bar')).toBe('bar')
    expect(escapeRegex('hello world')).toBe('hello world')
  })

  it('escapes regex special characters', () => {
    expect(escapeRegex('bar.')).toBe('bar\\.')
    expect(escapeRegex('b[a]r')).toBe('b\\[a\\]r')
    expect(escapeRegex('(bar)')).toBe('\\(bar\\)')
    expect(escapeRegex('b*r+?')).toBe('b\\*r\\+\\?')
    expect(escapeRegex('b^r$')).toBe('b\\^r\\$')
    expect(escapeRegex('b|r')).toBe('b\\|r')
    expect(escapeRegex('b{r}c')).toBe('b\\{r\\}c')
  })
})

describe('osmTagToType', () => {
  it('maps amenity=bar to bar', () => {
    expect(osmTagToType({ amenity: 'bar' })).toBe('bar')
  })

  it('maps amenity=restaurant to restaurant', () => {
    expect(osmTagToType({ amenity: 'restaurant' })).toBe('restaurant')
  })

  it('maps amenity=cafe to cafe', () => {
    expect(osmTagToType({ amenity: 'cafe' })).toBe('cafe')
  })

  it('maps amenity=nightclub to club', () => {
    expect(osmTagToType({ amenity: 'nightclub' })).toBe('club')
  })

  it('maps amenity=bar with cocktail=yes to lounge', () => {
    expect(osmTagToType({ amenity: 'bar', cocktail: 'yes' })).toBe('lounge')
  })

  it('maps amenity=lounge to lounge', () => {
    expect(osmTagToType({ amenity: 'lounge' })).toBe('lounge')
  })

  it('defaults to bar for unknown amenity', () => {
    expect(osmTagToType({ amenity: 'pub' })).toBe('bar')
  })

  it('defaults to bar for empty tags', () => {
    expect(osmTagToType({})).toBe('bar')
  })
})

describe('overpassToPlace', () => {
  const result: OverpassResult = {
    id: 'osm_node_12345',
    name: 'Test Bar',
    type: 'bar',
    address: '123 Main St',
    latitude: 45.5,
    longitude: -122.6,
  }

  it('converts OverpassResult to Place', () => {
    const place = overpassToPlace(result)
    expect(place.id).toBe('osm_node_12345')
    expect(place.name).toBe('Test Bar')
    expect(place.type).toBe('bar')
    expect(place.address).toBe('123 Main St')
    expect(place.latitude).toBe(45.5)
    expect(place.longitude).toBe(-122.6)
    expect(place.description).toBeNull()
    expect(place.photo_url).toBeNull()
    expect(place.website).toBeNull()
    expect(place.phone).toBeNull()
    expect(place.hours).toBeNull()
    expect(place.created_at).toBeTruthy()
  })

  it('preserves the type', () => {
    const lounge: OverpassResult = { ...result, type: 'lounge' }
    expect(overpassToPlace(lounge).type).toBe('lounge')
  })
})
