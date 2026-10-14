'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const rows = JSON.parse(fs.readFileSync(path.join(root, 'data', 'products.json'), 'utf8'));
if (!Array.isArray(rows)) throw Error('products.json must be an array');
const amazonTags = new Set(['tamama0a-22']);
const output = [];
const ids = new Set();
for (const r of rows) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) throw Error('Invalid product');
  const id = String(r.id || '').trim();
  if (!id || ids.has(id)) throw Error('Duplicate or empty ID: ' + id);
  ids.add(id);
  const name = String(r.name || '').trim();
  const description = String(r.description || '').trim();
  const provider = String(r.provider || '').trim();
  const url = String(r.url || '').trim();
  const publishedAt = String(r.publishedAt || '').trim();
  if (!name || name.length > 130 || description.length > 320) throw Error('Invalid product name/description: '+id);
  if (!['amazon','rakuten'].includes(provider)) throw Error('Invalid provider: '+id);
  let u;
  try { u = new URL(url); } catch { throw Error('Invalid affiliate URL: '+id); }
  if (u.protocol !== 'https:' || u.username || u.password) throw Error('Invalid HTTPS URL: '+id);
  const host = u.hostname.toLowerCase();
  if (provider === 'rakuten' && !['a.r10.to', 'r10.to', 'hb.afl.rakuten.co.jp'].includes(host)) throw Error('Unexpected Rakuten domain: '+host);
  if (provider === 'amazon' && host !== 'amazon.co.jp' && !host.endsWith('.amazon.co.jp')) throw Error('Unexpected Amazon domain: '+host);
  if (provider === 'amazon' && !amazonTags.has(u.searchParams.get('tag'))) throw Error('Amazon associate tag missing/unexpected for product '+id);
  if (publishedAt && !/^\d{4}-\d{2}-\d{2}$/.test(publishedAt)) throw Error('Invalid publish date: '+id);
  const videos = [];
  if (r.videos !== undefined && !Array.isArray(r.videos)) throw Error('Invalid video list: '+id);
  const videoIds = new Set();
  for (const video of r.videos || []) {
    if (!video || typeof video !== 'object' || !/^[A-Za-z0-9_-]{11}$/.test(video.id || '') || videoIds.has(video.id)) throw Error('Invalid/duplicate video ID: '+id);
    const title = String(video.title || '').trim();
    if (!title || title.length > 160) throw Error('Invalid video title: '+id);
    let thumbnail;
    try { thumbnail = new URL(video.thumbnailUrl); } catch { throw Error('Invalid video thumbnail: '+id); }
    if (thumbnail.protocol !== 'https:' || thumbnail.hostname !== 'i.ytimg.com' || thumbnail.username || thumbnail.password || !thumbnail.pathname.startsWith('/vi/'+video.id+'/')) throw Error('Unexpected video thumbnail: '+id);
    videoIds.add(video.id);
    videos.push({id:video.id,title,thumbnailUrl:thumbnail.href});
  }
  const extra = {};
  if (r.collection !== undefined) {
    if (r.collection !== 'outdoor-top5-v3' || !Number.isInteger(r.rank) || r.rank<1 || r.rank>5) throw Error('Invalid collection/rank: '+id);
    if (typeof r.variant !== 'string' || r.variant.length>120 || typeof r.caution !== 'string' || r.caution.length>320) throw Error('Invalid variant/caution: '+id);
    Object.assign(extra, {collection:r.collection, rank:r.rank, variant:r.variant, caution:r.caution, affiliateVerified:r.affiliateVerified===true});
  }
  output.push({id,name,description,provider,url,publishedAt,enabled:r.enabled!==false,...extra,...(videos.length?{videos}:{}),...(typeof r.productId==='string'?{productId:r.productId}:{}),...(typeof r.experimentId==='string'?{experimentId:r.experimentId}:{}),...(/^[A-Za-z0-9_-]{11}$/.test(r.youtubeVideoId||'')?{youtubeVideoId:r.youtubeVideoId}:{})});
}
const content = `window.PRODUCTS = ${JSON.stringify(output,null,2).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026')};\n`;
fs.writeFileSync(path.join(root,'public','products.js'),content,'utf8');
console.log(`Built ${output.length} product(s) in public/products.js`);

