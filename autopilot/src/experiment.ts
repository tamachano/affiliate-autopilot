import fs from 'node:fs';
import path from 'node:path';
import type { AnalyticsSnapshot, Experiment, ExperimentJudgement, ScoredProduct } from './types.js';

export type ExperimentMode = 'exploratory' | 'controlled';

export function getExperimentMode(experiment: Experiment): ExperimentMode {
  // Two simultaneous changes or no baseline means we can explore, but should not claim causality.
  return experiment.variablesChanged.length > 1 || experiment.baselineValue == null ? 'exploratory' : 'controlled';
}

export function defaultSuccessCriteria(baselineValue: number | null | undefined, variablesChanged: string[]): string {
  if (baselineValue == null || variablesChanged.length > 1) {
    return '探索実験: 初回コンバージョンが発生したら導線成立。未発生の場合は300再生未満では結論を出さず、視聴指標を次の統制実験のベースライン候補として保存する';
  }
  return '主要指標がベースラインより20%以上改善、または初回コンバージョンが発生';
}

export function defaultExperiment(runId: string, theme: string): Experiment {
  const now = new Date().toISOString();
  const studentLike = /学生|勉強|受験|学校/.test(theme);
  const variablesChanged = studentLike ? ['target=student', 'hook=共感型'] : ['product_set=3選', 'hook=問題解決型'];
  return {
    id: `exp-${runId}`,
    runId,
    theme,
    createdAt: now,
    updatedAt: now,
    status: 'planning',
    hypothesis: studentLike
      ? '学生向けの低単価・問題解決型グッズは、一般的な便利グッズより反応を高める'
      : '低単価・問題解決型の商品を3つ提示すると、視聴者ごとに刺さる商品が増え反応を高められる',
    variablesChanged,
    // Shorts description/comment URLs are not assumed to be clickable. Start with an on-platform metric.
    primaryMetric: 'stayed_to_watch_pct',
    secondaryMetrics: ['avg_view_duration_sec', 'affiliate_clicks', 'conversions'],
    successCriteria: defaultSuccessCriteria(null, variablesChanged),
    baselineValue: null,
    targetValue: null,
    judgement: 'pending',
    learning: '',
    nextAction: ''
  };
}

export function buildPlanningPrompt(args: {
  experiment: Experiment;
  products: ScoredProduct[];
  scriptTitle: string;
  scriptLines: string[];
  complianceBlocked: boolean;
  complianceSummary: string[];
  recentLearnings: Experiment[];
}) {
  const { experiment, products, scriptTitle, scriptLines, complianceBlocked, complianceSummary, recentLearnings } = args;
  const mode = getExperimentMode(experiment);
  const warnings: string[] = [];
  if (experiment.baselineValue == null) warnings.push('ベースライン未設定のため、20%改善などの相対勝敗は判定しない');
  if (experiment.variablesChanged.length > 1) warnings.push('変更変数が2つあるため探索実験。結果が良くても、どちらの変数が効いたかは断定しない');
  if (experiment.primaryMetric === 'affiliate_clicks') warnings.push('affiliate_clicksを主要指標にする場合、実際にクリック可能な導線が存在することを公開前に確認する');
  if (experiment.secondaryMetrics.includes('affiliate_clicks') || experiment.primaryMetric === 'affiliate_clicks') warnings.push('YouTube Shortsの説明欄URLはクリック導線として扱わず、プロフィール等のクリック可能な外部導線を別途確認する');

  return `# Affiliate AutoPilot 企画レビュー依頼

あなたはこの運用の最終レビュー担当です。表面的な感想ではなく、プロの動画編集・マーケティング・法務/コンプライアンス・実験設計の観点を統合して判断してください。

## 今回の実験
- Experiment ID: ${experiment.id}
- テーマ: ${experiment.theme}
- 実験モード: ${mode === 'exploratory' ? '探索実験（因果を断定しない）' : '統制実験'}
- 仮説: ${experiment.hypothesis}
- 変更変数: ${experiment.variablesChanged.join(' / ') || '未設定'}
- 主要指標: ${experiment.primaryMetric}
- 副次指標: ${experiment.secondaryMetrics.join(' / ')}
- 成功条件: ${experiment.successCriteria}
- ベースライン: ${experiment.baselineValue ?? '未設定'}
- 目標値: ${experiment.targetValue ?? '未設定'}
- YouTube Video ID: ${experiment.youtubeVideoId || '未紐付け'}

## Experiment Managerの自動注意
${warnings.length ? warnings.map(x => `- ${x}`).join('\n') : '- 特記事項なし'}

## 選定商品
${products.map((p, i) => `${i + 1}. ${p.name}\n   - score: ${p.score}\n   - price: ¥${p.priceYen}\n   - problem: ${p.problem}\n   - benefit: ${p.benefit}\n   - SKU: ${p.sku || '未確認'}\n   - ASIN: ${p.asin || '未確認'}\n   - affiliate: ${p.affiliateUrl || '未設定'}\n   - asset rights: ${p.assetRightsStatus || '未確認'}`).join('\n')}

## 予定動画
- タイトル/フック: ${scriptTitle}
${scriptLines.map((line, i) => `- ${i === 0 ? 'HOOK' : i === scriptLines.length - 1 ? 'CTA' : `CUT ${i}`}: ${line}`).join('\n')}

## 公開前チェック
- Publish blocked: ${complianceBlocked ? 'YES' : 'NO'}
${complianceSummary.map(x => `- ${x}`).join('\n')}

## 過去の学習
${recentLearnings.length ? recentLearnings.map(x => `- ${x.theme}: ${x.judgement} / ${x.learning || '学習未記入'} / 次: ${x.nextAction || '未設定'}`).join('\n') : '- まだ確定した学習なし'}

## 必ず確認してほしいこと
1. 仮説は検証可能な形になっているか
2. この実験モードで断定してよい範囲を超えていないか
3. 商品選定は「最初の1成果」に近いか
4. フック・構成・CTAに改善余地はあるか
5. 権利・商品仕様・アフィリエイト表記に危険がないか
6. affiliate_clicksを評価する場合、クリック可能な導線が実在するか
7. 今回の結果から次の実験へ繋がる設計になっているか
8. サンプル不足で誤学習しそうな点はないか

最後に必ず以下の形式で返してください。
- 判定: GO / 修正してGO / STOP
- 修正点: 最大3つ
- 今回絶対に変えない項目
- 投稿後24hで見る指標
- 投稿後72hで見る指標
`;
}

export function writePlanningPrompt(outputDir: string, prompt: string) {
  const target = path.join(outputDir, 'chatgpt-planning-review.md');
  fs.writeFileSync(target, prompt, 'utf8');
  return target;
}

export function judgeExperiment(experiment: Experiment, snapshots: AnalyticsSnapshot[]): {
  judgement: ExperimentJudgement;
  learning: string;
  nextAction: string;
  reason: string;
} {
  if (!snapshots.length) {
    return {
      judgement: 'inconclusive',
      learning: '分析できる投稿後データがまだありません。',
      nextAction: '24時間後または72時間後のデータを追加する。',
      reason: 'analytics_missing'
    };
  }

  const newestValue = <K extends keyof AnalyticsSnapshot>(key: K): AnalyticsSnapshot[K] | null => {
    for (let i = snapshots.length - 1; i >= 0; i--) {
      const value = snapshots[i][key];
      if (value !== null && value !== undefined) return value;
    }
    return null;
  };

  const views = Number(newestValue('views') ?? 0);
  const clicks = Number(newestValue('clicks') ?? 0);
  const conversions = Number(newestValue('conversions') ?? 0);
  const stayed = newestValue('stayedToWatchPct');
  const avd = newestValue('avgViewDurationSec');
  const mode = getExperimentMode(experiment);

  if (conversions > 0) {
    return {
      judgement: 'supported',
      learning: mode === 'exploratory'
        ? `コンバージョンが${conversions}件発生し、少なくとも導線成立は確認できた。ただし探索実験のため、どの変更変数が効いたかは断定しない。`
        : `コンバージョンが${conversions}件発生。少なくとも「動画→導線→成果」は成立した。`,
      nextAction: mode === 'exploratory'
        ? '次は勝ち候補を1つ固定し、変更変数を1つだけにした統制実験で再現性を確認する。'
        : '今回の勝ち要素を固定し、別の1変数だけを変更して再現性を確認する。',
      reason: mode === 'exploratory' ? 'conversion_detected_exploratory' : 'conversion_detected'
    };
  }

  if (views < 300) {
    return {
      judgement: 'inconclusive',
      learning: `最新スナップショットは${views}再生。サンプル不足なので商品の良し悪しや変更変数の効果は断定しない。`,
      nextAction: '同一仮説のサンプルを増やす。300再生未満の段階では勝敗を確定しない。',
      reason: 'small_sample'
    };
  }

  if (mode === 'exploratory') {
    const observed = [
      stayed != null ? `Stayed to Watch ${Number(stayed).toFixed(1)}%` : null,
      avd != null ? `平均視聴 ${Number(avd).toFixed(1)}秒` : null,
      clicks ? `affiliate clicks ${clicks}` : null
    ].filter(Boolean).join(' / ');
    return {
      judgement: 'inconclusive',
      learning: `探索実験のため因果判定は保留。${observed ? `観測値: ${observed}。` : ''}この数値を次の統制実験のベースライン候補として保存する。`,
      nextAction: '変更変数を1つに絞り、今回の観測値をベースラインに設定して次の実験を作る。',
      reason: 'exploratory_no_causal_judgement'
    };
  }

  const metric = experiment.primaryMetric;
  let metricValue: number | null = null;
  let metricLabel = metric;
  if (metric === 'stayed_to_watch_pct') { metricValue = stayed == null ? null : Number(stayed); metricLabel = 'Stayed to Watch'; }
  else if (metric === 'avg_view_duration_sec') { metricValue = avd == null ? null : Number(avd); metricLabel = '平均視聴時間'; }
  else if (metric === 'affiliate_clicks') { metricValue = clicks; metricLabel = 'Affiliate clicks'; }

  if (experiment.baselineValue != null && metricValue != null) {
    const threshold = experiment.targetValue ?? experiment.baselineValue * 1.2;
    if (metricValue >= threshold) {
      return {
        judgement: 'supported',
        learning: `${metricLabel} ${metricValue.toFixed(2)} が目標 ${threshold.toFixed(2)} を上回った。`,
        nextAction: '今回の変更要素を固定し、別の1変数だけを変えて再現性を確認する。',
        reason: 'target_beaten'
      };
    }
    if (metricValue < experiment.baselineValue) {
      return {
        judgement: 'rejected',
        learning: `${metricLabel} ${metricValue.toFixed(2)} がベースライン ${experiment.baselineValue.toFixed(2)} を下回った。`,
        nextAction: '今回変えた変数を元に戻すか、別の1変数だけをテストする。',
        reason: 'below_baseline'
      };
    }
  }

  return {
    judgement: 'inconclusive',
    learning: '統制実験だが、主要指標に明確な勝ち負けを判断できる差がまだ出ていない。',
    nextAction: '72時間データを待つか、同条件でサンプルを増やす。',
    reason: 'no_clear_signal'
  };
}
