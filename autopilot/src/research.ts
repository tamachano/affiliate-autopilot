import fs from 'node:fs';
import path from 'node:path';
import type { Product } from './types.js';

export function loadSeedProducts(root: string): Product[] {
  const p = path.join(root, 'data', 'products.seed.json');
  return JSON.parse(fs.readFileSync(p, 'utf8')) as Product[];
}

export function researchProducts(theme: string, products: Product[]): Product[] {
  // 新しい投稿候補を出すため、すでに動画化した商品は標準では除外。
  let pool = products.filter(p => !p.usedBefore);

  // 「学生向け」と明示された時は、genericな「便利グッズ」だけの一致で
  // キッチン商品などが紛れないよう、学生カテゴリを必須条件にする。
  if (theme.includes('学生')) {
    const student = pool.filter(p => p.category.includes('学生'));
    if (student.length >= 3) return student;
  }

  if (theme.includes('勉強')) {
    const study = pool.filter(p => p.category.includes('勉強'));
    if (study.length >= 3) return study;
  }

  if (theme.includes('便利')) {
    const convenience = pool.filter(p => p.category.includes('便利グッズ'));
    if (convenience.length >= 3) return convenience;
  }

  return pool.length >= 3 ? pool : products;
}
