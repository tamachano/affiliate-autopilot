import type { Product, ScoredProduct } from './types.js';

const weights = {
  demand: 0.30,
  visualDemo: 0.25,
  priceFit: 0.15,
  problemClarity: 0.15,
  affiliateFit: 0.15
};

export function scoreProduct(p: Product): ScoredProduct {
  const breakdown = {
    demand: +(p.demand * weights.demand).toFixed(2),
    visualDemo: +(p.visualDemo * weights.visualDemo).toFixed(2),
    priceFit: +(p.priceFit * weights.priceFit).toFixed(2),
    problemClarity: +(p.problemClarity * weights.problemClarity).toFixed(2),
    affiliateFit: +(p.affiliateFit * weights.affiliateFit).toFixed(2)
  };
  const score = +Object.values(breakdown).reduce((a,b) => a+b, 0).toFixed(2);
  return { ...p, score, scoreBreakdown: breakdown };
}

export function rankProducts(products: Product[]): ScoredProduct[] {
  return products.map(scoreProduct).sort((a,b) => b.score - a.score);
}
