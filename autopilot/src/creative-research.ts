import fs from 'node:fs';
import path from 'node:path';

type ProductContext = { name:string; problem:string; benefit:string };
export function buildCreativeResearchContext(root:string, products:ProductContext[]) {
  const filename=path.join(root,'data','creative-research.json');
  if(!fs.existsSync(filename))return null;
  const database=JSON.parse(fs.readFileSync(filename,'utf8'));
  if(!Array.isArray(database.records)||!Array.isArray(database.patterns))throw Error('Invalid creative research database');
  const text=products.map(p=>`${p.name} ${p.problem} ${p.benefit}`).join(' ');
  const ids=/文具|本|ページ|勉強|参考書/.test(text)
    ? ['raues4JGz1U','m-AOngJ11H4','SRs8kLc0214','tpNn1uesavY','6tjoDAY3Nfk']
    : /掃除|ゴミ|クリーナー|ハムスター/.test(text)
      ? ['BSeeAZNtch4','xvgxL7JFxZw','4oiiQJiRMKQ','Y3f-85jSkjM','vZsMuMXhssM']
      : ['O6pFRUxlbbM','qDNqpxcTzl8','BSeeAZNtch4','Y3f-85jSkjM','vZsMuMXhssM'];
  const references=ids.map(id=>database.records.find((r:any)=>r.video_id===id)).filter(Boolean).map((r:any)=>({
    id:r.video_id,url:r.url,title:r.title,observedAt:r.observed_at,views:r.view_count,role:r.role,
    evidenceLevel:'public_title_and_description',contentReview:r.content_review,affiliateStatus:r.affiliate_status
  }));
  const hypotheses=database.patterns.filter((p:any)=>Array.isArray(p.reference_ids)&&p.reference_ids.some((id:string)=>ids.includes(id))).slice(0,5).map((p:any)=>({id:p.id,name:p.name,adoptAs:'test_hypothesis_only',basis:p.observed_basis,hypothesis:p.hypothesis,referenceIds:p.reference_ids,limits:p.limits}));
  return {databaseVersion:database.meta?.version||'unknown',references,hypotheses,
    notAdopted:['本編未確認の字幕・集中線・声質・場面転換を観察済み成功要因として採用しない','人気動画の購入体験・口コミを自分の実使用として語らない','ランキングを単品へ無理に適用しない'],
    decision:'企画候補の根拠を提示する補助情報。効果は未実証。台詞・素材・公開承認を自動確定しない。',
    measurements:['Stayed to watch とshown_in_feed','engaged views','平均視聴時間','商品カードの閲覧と外部購入リンククリック','帰属を確認できたASP注文'],
    guards:['変更変数は1つを基本とする','素材権利・正確な型番・広告表記を別確認','未取得データはnull。再生数から売上を推定しない']};
}

export function creativeResearchMarkdown(context:ReturnType<typeof buildCreativeResearchContext>) {
  if(!context)return '';
  return ['# 次回制作の参照と根拠','',context.decision,'',
    '## 関連候補と比較対象',...context.references.map(r=>`- ${r.title}\n  ${r.url}\n  取得：${r.observedAt}／${r.views}再生／${r.role}\n  根拠：${r.evidenceLevel}。本編確認：${JSON.stringify(r.contentReview)}`),'',
    '## 採用候補（未実証の検証仮説）',...context.hypotheses.map((p:any)=>`- ${p.id} ${p.name}\n  観察根拠：${p.basis}\n  仮説：${p.hypothesis}\n  参照：${p.referenceIds.join(', ')}\n  制約：${p.limits}`),'',
    '## 採用しないもの',...context.notAdopted.map(x=>'- '+x),'',
    '## 測定',...context.measurements.map(x=>'- '+x),'',
    '## 公開前のガード',...context.guards.map(x=>'- '+x),''].join('\n');
}
