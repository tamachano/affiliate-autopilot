/** Simple Amazon Japan text links, per official Associates documented ASIN format.
 * No Amazon API, scraping, price fetching, or credential is used.
 */
export function asinFrom(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (/^[A-Z0-9]{10}$/i.test(v)) return v.toUpperCase();
  try {
    const u = new URL(v);
    if (u.protocol !== 'https:' || !/^(www\.)?amazon\.co\.jp$/i.test(u.hostname)) return null;
    const m = u.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?]|$)/i);
    return m ? m[1].toUpperCase() : null;
  } catch { return null; }
}
export function affiliateLink(asin, trackingId) {
  if (!/^[A-Z0-9]{10}$/i.test(asin || '')) throw new Error('Amazon ASIN must be 10 alphanumeric characters');
  if (!/^[a-zA-Z0-9_-]+-22$/.test(trackingId || '')) throw new Error('Invalid Amazon.co.jp tracking ID');
  return `https://www.amazon.co.jp/dp/${asin.toUpperCase()}/ref=nosim?tag=${encodeURIComponent(trackingId)}`;
}
export function resolveLink(record, trackingId) {
  const asin = asinFrom(record.asin || '') || asinFrom(record.amazonProductUrl || '') || asinFrom(record.url || '');
  if (!asin) return {asin:null,url:'',status:'needs_asin'};
  return {asin,url:affiliateLink(asin,trackingId),status:record.destinationVerified === true ? 'verified' : 'needs_destination_review'};
}
