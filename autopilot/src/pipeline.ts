import fs from 'node:fs';
import path from 'node:path';
import { researchProducts, loadSeedProducts } from './research.js';
import { rankProducts } from './scoring.js';
import { generateScript, generateStoryboard, generateYouTubeText, generateTikTokText } from './generate.js';
import { complianceReport } from './compliance.js';
import { createExperiment, getRecentClosedExperiments, openDb, saveRun } from './db.js';
import { buildPlanningPrompt, defaultExperiment, writePlanningPrompt } from './experiment.js';
import { uniqueRunDir, writeJson } from './utils.js';
import { createAssetManifest } from './workflow.js';

export function runAffiliate(root: string, rawTheme: string, options: { productIds?: string[] } = {}) {
  const theme = rawTheme.trim() || '学生向け便利グッズ';
  const all = loadSeedProducts(root);
  const researched = options.productIds ? all.filter(p => options.productIds!.includes(p.id)) : researchProducts(theme, all);
  const ranked = rankProducts(researched);
  const top = options.productIds ? options.productIds.map(id => { const found = rankProducts(all).find(p=>p.id===id); if(!found)throw Error('Unknown product: '+id); return found; }) : ranked.slice(0,3);

  if (![1,3].includes(top.length) || new Set(top.map(p => p.id)).size !== top.length) {
    throw new Error('候補商品が3件未満です。data/products.seed.json に候補を追加してください。');
  }

  const script = generateScript(theme, top);
  const storyboard = generateStoryboard(top);
  const compliance = complianceReport(top);
  const youtubeText = generateYouTubeText(top);
  const tiktokText = generateTikTokText();
  const outputDir = uniqueRunDir(path.join(root, 'output'), theme);
  const createdAt = new Date().toISOString();
  const runId = path.basename(outputDir);
  const experiment = defaultExperiment(runId, theme);

  writeJson(path.join(outputDir, 'research.json'), {
    theme,
    source: 'data/products.seed.json',
    count: researched.length,
    note: 'v1.0 統合。商品候補DBを使用。ライブEC探索・レビュー自動収集は未接続。',
    candidates: researched
  });
  writeJson(path.join(outputDir, 'products.json'), top);
  writeJson(path.join(outputDir, 'scoring.json'), ranked.map((p, i) => ({
    rank: i + 1,
    id: p.id,
    name: p.name,
    score: p.score,
    breakdown: p.scoreBreakdown
  })));
  writeJson(path.join(outputDir, 'storyboard.json'), storyboard);
  createAssetManifest(outputDir, top);
  writeJson(path.join(outputDir, 'compliance.json'), compliance);
  writeJson(path.join(outputDir, 'experiment.json'), experiment);

  fs.writeFileSync(
    path.join(outputDir, 'script.md'),
    `# ${script.title}\n\n${script.lines.map((x, i) => `${i === 0 ? 'HOOK' : i === script.lines.length - 1 ? 'CTA' : `CUT ${i}`}：${x}`).join('\n\n')}\n`,
    'utf8'
  );
  fs.writeFileSync(path.join(outputDir, 'youtube.txt'), youtubeText, 'utf8');
  fs.writeFileSync(path.join(outputDir, 'tiktok.txt'), tiktokText, 'utf8');

  const db = openDb(root);
  saveRun(db, { id: runId, theme, createdAt, outputDir, products: top });
  createExperiment(db, experiment);
  const recentLearnings = getRecentClosedExperiments(db, 5);
  const prompt = buildPlanningPrompt({
    experiment,
    products: top,
    scriptTitle: script.title,
    scriptLines: script.lines,
    complianceBlocked: compliance.publishBlocked,
    complianceSummary: compliance.productChecks.flatMap((x: any) => x.blocking.map((y: string) => `${x.name}: ${y}`)),
    recentLearnings
  });
  const planningPromptPath = writePlanningPrompt(outputDir, prompt);
  db.close();

  fs.writeFileSync(
    path.join(outputDir, 'STATUS.md'),
    `# Run status\n\n- Theme: ${theme}\n- Experiment: ${experiment.id}\n- Hypothesis: ${experiment.hypothesis}\n- Variables: ${experiment.variablesChanged.join(' / ')}\n- Top 3: ${top.map(x => `${x.name} (${x.score})`).join(' / ')}\n- Publish blocked: ${compliance.publishBlocked ? 'YES' : 'NO'}\n- ChatGPT planning prompt: ${path.basename(planningPromptPath)}\n- Supervisor Loop: 接続済み\n- Humanizer: 接続済み\n- Video render: 素材権利・ファイル準備後のみ接続可能（ffmpeg）\n- YouTube Analytics: OAuth設定時に自動取得可能\n`,
    'utf8'
  );

  return {
    runId,
    theme,
    createdAt,
    outputDir,
    topProducts: top,
    scoring: ranked.map((p, i) => ({ rank: i + 1, id: p.id, name: p.name, score: p.score, breakdown: p.scoreBreakdown })),
    script,
    storyboard,
    youtubeText,
    tiktokText,
    compliance,
    experiment,
    planningPrompt: prompt
  };
}
