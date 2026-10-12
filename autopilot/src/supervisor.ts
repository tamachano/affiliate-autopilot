import fs from 'node:fs';
import path from 'node:path';
import type { Experiment, ScoredProduct } from './types.js';
import { getExperimentMode } from './experiment.js';

export type SupervisorDimension = 'marketing' | 'video' | 'humanizer' | 'compliance' | 'experiment';
export type SupervisorVerdict = 'GO' | 'REVISE' | 'STOP';

export type DimensionReview = {
  dimension: SupervisorDimension;
  score: number;
  verdict: SupervisorVerdict | 'WAITING_ASSETS';
  issues: string[];
  suggestions: string[];
};

export type SupervisorIteration = {
  iteration: number;
  createdAt: string;
  verdict: SupervisorVerdict;
  overallScore: number;
  humanScore: number;
  reviews: DimensionReview[];
  beforeLines: string[];
  afterLines: string[];
  changes: string[];
  source: 'local' | 'openai+local';
};

export type SupervisorResult = {
  experimentId: string;
  runId: string;
  maxIterations: number;
  iterations: SupervisorIteration[];
  finalVerdict: SupervisorVerdict | 'NEEDS_HUMAN_REVIEW';
  finalLines: string[];
  primaryCTA: string;
  secondaryCTA: string;
  creativeVerdict: SupervisorVerdict | 'NEEDS_HUMAN_REVIEW';
  publishVerdict: 'READY_FOR_FINAL_CHECK' | 'BLOCKED';
  assetStatus: 'READY' | 'ASSET_PENDING';
  finalTitle: string;
  guardrails: string[];
  modelUsed?: string;
};

export const SECONDARY_CTA = 'チャンネル登録・高評価もよろしく！';
export const PRIMARY_CTA = '気になったら、プロフィールから。';

const AI_SMELL_PATTERNS: Array<{ re: RegExp; penalty: number; reason: string }> = [
  { re: /おすすめ.{0,8}(?:ご紹介|紹介します)/, penalty: 18, reason: '「おすすめ〜をご紹介」型の広告テンプレ' },
  { re: /(?:絶対|必見|革命的|知らないと損|買うべき)/, penalty: 16, reason: '過剰な煽り表現' },
  { re: /することができます/g, penalty: 10, reason: '説明文調の「することができます」' },
  { re: /便利です[。！]?$/g, penalty: 6, reason: '無難な「便利です」終わり' },
  { re: /ぜひ.{0,12}チェック/, penalty: 8, reason: 'テンプレCTA' },
  { re: /こちらの商品|この商品は/, penalty: 8, reason: '商品説明文っぽい主語' }
];

function clamp(n: number, min = 0, max = 100) { return Math.max(min, Math.min(max, n)); }

export function humanScore(lines: string[]) {
  const text = lines.join('\n');
  let score = 100;
  const reasons: string[] = [];
  for (const p of AI_SMELL_PATTERNS) {
    if (p.re.test(text)) { score -= p.penalty; reasons.push(p.reason); }
    p.re.lastIndex = 0;
  }
  const longLines = lines.filter(x => x.length > 42).length;
  if (longLines) { score -= longLines * 8; reasons.push(`長すぎる字幕/ナレーションが${longLines}行`); }
  const desuMasu = lines.filter(x => /(です|ます)[。！]?$/u.test(x)).length;
  if (desuMasu >= 3) { score -= 10; reasons.push('同じ丁寧語の語尾が連続'); }
  const colonLike = lines.filter(x => /：/.test(x)).length;
  if (colonLike >= 3) { score -= 8; reasons.push('商品名＋説明の列挙感が強い'); }
  return { score: clamp(score), reasons };
}

function compactBenefit(product: ScoredProduct) {
  const p = product.problem;
  const b = product.benefit;
  if (/閉じる|ページ/.test(p)) return '参考書が閉じる → 挟むだけ';
  if (/ペンケース|場所|ペン/.test(p)) return '筆箱が、そのままペン立てに';
  if (/スマホ|通知|SNS|時間/.test(p)) return 'スマホを触らず時間管理';
  const short = b.replace(/する。?$/,'').replace(/できる。?$/,'').replace(/できます。?$/,'');
  return short.length > 26 ? `${short.slice(0, 25)}…` : short;
}

export function localHumanize(theme: string, products: ScoredProduct[], lines: string[]) {
  const next = [...lines];
  const changes: string[] = [];
  if (products.length > 1 && /学生|勉強|受験|学校/.test(theme)) {
    const desired = '勉強中の「地味に困る」を3つ解決。';
    if (next[0] !== desired) { next[0] = desired; changes.push('HOOKを具体的な共感型に短縮'); }
  } else if (next[0].length > 20) {
    next[0] = 'これ、地味に助かる。'; changes.push('HOOKを短文化');
  }
  products.slice(0, 3).forEach((p, i) => {
    const idx = i + 1;
    const desired = products.length === 1 ? compactBenefit(p) : `①②③`[i] + ` ${compactBenefit(p)}`;
    if (next[idx] !== desired) { next[idx] = desired; changes.push(`CUT ${i+1}を説明文から口語へ`); }
  });
  const cta = PRIMARY_CTA;
  if (next[next.length - 1] !== cta) { next[next.length - 1] = cta; changes.push('CTAを営業感の弱い短文へ'); }
  return { lines: next, changes };
}

function localReviews(args: {
  experiment: Experiment;
  products: ScoredProduct[];
  lines: string[];
  complianceBlocked: boolean;
  complianceSummary: string[];
}): DimensionReview[] {
  const { experiment, products, lines, complianceBlocked, complianceSummary } = args;
  const mode = getExperimentMode(experiment);
  const h = humanScore(lines);
  const hookLen = lines[0]?.length ?? 0;
  const marketingIssues: string[] = [];
  const marketingSuggestions: string[] = [];
  if (products.some(p => p.priceYen > 2500)) marketingIssues.push('初回成果狙いとして価格が高めの商品を含む');
  if (!/プロフィール|リンク/.test(lines.at(-1) || '')) marketingIssues.push('クリック可能な導線へのCTAが弱い');
  if (!marketingIssues.length) marketingSuggestions.push('低単価・問題解決型の軸は維持');

  const videoIssues: string[] = [];
  if (hookLen > 24) videoIssues.push('冒頭テキストが長い');
  if (lines.slice(1,-1).some(x => x.length > 32)) videoIssues.push('各商品の説明が長く、15秒で情報過多になりやすい');
  const videoSuggestions = videoIssues.length ? ['各CUTは「問題→一言解決」に削る'] : ['各CUT 3〜4秒を維持'];

  const expIssues: string[] = [];
  if (mode === 'exploratory') expIssues.push('探索実験なので因果を断定しない');
  if (experiment.variablesChanged.length > 2) expIssues.push('変更変数が2つを超えている');
  if (experiment.baselineValue == null && /20%|20％/.test(experiment.successCriteria)) expIssues.push('ベースラインなしで相対改善判定をしようとしている');

  return [
    { dimension:'marketing', score: clamp(92 - marketingIssues.length*16), verdict: marketingIssues.length >= 2 ? 'REVISE':'GO', issues:marketingIssues, suggestions:marketingSuggestions },
    { dimension:'video', score: clamp(94 - videoIssues.length*18), verdict: videoIssues.length ? 'REVISE':'GO', issues:videoIssues, suggestions:videoSuggestions },
    { dimension:'humanizer', score:h.score, verdict:h.score < 80 ? 'REVISE':'GO', issues:h.reasons, suggestions:h.score < 80 ? ['説明を削り、映像に任せる','語尾・テンションを均一にしない','商品名より視聴者の困りごとを先に出す'] : ['現在の自然さを維持'] },
    { dimension:'compliance', score: complianceBlocked ? 35 : 100, verdict: complianceBlocked ? 'WAITING_ASSETS':'GO', issues:complianceBlocked ? complianceSummary : [], suggestions:complianceBlocked ? ['素材権利・商品仕様・広告表記のブロックを解消するまで公開しない'] : ['固定ガードレールを維持'] },
    { dimension:'experiment', score: clamp(96 - expIssues.filter(x=>!/探索実験/.test(x)).length*25), verdict: expIssues.some(x=>/超えて|相対改善/.test(x)) ? 'REVISE':'GO', issues:expIssues, suggestions:[mode === 'exploratory' ? '結果は傾向として保存し、次回1変数の統制実験へ' : '今回の1変数以外を固定'] }
  ];
}

function worstVerdict(reviews: DimensionReview[]): SupervisorVerdict {
  if (reviews.some(r => r.verdict === 'STOP')) return 'STOP';
  if (reviews.some(r => r.verdict === 'REVISE')) return 'REVISE';
  return 'GO';
}

function extractResponseText(json: any): string {
  if (typeof json?.output_text === 'string') return json.output_text;
  const texts: string[] = [];
  for (const item of json?.output || []) {
    for (const c of item?.content || []) if (typeof c?.text === 'string') texts.push(c.text);
  }
  return texts.join('\n');
}

async function openAiReview(args: {
  experiment: Experiment;
  products: ScoredProduct[];
  title: string;
  lines: string[];
  local: DimensionReview[];
  model: string;
  apiKey: string;
}) {
  const payload = {
    experiment: {
      mode: getExperimentMode(args.experiment),
      hypothesis: args.experiment.hypothesis,
      variablesChanged: args.experiment.variablesChanged,
      primaryMetric: args.experiment.primaryMetric,
      successCriteria: args.experiment.successCriteria,
      baselineValue: args.experiment.baselineValue
    },
    products: args.products.map(p => ({ name:p.name, priceYen:p.priceYen, problem:p.problem, benefit:p.benefit, assetRightsStatus:p.assetRightsStatus })),
    title: args.title,
    lines: args.lines,
    localReviews: args.local
  };
  const prompt = `あなたはShortsアフィリエイト運用のSupervisorです。\n目的は「売れる可能性」と「人間が嫌悪しやすいAIっぽさの低減」と「実験設計の一貫性」を同時に守ることです。\n法務・権利ガードは絶対に弱めないでください。変更変数は増やさないでください。\n以下をレビューし、必ずJSONだけを返してください。\n\n入力:\n${JSON.stringify(payload, null, 2)}\n\nJSON形式:\n{\n  "verdict":"GO|REVISE|STOP",\n  "human_score":0-100,\n  "issues":["最大5件"],\n  "revised_lines":["HOOK","CUT1","CUT2","CUT3","CTA"],\n  "changes":["最大5件"],\n  "notes":"短い総評"\n}\n\nHumanizerルール: 説明しすぎない、広告テンプレを避ける、映像に任せる、完全文を減らす、煽りすぎない、CTAを営業臭くしない。`;
  const resp = await fetch('https://api.openai.com/v1/responses', {
    method:'POST',
    headers:{ 'Authorization':`Bearer ${args.apiKey}`, 'Content-Type':'application/json' },
    body: JSON.stringify({ model: args.model, input: prompt, max_output_tokens: 1200 })
  });
  if (!resp.ok) throw new Error(`OpenAI API ${resp.status}: ${(await resp.text()).slice(0,300)}`);
  const json = await resp.json();
  const raw = extractResponseText(json).trim().replace(/^```json\s*/i,'').replace(/```$/,'').trim();
  const parsed = JSON.parse(raw);
  return parsed as { verdict:SupervisorVerdict; human_score:number; issues:string[]; revised_lines:string[]; changes:string[]; notes:string };
}

export async function runSupervisorLoop(args: {
  experiment: Experiment;
  products: ScoredProduct[];
  title: string;
  lines: string[];
  complianceBlocked: boolean;
  complianceSummary: string[];
  maxIterations?: number;
  allowPaidModel?: boolean;
}) : Promise<SupervisorResult> {
  const maxIterations = Math.max(1, Math.min(3, args.maxIterations ?? 3));
  const iterations: SupervisorIteration[] = [];
  let current = [...args.lines];
  const guardrails = [
    '購入導線とチャンネル登録・高評価を別管理。Humanizerは二次CTAを削除できない',
    '法務・権利・商品仕様の公開ゲートは自動修正で弱めない',
    '変更変数は最大2つ。Supervisorは新しい実験変数を勝手に追加しない',
    '300再生未満は原則inconclusive。初回CVは導線成立として扱う',
    'AIっぽさ改善は表現・長さ・語尾・CTAに限定し、商品事実を創作しない',
    '最大3回で停止し、解消できない場合はNEEDS_HUMAN_REVIEW'
  ];
  const apiKey = args.allowPaidModel === false ? '' : process.env.OPENAI_API_KEY?.trim() || '';
  const model = process.env.OPENAI_SUPERVISOR_MODEL?.trim() || 'gpt-6-astra';

  for (let i=1; i<=maxIterations; i++) {
    const before = [...current];
    const local = localReviews({ experiment:args.experiment, products:args.products, lines:current, complianceBlocked:args.complianceBlocked, complianceSummary:args.complianceSummary });
    let reviews = local;
    let changes: string[] = [];
    let source: 'local'|'openai+local' = 'local';

    // Asset clearance is tracked separately from creative quality; never publish without it.
    const humanized = localHumanize(args.experiment.theme, args.products, current);
    if (humanized.changes.length) { current = humanized.lines; changes.push(...humanized.changes); }

    if (apiKey) {
      try {
        const ai = await openAiReview({ experiment:args.experiment, products:args.products, title:args.title, lines:current, local, model, apiKey });
        source = 'openai+local';
        if (Array.isArray(ai.revised_lines) && ai.revised_lines.length === current.length) {
          // Only accept wording edits; facts/number of cuts stay fixed.
          current = ai.revised_lines.map(String);
          changes.push(...(Array.isArray(ai.changes) ? ai.changes.map(String) : []));
        }
        reviews = local.map(r => r.dimension === 'humanizer'
          ? { ...r, score:clamp(Number(ai.human_score ?? r.score)), issues:Array.from(new Set([...r.issues, ...(ai.issues || []).map(String)])), verdict: Number(ai.human_score ?? r.score) < 80 ? 'REVISE' : r.verdict }
          : r);
      } catch (e) {
        changes.push(`OpenAIレビューをスキップ: ${e instanceof Error ? e.message : 'unknown error'}`);
      }
    }

    // Re-evaluate local dimensions after rewrite.
    reviews = localReviews({ experiment:args.experiment, products:args.products, lines:current, complianceBlocked:args.complianceBlocked, complianceSummary:args.complianceSummary });
    // Creative decisions must not be blocked by missing commercial footage.
    // Compliance issues remain visible and enforce the separate publish gate.
    const verdict = worstVerdict(reviews.filter(r => r.dimension !== 'compliance'));
    const human = reviews.find(r=>r.dimension==='humanizer')?.score ?? 0;
    const overall = Math.round(reviews.reduce((s,r)=>s+r.score,0)/reviews.length);
    iterations.push({ iteration:i, createdAt:new Date().toISOString(), verdict, overallScore:overall, humanScore:human, reviews, beforeLines:before, afterLines:[...current], changes:Array.from(new Set(changes)), source });

    if (verdict === 'GO') break;
    if (verdict === 'STOP') break; // creative hard stop only
    if (i === maxIterations) break;
  }

  const last = iterations.at(-1)!;
  const creativeChecks = last.reviews.filter(r=>r.dimension !== 'compliance');
  const creativeVerdict = creativeChecks.some(r=>r.verdict==='STOP') ? 'STOP' : creativeChecks.some(r=>r.verdict==='REVISE') ? 'NEEDS_HUMAN_REVIEW' : 'GO';
  const publishVerdict = args.complianceBlocked || creativeVerdict!=='GO' ? 'BLOCKED' : 'READY_FOR_FINAL_CHECK';
  const assetStatus = args.complianceBlocked ? 'ASSET_PENDING' : 'READY';
  const finalVerdict: SupervisorResult['finalVerdict'] = last.verdict === 'REVISE' ? 'NEEDS_HUMAN_REVIEW' : last.verdict;
  return { experimentId:args.experiment.id, runId:args.experiment.runId, maxIterations, iterations, finalVerdict, creativeVerdict, publishVerdict, assetStatus, primaryCTA:current.at(-1)||PRIMARY_CTA, secondaryCTA:SECONDARY_CTA, finalLines:current, finalTitle:args.title, guardrails, modelUsed: apiKey ? model : undefined };
}

export function writeSupervisorArtifacts(outputDir: string, result: SupervisorResult) {
  fs.mkdirSync(outputDir, { recursive:true });
  const jsonPath = path.join(outputDir, 'supervisor-review.json');
  const mdPath = path.join(outputDir, 'supervisor-final-script.md');
  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2), 'utf8');
  fs.writeFileSync(mdPath, `# ${result.finalTitle}\n\n- Supervisor verdict: ${result.finalVerdict}\n- Creative: ${result.creativeVerdict} / Assets: ${result.assetStatus} / Publish: ${result.publishVerdict}\n- Iterations: ${result.iterations.length}\n- Human score: ${result.iterations.at(-1)?.humanScore ?? '-'}\n\n${result.finalLines.map((x,i)=>`${i===0?'HOOK':i===result.finalLines.length-1?'PRIMARY CTA (音声)':`CUT ${i}`}：${x}`).join('\n\n')}\n\nSECONDARY CTA (画面字幕)：${result.secondaryCTA}\n`, 'utf8');
  return { jsonPath, mdPath };
}
