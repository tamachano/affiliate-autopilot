import fs from 'node:fs';
import path from 'node:path';
import type { Experiment, AnalyticsSnapshot, ScoredProduct } from './types.js';
import { complianceReport } from './compliance.js';
import { judgeExperiment } from './experiment.js';

export function reviewInsights(notes: string[]) {
  // User-supplied notes only: never claim scraped or verified customer reviews.
  const safe = notes.map(x => x.trim()).filter(x => x && x.length < 600).slice(0, 30);
  const themes = [
    { key:'開いたまま', words:/閉じる|開いたまま|ページ|参考書|本を押さ/, hook:'参考書、開いたままにしたくない？' },
    { key:'机のスペース', words:/机|スペース|狭い|収納|散らか/, hook:'机の上、もう少し広く使いたい。' },
    { key:'時間管理', words:/時間|集中|勉強時間|スマホ|タイマー/, hook:'勉強中、スマホで時間を見ない工夫。' },
    { key:'持ち運び', words:/持ち運|軽い|小さい|コンパクト|かさば/, hook:'カバンの中でかさばらないの、助かる。' },
    { key:'手軽さ', words:/簡単|手軽|すぐ|ワンタッチ|片手/, hook:'準備が面倒じゃないのがいい。' }
  ];
  const results = themes.map(t=>({ theme:t.key, matchedNotes:safe.filter(x=>t.words.test(x)).length, hook:t.hook })).filter(t=>t.matchedNotes>0).sort((a,b)=>b.matchedNotes-a.matchedNotes);
  return { inputCount:safe.length, source:'user_supplied_notes', themes:results, hooks:results.map(x=>x.hook), warning:'傾向は入力メモに依存。実在レビューの取得・権利許諾・商品効能の検証を代替しません。' };
}

export function createAssetManifest(runDir:string, products:ScoredProduct[]) {
  const mediaDir = path.join(runDir,'media');
  fs.mkdirSync(mediaDir,{recursive:true});
  const manifest = {
    schemaVersion:1,
    expectedProductIds:products.map(p=>p.id),
    instruction:'自分で撮影した素材、または動画広告での利用許諾を証明できる素材のみ media/ に置いてください。商品写真を無断取得しないこと。',
    entries: products.map((p,i)=>({ productId:p.id,productName:p.name,cut:i+1,relativeFile:`media/cut-${i+1}.mp4`,rights:'unverified',evidenceUrl:'',allowCommercialVideo:false,allowAffiliateAdvertising:false }))
  };
  fs.writeFileSync(path.join(runDir,'asset-manifest.json'),JSON.stringify(manifest,null,2),'utf8');
  return manifest;
}

export function inspectAssetManifest(runDir:string) {
  const manifestPath = path.join(runDir,'asset-manifest.json');
  if (!fs.existsSync(manifestPath)) return {ready:false,problems:['asset-manifest.json がありません'],entries:[]};
  const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  const problems:string[]=[];
  const entries=Array.isArray(manifest.entries)?manifest.entries:[];
  const snapshot=path.join(runDir,'products.json');
  const expected=fs.existsSync(snapshot)?JSON.parse(fs.readFileSync(snapshot,'utf8')).map((p:any)=>p.id):manifest.expectedProductIds;
  if(!Array.isArray(expected)||![1,3].includes(expected.length)||entries.length!==expected.length)problems.push('企画の商品数と素材数が一致しません');
  const seen=new Set();
  for(const e of entries) {
    if(!expected?.includes(e.productId)||seen.has(e.productId))problems.push('素材の商品IDが企画と一致しません');
    seen.add(e.productId);
    if(typeof e.relativeFile!=='string'||!/^media\/[a-zA-Z0-9_.-]+\.(mp4|mov|mkv)$/.test(e.relativeFile)){problems.push('不正な素材パス');continue;}
    const full=path.resolve(runDir,e.relativeFile);
    if(!fs.existsSync(full))problems.push(e.productName+': 映像ファイルなし');
    else if(!fs.realpathSync(full).startsWith(fs.realpathSync(path.join(runDir,'media'))+path.sep))problems.push('素材パスがmedia外です');
    let evidenceValid=false;
    try{const u=new URL(e.evidenceUrl);evidenceValid=u.protocol==='https:'&&!u.username&&!u.password;}catch{}
    if(e.rights!=='verified'||e.allowCommercialVideo!==true||e.allowAffiliateAdvertising!==true||!evidenceValid)problems.push(e.productName+': 広告利用権の証拠が不足');
  }
  return {ready:problems.length===0, problems, entries};
}

export function pdcaNext(experiment:Experiment, snapshots:AnalyticsSnapshot[]) {
  const judged=judgeExperiment(experiment,snapshots);
  const recent=[...snapshots].reverse()[0];
  let next={variable:'hook', hypothesis:'冒頭1.5秒の共感表現だけを変えると視聴継続率は変わるか', metric:'stayed_to_watch_pct', reason:'まず一変数で比較する'};
  if (recent?.conversions && recent.conversions>0) next={variable:'product',hypothesis:'売上が発生した商品カテゴリを固定して訴求だけ変えて再現できるか',metric:'conversions',reason:'CVは導線成立の兆候。ただし原因を断定しない'};
  else if (recent?.stayedToWatchPct!=null && recent.stayedToWatchPct<20) next={variable:'hook',hypothesis:'最初の1秒で用途を見せればスワイプ率が下がるか',metric:'stayed_to_watch_pct',reason:'初動離脱が課題の可能性。ベースラインと比較して検証'};
  return {judgement:judged, proposedNext:next, sampledViews:recent?.views??null, uncertainty:(recent?.views??0)<300?'サンプルが少ないため仮説の勝敗は未確定':'相関から因果は断定できません'};
}
