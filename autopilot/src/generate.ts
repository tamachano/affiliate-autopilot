import type { ScoredProduct } from './types.js';

export const YOUTUBE_SHORTS_SECONDARY_CTA = 'チャンネル登録・高評価もよろしく！';
const YOUTUBE_SHORTS_CTA = '気になるものはプロフィールのリンクからチェック。';

export function generateScript(theme: string, top: ScoredProduct[]) {
  if(top.length===1) {
    const p=top[0];
    const hook=/ページ|参考書|閉じる/.test(p.problem)?'開いておきたい本、閉じてこない？':p.problem.slice(0,24);
    const lines=[hook,p.name.replace(/（.*?）/g,'').slice(0,28),p.benefit.slice(0,30),YOUTUBE_SHORTS_CTA];
    return {title:`${p.name} #Shorts`,hook,lines,primaryCTA:YOUTUBE_SHORTS_CTA,secondaryCTA:YOUTUBE_SHORTS_SECONDARY_CTA,durationSec:15};
  }
  const [a,b,c] = top;
  const hook = theme.includes('学生') ? '勉強中、これ地味に便利。' : 'これ、地味に便利。';
  const lines = [
    hook,
    `① ${a.name}：${a.benefit}`,
    `② ${b.name}：${b.benefit}`,
    `③ ${c.name}：${c.benefit}`,
    YOUTUBE_SHORTS_CTA
  ];
  return {
    title: theme.includes('学生') ? '勉強がちょっとラクになる便利グッズ3選 #Shorts' : `${theme}3選 #Shorts`,
    hook,
    lines,
    primaryCTA: YOUTUBE_SHORTS_CTA,
    secondaryCTA: YOUTUBE_SHORTS_SECONDARY_CTA,
    durationSec: 15
  };
}

export function generateStoryboard(top: ScoredProduct[]) {
  if(top.length===1) {
    const p=top[0];
    return [{start:0,end:3,text:p.problem,visual:'実物素材から用途を伝える。架空の実演は作らない'},
      {start:3,end:10,text:p.name,visual:p.demo},
      {start:10,end:12.8,text:p.benefit,visual:'確認済み仕様に基づく便利さ'},
      {start:12.8,end:15,text:'プロフィールから商品を見る',secondaryText:YOUTUBE_SHORTS_SECONDARY_CTA,visual:'購入導線と二次CTA'}];
  }
  return [
    { start: 0.0, end: 1.7, text: '勉強中、これ地味に便利。', visual: '3商品の一瞬のチラ見せ→問題シーン' },
    { start: 1.7, end: 5.4, text: `① ${shortName(top[0].name)}`, visual: top[0].demo },
    { start: 5.4, end: 9.1, text: `② ${shortName(top[1].name)}`, visual: top[1].demo },
    { start: 9.1, end: 12.8, text: `③ ${shortName(top[2].name)}`, visual: top[2].demo },
    { start: 12.8, end: 15.0, text: 'プロフィールから商品を見る', secondaryText: YOUTUBE_SHORTS_SECONDARY_CTA, visual: '音声はプロフィール導線、画面では登録・高評価。公開前にクリック可能なプロフィール導線を確認する。' }
  ];
}

function shortName(name: string) {
  return name.replace(/（.*?）/g, '').replace('コクヨ ', '').slice(0, 18);
}

export function generateYouTubeText(top: ScoredProduct[]) {
  const items = top.map((p,i) => `${i+1}. ${p.name}\n${p.affiliateUrl || '商品リンク：［SKU確定後に入力］'}`).join('\n\n');
  return `勉強中にあると地味に便利なアイテムを3つまとめました。\n\n${items}\n\n※Shortsの説明欄に記載した通常URLはクリック導線として扱わず、プロフィール等のクリック可能な導線を公開前に確認してください。\n※価格・仕様は掲載時点のものです。購入前に商品ページでご確認ください。\n※この投稿にはアフィリエイトリンクを含みます。\n※Amazonのアソシエイトとして、適格販売により収入を得ています。\n\n#勉強グッズ #便利グッズ #文房具 #学生 #Shorts`;
}

export function generateTikTokText() {
  return `勉強中、これ地味に便利。学生向け便利グッズ3選📚\n気になるものはプロフィールのリンクから。\n#勉強グッズ #文房具 #便利グッズ #学生`;
}
