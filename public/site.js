(() => {
  const root = document.getElementById('items');
  const count = document.getElementById('count');
  const products = Array.isArray(window.PRODUCTS) ? window.PRODUCTS.filter(p => p.enabled !== false) : [];
  products.sort((a,b) => (b.publishedAt || '').localeCompare(a.publishedAt || '') || String(b.id).localeCompare(String(a.id)));
  count.textContent = `${products.length}点`;
  root.replaceChildren();
  const make = (tag, cls, text) => { const el=document.createElement(tag); if(cls)el.className=cls; if(text)el.textContent=text; return el; };
  const videoLink = (video, cls, text) => { const a=make('a',cls,text); a.href=`https://www.youtube.com/shorts/${video.id}`; a.target='_blank'; a.rel='noopener noreferrer'; return a; };
  if (!products.length) { root.append(make('p','empty','現在、紹介している商品はありません。')); return; }
  for (const p of products) {
    const card=make('article','card'); card.id=`product-${p.id}`;
    const videos=(Array.isArray(p.videos)?p.videos:[]).filter(v=>v && /^[A-Za-z0-9_-]{11}$/.test(v.id||'') && typeof v.title==='string' && v.title.trim());
    const body=make('div','card-body');
    body.append(make('p','meta',`商品 No.${p.id}`));
    if (videos.length) {
      const content=make('div','card-content');
      const hero=videos[0]; const thumb=videoLink(hero,'thumbnail'); thumb.setAttribute('aria-label',`${hero.title} をYouTubeで見る`);
      const img=make('img'); img.alt=`「${hero.title}」のサムネイル`; img.width=405; img.height=720; img.loading='lazy'; img.decoding='async';
      let thumbnail=null;
      try { const u=new URL(hero.thumbnailUrl); if(u.protocol==='https:' && u.hostname==='i.ytimg.com' && !u.username && !u.password && u.pathname.startsWith(`/vi/${hero.id}/`))thumbnail=u.href; } catch {}
      if(thumbnail) { img.src=thumbnail; img.addEventListener('error',()=>{ img.remove(); thumb.classList.add('thumbnail-unavailable'); }); thumb.append(img); }
      const title=make('h3','video-title'); title.append(videoLink(hero,'',hero.title));
      body.append(title,make('p','product-name',p.name),make('p','desc',p.description||''));
      content.append(thumb,body);card.append(content);
    } else { body.append(make('h3','name',p.name),make('p','desc',p.description||''));card.append(body); }
    const actions=make('div','actions'); let safe=null;
    const provider=p.provider==='rakuten'?'rakuten':'amazon';
    try {
      const u=new URL(p.url||''); const h=u.hostname.toLowerCase();
      if(u.protocol==='https:' && !u.username && !u.password && ((provider==='amazon' && (h==='amazon.co.jp'||h.endsWith('.amazon.co.jp'))) || (provider==='rakuten' && ['a.r10.to','r10.to','hb.afl.rakuten.co.jp'].includes(h))))safe=u.href;
    } catch {}
    if(safe) { const a=make('a','action',provider==='rakuten'?'楽天で商品を見る ↗':'Amazonで商品を見る ↗');a.href=safe;a.target='_blank';a.rel='noopener noreferrer sponsored';actions.append(a); }
    else actions.append(make('span','pending','商品リンク準備中'));
    if(videos.length)actions.append(videoLink(videos[0],'watch-link','動画を見る ↗'));
    body.append(actions);
    if(videos.length>1) { const other=make('div','other-videos');other.append(make('p','','この商品のほかの紹介動画')); for(const video of videos.slice(1))other.append(videoLink(video,'',video.title));card.append(other); }
    root.append(card);
  }
})();

