export interface LevelDef {
  id: string
  name: string
  rank: number
  tier: 'bronze' | 'silver' | 'gold'
  pointsRequired: number
  image: string
}

export const LEVELS: LevelDef[] = [
  { id: 'beginner_bronze', name: 'Bronze Beginner', rank: 1, tier: 'bronze', pointsRequired: 0, image: '/icons/levels/beginner_bronze.png' },
  { id: 'beginner_silver', name: 'Silver Beginner', rank: 1, tier: 'silver', pointsRequired: 100, image: '/icons/levels/beginner_silver.png' },
  { id: 'beginner_gold', name: 'Gold Beginner', rank: 1, tier: 'gold', pointsRequired: 300, image: '/icons/levels/beginner_gold.png' },
  { id: 'explorer_bronze', name: 'Bronze Explorer', rank: 2, tier: 'bronze', pointsRequired: 600, image: '/icons/levels/explorer_bronze.png' },
  { id: 'explorer_silver', name: 'Silver Explorer', rank: 2, tier: 'silver', pointsRequired: 1200, image: '/icons/levels/explorer_silver.png' },
  { id: 'explorer_gold', name: 'Gold Explorer', rank: 2, tier: 'gold', pointsRequired: 2000, image: '/icons/levels/explorer_gold.png' },
  { id: 'adventurer_bronze', name: 'Bronze Adventurer', rank: 3, tier: 'bronze', pointsRequired: 3500, image: '/icons/levels/adventurer_bronze.png' },
  { id: 'adventurer_silver', name: 'Silver Adventurer', rank: 3, tier: 'silver', pointsRequired: 5500, image: '/icons/levels/adventurer_silver.png' },
  { id: 'adventurer_gold', name: 'Gold Adventurer', rank: 3, tier: 'gold', pointsRequired: 8000, image: '/icons/levels/adventurer_gold.png' },
  { id: 'champion_bronze', name: 'Bronze Champion', rank: 4, tier: 'bronze', pointsRequired: 12000, image: '/icons/levels/champion_bronze.png' },
  { id: 'champion_silver', name: 'Silver Champion', rank: 4, tier: 'silver', pointsRequired: 17000, image: '/icons/levels/champion_silver.png' },
  { id: 'champion_gold', name: 'Gold Champion', rank: 4, tier: 'gold', pointsRequired: 24000, image: '/icons/levels/champion_gold.png' },
  { id: 'legend_bronze', name: 'Bronze Legend', rank: 5, tier: 'bronze', pointsRequired: 32000, image: '/icons/levels/legend_bronze.png' },
  { id: 'legend_silver', name: 'Silver Legend', rank: 5, tier: 'silver', pointsRequired: 42000, image: '/icons/levels/legend_silver.png' },
  { id: 'legend_gold', name: 'Gold Legend', rank: 5, tier: 'gold', pointsRequired: 55000, image: '/icons/levels/legend_gold.png' },
]

export function getLevelFromPoints(points: number): LevelDef {
  let level = LEVELS[0]
  for (const l of LEVELS) {
    if (points >= l.pointsRequired) level = l
  }
  return level
}

export function getNextLevel(points: number): LevelDef | null {
  for (const l of LEVELS) {
    if (l.pointsRequired > points) return l
  }
  return null
}

export function getLevelProgress(points: number): {
  current: LevelDef
  next: LevelDef | null
  progress: number
  pointsToNext: number
} {
  const current = getLevelFromPoints(points)
  const next = getNextLevel(points)
  if (!next) {
    return { current, next: null, progress: 1, pointsToNext: 0 }
  }
  const range = next.pointsRequired - current.pointsRequired
  const earned = points - current.pointsRequired
  return { current, next, progress: earned / range, pointsToNext: next.pointsRequired - points }
}

export const TIER_STYLE: Record<string, { bg: string; border: string; text: string; badgeBg: string; badgeText: string; progressBg: string }> = {
  bronze: {
    bg: 'bg-amber-50 dark:bg-amber-950',
    border: 'border-amber-300 dark:border-amber-700',
    text: 'text-amber-800 dark:text-amber-200',
    badgeBg: 'bg-amber-500',
    badgeText: 'text-white',
    progressBg: 'bg-amber-500',
  },
  silver: {
    bg: 'bg-gray-50 dark:bg-gray-800',
    border: 'border-gray-300 dark:border-gray-600',
    text: 'text-gray-700 dark:text-gray-200',
    badgeBg: 'bg-gray-400',
    badgeText: 'text-white',
    progressBg: 'bg-gray-400',
  },
  gold: {
    bg: 'bg-yellow-50 dark:bg-yellow-950',
    border: 'border-yellow-300 dark:border-yellow-700',
    text: 'text-yellow-800 dark:text-yellow-200',
    badgeBg: 'bg-yellow-500',
    badgeText: 'text-yellow-900',
    progressBg: 'bg-yellow-500',
  },
}
