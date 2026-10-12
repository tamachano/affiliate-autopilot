import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAffiliate } from './pipeline.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const theme = process.argv.slice(2).join(' ').trim() || '学生向け便利グッズ';
const result = runAffiliate(root, theme);

console.log(`Affiliate AutoPilot v0.5 complete\nTheme: ${result.theme}\nOutput: ${result.outputDir}\n`);
result.topProducts.forEach((p, i) => console.log(`${i + 1}. ${p.name} — ${p.score}`));
console.log(`Publish blocked by compliance gate: ${result.compliance.publishBlocked ? 'YES' : 'NO'}`);
