// Фракции: матрица отношений и репутация игроков.
export const FACTIONS = {
  severane: { id: 'severane', name: 'Северяне', hostileToPlayers: false },
  ozerny: { id: 'ozerny', name: 'Озёрный союз', hostileToPlayers: false },
  stepnyaki: { id: 'stepnyaki', name: 'Степняки', hostileToPlayers: false },
  bandits: { id: 'bandits', name: 'Вольница', hostileToPlayers: true },
  monsters: { id: 'monsters', name: 'Дикие твари', hostileToPlayers: true },
};

// отношения фракций между собой (-100..100)
export const RELATIONS = {
  severane: { ozerny: 30, stepnyaki: 0, bandits: -80, monsters: -100 },
  ozerny: { severane: 30, stepnyaki: 10, bandits: -70, monsters: -100 },
  stepnyaki: { severane: 0, ozerny: 10, bandits: -50, monsters: -100 },
  bandits: { severane: -80, ozerny: -70, stepnyaki: -50, monsters: -40 },
  monsters: {},
};

export function makeReputation() {
  return { severane: 10, ozerny: 10, stepnyaki: 10, bandits: -50, monsters: -100 };
}

export function isHostileToPlayer(factionId, rep) {
  if (factionId === 'monsters') return true;
  return (rep[factionId] ?? 0) < -20;
}

export function priceMultiplier(rep) {
  // репутация 50+ — скидка 20%, отрицательная — наценка
  return Math.max(0.8, Math.min(1.6, 1 - (rep ?? 0) / 250));
}
