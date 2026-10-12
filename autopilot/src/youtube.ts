import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

export type YouTubeAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
};

export type YouTubeTokenRow = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  scope: string;
  tokenType: string;
};

export function loadDotEnv(root: string) {
  const file = path.join(root, '.env');
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] == null) process.env[key] = value;
  }
}

export function getYouTubeConfig(): YouTubeAuthConfig | null {
  const clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET || '').trim();
  const redirectUri = String(process.env.GOOGLE_REDIRECT_URI || '').trim();
  const scopes = String(process.env.YOUTUBE_OAUTH_SCOPES || 'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly')
    .split(/\s+/).map(x => x.trim()).filter(Boolean);
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri, scopes };
}

export function createOAuthState() {
  return crypto.randomBytes(24).toString('hex');
}

export function buildGoogleAuthUrl(config: YouTubeAuthConfig, state: string) {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.searchParams.set('client_id', config.clientId);
  u.searchParams.set('redirect_uri', config.redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', config.scopes.join(' '));
  u.searchParams.set('access_type', 'offline');
  u.searchParams.set('include_granted_scopes', 'true');
  u.searchParams.set('prompt', 'consent');
  u.searchParams.set('state', state);
  return u.toString();
}

export async function exchangeCode(config: YouTubeAuthConfig, code: string) {
  const body = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: 'authorization_code'
  });
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'}, body
  });
  const data = await r.json() as any;
  if (!r.ok) throw new Error(`OAuth token exchange failed: ${data.error_description || data.error || r.status}`);
  return data;
}

export async function refreshAccessToken(config: YouTubeAuthConfig, refreshToken: string) {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  });
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body
  });
  const data = await r.json() as any;
  if (!r.ok) throw new Error(`OAuth refresh failed: ${data.error_description || data.error || r.status}`);
  return data;
}

export function saveYouTubeTokens(db: DatabaseSync, token: any, previousRefreshToken = '') {
  const now = Date.now();
  const expiresAt = new Date(now + Number(token.expires_in || 3600) * 1000).toISOString();
  const refreshToken = String(token.refresh_token || previousRefreshToken || '');
  db.prepare(`
    INSERT INTO youtube_auth(id,access_token,refresh_token,expires_at,scope,token_type,updated_at)
    VALUES(1,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      access_token=excluded.access_token,
      refresh_token=CASE WHEN excluded.refresh_token<>'' THEN excluded.refresh_token ELSE youtube_auth.refresh_token END,
      expires_at=excluded.expires_at,
      scope=excluded.scope,
      token_type=excluded.token_type,
      updated_at=excluded.updated_at
  `).run(String(token.access_token || ''), refreshToken, expiresAt, String(token.scope || ''), String(token.token_type || 'Bearer'), new Date().toISOString());
}

export function getStoredTokens(db: DatabaseSync): YouTubeTokenRow | null {
  const row = db.prepare('SELECT * FROM youtube_auth WHERE id=1').get() as any;
  if (!row) return null;
  return {
    accessToken: String(row.access_token || ''),
    refreshToken: String(row.refresh_token || ''),
    expiresAt: String(row.expires_at || ''),
    scope: String(row.scope || ''),
    tokenType: String(row.token_type || 'Bearer')
  };
}

export async function getValidAccessToken(db: DatabaseSync, config: YouTubeAuthConfig) {
  const stored = getStoredTokens(db);
  if (!stored) throw new Error('YouTube is not connected');
  const expires = Date.parse(stored.expiresAt || '');
  if (stored.accessToken && Number.isFinite(expires) && expires > Date.now() + 60_000) return stored.accessToken;
  if (!stored.refreshToken) throw new Error('Refresh token is missing. Reconnect YouTube.');
  const fresh = await refreshAccessToken(config, stored.refreshToken);
  saveYouTubeTokens(db, fresh, stored.refreshToken);
  return String(fresh.access_token);
}

async function googleJson(url: string, accessToken: string) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }});
  const data = await r.json() as any;
  if (!r.ok) throw new Error(data?.error?.message || `Google API error ${r.status}`);
  return data;
}

export async function fetchMyChannel(accessToken: string) {
  const u = new URL('https://www.googleapis.com/youtube/v3/channels');
  u.searchParams.set('part','snippet,contentDetails,statistics');
  u.searchParams.set('mine','true');
  const data = await googleJson(u.toString(), accessToken);
  const item = data.items?.[0];
  if (!item) throw new Error('YouTube channel was not found for this Google account');
  return {
    id: String(item.id),
    title: String(item.snippet?.title || ''),
    thumbnail: String(item.snippet?.thumbnails?.default?.url || ''),
    subscriberCount: Number(item.statistics?.subscriberCount || 0),
    videoCount: Number(item.statistics?.videoCount || 0),
    uploadsPlaylistId: String(item.contentDetails?.relatedPlaylists?.uploads || '')
  };
}

export async function fetchRecentVideos(accessToken: string, uploadsPlaylistId: string, maxResults = 25) {
  const u = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
  u.searchParams.set('part','snippet,contentDetails');
  u.searchParams.set('playlistId', uploadsPlaylistId);
  u.searchParams.set('maxResults', String(Math.min(50, Math.max(1, maxResults))));
  const data = await googleJson(u.toString(), accessToken);
  return (data.items || []).map((item: any) => ({
    videoId: String(item.contentDetails?.videoId || item.snippet?.resourceId?.videoId || ''),
    title: String(item.snippet?.title || ''),
    publishedAt: String(item.contentDetails?.videoPublishedAt || item.snippet?.publishedAt || ''),
    thumbnail: String(item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || '')
  })).filter((x: any) => x.videoId);
}

function isoDate(d: Date) { return d.toISOString().slice(0,10); }

export async function fetchVideoAnalytics(accessToken: string, videoId: string, publishedAt?: string) {
  const start = publishedAt && !Number.isNaN(Date.parse(publishedAt)) ? new Date(publishedAt) : new Date(Date.now() - 30*86400_000);
  const end = new Date();
  const u = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
  u.searchParams.set('ids','channel==MINE');
  u.searchParams.set('startDate', isoDate(start));
  u.searchParams.set('endDate', isoDate(end));
  u.searchParams.set('metrics','engagedViews,views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,subscribersGained,subscribersLost');
  u.searchParams.set('filters',`video==${videoId}`);
  const data = await googleJson(u.toString(), accessToken);
  const headers = (data.columnHeaders || []).map((x:any) => String(x.name));
  const row = data.rows?.[0] || [];
  const values: Record<string, number|null> = {};
  headers.forEach((h:string,i:number) => values[h] = row[i] == null ? null : Number(row[i]));
  const views = values.views ?? null;
  const engagedViews = values.engagedViews ?? null;
  const engagedRatePct = views && engagedViews != null ? (engagedViews / views) * 100 : null;
  return {
    startDate: isoDate(start), endDate: isoDate(end),
    engagedViews,
    views,
    estimatedMinutesWatched: values.estimatedMinutesWatched ?? null,
    averageViewDuration: values.averageViewDuration ?? null,
    averageViewPercentage: values.averageViewPercentage ?? null,
    likes: values.likes ?? null,
    subscribersGained: values.subscribersGained ?? null,
    subscribersLost: values.subscribersLost ?? null,
    subscribersDelta: (values.subscribersGained ?? 0) - (values.subscribersLost ?? 0),
    engagedRatePct,
    raw: data
  };
}

export async function fetchVideoMetadata(accessToken: string, videoId: string) {
  const u = new URL('https://www.googleapis.com/youtube/v3/videos');
  u.searchParams.set('part','snippet,statistics');
  u.searchParams.set('id', videoId);
  const data = await googleJson(u.toString(), accessToken);
  const item = data.items?.[0];
  if (!item) throw new Error('Linked YouTube video was not found');
  return {
    videoId: String(item.id),
    title: String(item.snippet?.title || ''),
    publishedAt: String(item.snippet?.publishedAt || ''),
    thumbnail: String(item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || ''),
    publicViews: Number(item.statistics?.viewCount || 0),
    publicLikes: item.statistics?.likeCount == null ? null : Number(item.statistics.likeCount)
  };
}
