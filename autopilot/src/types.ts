export type Evidence = {
  type: string;
  url: string;
  note: string;
};

export type Product = {
  id: string;
  name: string;
  maker?: string;
  sku?: string;
  jan?: string;
  asin?: string;
  category: string[];
  priceYen: number;
  problem: string;
  benefit: string;
  demo: string;
  demand: number;
  visualDemo: number;
  problemClarity: number;
  affiliateFit: number;
  priceFit: number;
  claimsVerified: boolean;
  assetPermissionConfirmed: boolean;
  assetRightsStatus?: string;
  assetPlan?: string;
  affiliateUrl: string;
  affiliateUrlVerified?: boolean;
  affiliateLinkType?: string;
  evidence: Evidence[];
  usedBefore?: boolean;
};

export type ScoredProduct = Product & {
  score: number;
  scoreBreakdown: Record<string, number>;
};

export type ExperimentStatus = 'planning' | 'ready' | 'published' | 'review_24h' | 'review_72h' | 'closed';
export type ExperimentJudgement = 'pending' | 'supported' | 'rejected' | 'inconclusive';

export type Experiment = {
  id: string;
  runId: string;
  theme: string;
  createdAt: string;
  updatedAt: string;
  status: ExperimentStatus;
  hypothesis: string;
  variablesChanged: string[];
  primaryMetric: string;
  secondaryMetrics: string[];
  successCriteria: string;
  baselineValue?: number | null;
  targetValue?: number | null;
  judgement: ExperimentJudgement;
  learning?: string;
  nextAction?: string;
  youtubeVideoId?: string | null;
};

export type AnalyticsSnapshot = {
  experimentId: string;
  stage: '24h' | '72h' | 'manual';
  capturedAt: string;
  platform: string;
  views?: number | null;
  engagedViews?: number | null;
  avgViewDurationSec?: number | null;
  stayedToWatchPct?: number | null;
  likes?: number | null;
  subscribersDelta?: number | null;
  clicks?: number | null;
  conversions?: number | null;
  revenueYen?: number | null;
};
