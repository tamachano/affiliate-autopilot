import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const slug='sonic-kadono-omoclip';
const data=JSON.parse(fs.readFileSync(path.join(root,'data','review-briefs',slug+'.json'),'utf8'));
const outDir=path.join(root,'output','review-briefs');fs.mkdirSync(outDir,{recursive:true});
const text=[`# 3本目企画：${data.product_name}`,``, `状態：${data.compliance.status}（未確認事項があるため自動投稿・商品一覧への自動追加は禁止）`,``, `## 根拠付きレビュー傾向`,...data.customer_insights.map((x,i)=>`${i+1}. ${x.insight}\n   出典：${x.support.join(' / ')}`),``, `## 15秒用ナレーション`,``,data.video.narration,``,`## 画面内注記`,``,data.video.on_screen_disclaimer || '（なし）',``,`## シーン構成`,...data.video.scenes.map(s=>`- ${s.start}–${s.end}秒：${s.caption}／${s.visual}`),``,`## 動画概要欄`,``,data.video.description,``,`## Supervisor確認`,``,...data.compliance.reasons.map(x=>`- 未解決：${x}`),``,`メーカー価格：${data.official_price_yen}円（Amazon価格ではない）`,`公式：https://www.sonic-s.co.jp/product/sp-1667`,`\n※レビューは手動で調べた少数の例。件数・購入率・効果を推定しない。`].join('\n');
const filename=path.join(outDir,slug+'.md');fs.writeFileSync(filename,text,'utf8');
console.log(`Review brief saved: ${filename}\nReview-based draft only. Status: ${data.compliance.status}. No upload/publish performed.`);
