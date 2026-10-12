import type { ScoredProduct } from './types.js';

export function complianceReport(products: ScoredProduct[]) {
  const productChecks = products.map(p => ({
    id: p.id,
    name: p.name,
    sku: p.sku || '',
    affiliateLinkType: p.affiliateLinkType || '',
    assetRightsStatus: p.assetRightsStatus || 'not_checked',
    assetPlan: p.assetPlan || '',
    readyToPublish: p.claimsVerified && p.assetPermissionConfirmed && Boolean(p.affiliateUrl) && Boolean(p.affiliateUrlVerified),
    blocking: [
      ...(!p.claimsVerified ? ['商品仕様・効果の検証が未完了'] : []),
      ...(!p.assetPermissionConfirmed ? [`動画素材が未確保。権利確認結果: ${p.assetRightsStatus || '未確認'}。方針: ${p.assetPlan || '要決定'}`] : []),
      ...(!p.affiliateUrl ? ['アフィリエイトURL未設定'] : []),
      ...(p.affiliateUrl && !p.affiliateUrlVerified ? ['アフィリエイトURLの検証が未完了'] : [])
    ],
    evidence: p.evidence
  }));
  return {
    publishBlocked: productChecks.some(x => !x.readyToPublish),
    productChecks,
    globalChecks: [
      '価格は「掲載時点」等を付け、変動し得ることを前提にする',
      '実際に確認していない性能を追加しない',
      'メーカー/ECの商品画像をダウンロード・転載して動画素材にしない',
      'Amazonの商品画像はスクリーンショットや再アップロードをしない',
      'AI生成映像を実機レビュー映像のように誤認させない',
      'Amazonリンクを使う動画説明欄にはアソシエイト開示文を入れる',
      '公開直前にSNS/ASP/Amazonの現行規約を再確認する'
    ]
  };
}
