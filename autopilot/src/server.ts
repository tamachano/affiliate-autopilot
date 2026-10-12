import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAffiliate } from './pipeline.js';
import {
  getAnalytics,
  getExperiment,
  getExperimentByRunId,
  getRecentClosedExperiments,
  listExperiments,
  openDb,
  saveAnalytics,
  saveJudgement,
  updateExperimentPlanning,
  updateExperimentStatus,
  setExperimentYouTubeVideo,
  saveSupervisorRun,
  getSupervisorRuns
} from './db.js';
import { buildPlanningPrompt, defaultSuccessCriteria, judgeExperiment, writePlanningPrompt } from './experiment.js';
import { loadSeedProducts } from './research.js';
import { rankProducts } from './scoring.js';
import { complianceReport } from './compliance.js';
import { generateScript } from './generate.js';
import { runSupervisorLoop, writeSupervisorArtifacts } from './supervisor.js';
import { reviewInsights, inspectAssetManifest, pdcaNext } from './workflow.js';
import { renderApprovedVideo } from './render.js';
import { createHubProposal } from './campaign.js';
import { YOUTUBE_SHORTS_SECONDARY_CTA } from './generate.js';
import {
  buildGoogleAuthUrl, createOAuthState, exchangeCode, fetchMyChannel, fetchRecentVideos, fetchVideoAnalytics, fetchVideoMetadata,
  getStoredTokens, getValidAccessToken, getYouTubeConfig, loadDotEnv, saveYouTubeTokens
} from './youtube.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const publicDir = path.join(root, 'public');
loadDotEnv(root);
const preferredPort = Number(process.env.PORT || 4317);
const oauthStates = new Map<string, number>();

const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function sendJson(res: http.ServerResponse, code: number, data: unknown) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function safeStaticPath(urlPath: string) {
  const clean = urlPath === '/' ? '/index.html' : urlPath.split('?')[0];
  const candidate = path.resolve(publicDir, '.' + clean);
  if (!candidate.startsWith(publicDir)) return null;
  return candidate;
}

async function readBody(req: http.IncomingMessage) {
  return await new Promise<any>((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1_000_000) reject(new Error('Request body too large'));
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function getIdFromPath(url = '', prefix: string) {
  const clean = url.split('?')[0];
  if (!clean.startsWith(prefix)) return null;
  return decodeURIComponent(clean.slice(prefix.length).split('/')[0] || '');
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url?.startsWith('/auth/google/start')) {
      const config = getYouTubeConfig();
      if (!config) return sendJson(res, 500, { error: '.env の GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI を確認してください' });
      const state = createOAuthState();
      oauthStates.set(state, Date.now() + 10 * 60_000);
      res.writeHead(302, { Location: buildGoogleAuthUrl(config, state) });
      res.end();
      return;
    }

    if (req.method === 'GET' && req.url?.startsWith('/auth/google/callback')) {
      const config = getYouTubeConfig();
      if (!config) return sendJson(res, 500, { error: 'OAuth config missing' });
      const u = new URL(req.url, `http://localhost:${preferredPort}`);
      const error = u.searchParams.get('error');
      if (error) { res.writeHead(302, { Location: '/?youtube=error' }); res.end(); return; }
      const code = u.searchParams.get('code') || '';
      const state = u.searchParams.get('state') || '';
      const expires = oauthStates.get(state) || 0;
      oauthStates.delete(state);
      if (!code || !state || expires < Date.now()) return sendJson(res, 400, { error: 'OAuth state/code is invalid or expired' });
      const token = await exchangeCode(config, code);
      const db = openDb(root);
      saveYouTubeTokens(db, token);
      db.close();
      res.writeHead(302, { Location: '/?youtube=connected' });
      res.end();
      return;
    }

    if (req.method === 'GET' && req.url === '/api/youtube/status') {
      const config = getYouTubeConfig();
      if (!config) return sendJson(res, 200, { configured: false, connected: false });
      const db = openDb(root);
      const stored = getStoredTokens(db);
      if (!stored) { db.close(); return sendJson(res, 200, { configured: true, connected: false }); }
      try {
        const token = await getValidAccessToken(db, config);
        const channel = await fetchMyChannel(token);
        db.close();
        return sendJson(res, 200, { configured: true, connected: true, channel, scope: stored.scope, expiresAt: stored.expiresAt });
      } catch (e) {
        db.close();
        return sendJson(res, 200, { configured: true, connected: false, error: e instanceof Error ? e.message : 'YouTube auth failed' });
      }
    }

    if (req.method === 'POST' && req.url === '/api/youtube/disconnect') {
      const db = openDb(root);
      db.prepare('DELETE FROM youtube_auth WHERE id=1').run();
      db.close();
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'GET' && req.url === '/api/youtube/videos') {
      const config = getYouTubeConfig();
      if (!config) return sendJson(res, 400, { error: 'YouTube OAuth is not configured' });
      const db = openDb(root);
      const token = await getValidAccessToken(db, config);
      const channel = await fetchMyChannel(token);
      const videos = await fetchRecentVideos(token, channel.uploadsPlaylistId, 25);
      db.close();
      return sendJson(res, 200, { channel, videos });
    }
    if (req.method === 'POST' && req.url === '/api/run') {
      const body = await readBody(req);
      const theme = typeof body.theme === 'string' ? body.theme : '';
      const result = runAffiliate(root, theme);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === 'GET' && req.url === '/api/experiments') {
      const db = openDb(root);
      const experiments = listExperiments(db, 50);
      db.close();
      sendJson(res, 200, { experiments });
      return;
    }

    const expId = getIdFromPath(req.url || '', '/api/experiments/');
    if (expId && req.method === 'GET' && !req.url?.includes('/prompt') && !req.url?.includes('/analytics') && !req.url?.includes('/supervisor') && !req.url?.includes('/workflow') && !req.url?.includes('/hub-proposal')) {
      const db = openDb(root);
      const experiment = getExperiment(db, expId);
      const analytics = experiment ? getAnalytics(db, expId) : [];
      db.close();
      if (!experiment) return sendJson(res, 404, { error: 'Experiment not found' });
      sendJson(res, 200, { experiment, analytics });
      return;
    }

    if (expId && req.method === 'POST' && req.url?.endsWith('/planning')) {
      const body = await readBody(req);
      const variables = Array.isArray(body.variablesChanged) ? body.variablesChanged.filter((x: unknown) => typeof x === 'string' && x.trim()).map((x: string) => x.trim()) : [];
      const db = openDb(root);
      const baselineValue = body.baselineValue === '' || body.baselineValue == null ? null : Number(body.baselineValue);
      const targetValue = body.targetValue === '' || body.targetValue == null ? null : Number(body.targetValue);
      const requestedCriteria = String(body.successCriteria || '').trim();
      const exploratory = baselineValue == null || variables.length > 1;
      const requestedPrimary = String(body.primaryMetric || 'stayed_to_watch_pct');
      const requestedSecondary = Array.isArray(body.secondaryMetrics) ? body.secondaryMetrics.map(String) : [];
      const primaryMetric = exploratory && requestedPrimary === 'affiliate_clicks' ? 'stayed_to_watch_pct' : requestedPrimary;
      const secondaryMetrics = exploratory
        ? Array.from(new Set([...requestedSecondary, 'avg_view_duration_sec', 'affiliate_clicks', 'conversions'])).filter(x => x && x !== primaryMetric)
        : requestedSecondary;
      const autoCriteriaNeeded = exploratory || !requestedCriteria || /20%|20％|20%以上|直近の比較対象/.test(requestedCriteria);
      updateExperimentPlanning(db, expId, {
        hypothesis: String(body.hypothesis || '').trim(),
        variablesChanged: variables,
        primaryMetric,
        secondaryMetrics,
        successCriteria: autoCriteriaNeeded ? defaultSuccessCriteria(baselineValue, variables) : requestedCriteria,
        baselineValue,
        targetValue: exploratory ? null : targetValue,
        status: 'planning'
      });
      const experiment = getExperiment(db, expId);
      db.close();
      sendJson(res, 200, { experiment });
      return;
    }

    if (expId && req.method === 'POST' && req.url?.endsWith('/status')) {
      const body = await readBody(req);
      const status = String(body.status || 'planning') as any;
      const allowed = ['planning','ready','published','review_24h','review_72h','closed'];
      if (!allowed.includes(status)) return sendJson(res, 400, { error: 'Invalid status' });
      const db = openDb(root);
      updateExperimentStatus(db, expId, status);
      const experiment = getExperiment(db, expId);
      db.close();
      sendJson(res, 200, { experiment });
      return;
    }

    if (expId && req.method === 'POST' && req.url?.endsWith('/analytics')) {
      const body = await readBody(req);
      const db = openDb(root);
      const experiment = getExperiment(db, expId);
      if (!experiment) { db.close(); return sendJson(res, 404, { error: 'Experiment not found' }); }
      saveAnalytics(db, {
        experimentId: expId,
        stage: ['24h','72h','manual'].includes(body.stage) ? body.stage : 'manual',
        platform: String(body.platform || 'youtube'),
        capturedAt: new Date().toISOString(),
        views: body.views === '' || body.views == null ? null : Number(body.views),
        engagedViews: body.engagedViews === '' || body.engagedViews == null ? null : Number(body.engagedViews),
        avgViewDurationSec: body.avgViewDurationSec === '' || body.avgViewDurationSec == null ? null : Number(body.avgViewDurationSec),
        stayedToWatchPct: body.stayedToWatchPct === '' || body.stayedToWatchPct == null ? null : Number(body.stayedToWatchPct),
        likes: body.likes === '' || body.likes == null ? null : Number(body.likes),
        subscribersDelta: body.subscribersDelta === '' || body.subscribersDelta == null ? null : Number(body.subscribersDelta),
        clicks: body.clicks === '' || body.clicks == null ? null : Number(body.clicks),
        conversions: body.conversions === '' || body.conversions == null ? null : Number(body.conversions),
        revenueYen: body.revenueYen === '' || body.revenueYen == null ? null : Number(body.revenueYen)
      });
      updateExperimentStatus(db, expId, body.stage === '24h' ? 'review_24h' : body.stage === '72h' ? 'review_72h' : experiment.status);
      const analytics = getAnalytics(db, expId);
      db.close();
      sendJson(res, 200, { analytics });
      return;
    }

    if (expId && req.method === 'POST' && req.url?.endsWith('/youtube-link')) {
      const body = await readBody(req);
      const videoId = String(body.videoId || '').trim();
      if (!videoId) return sendJson(res, 400, { error: 'videoId is required' });
      const db = openDb(root);
      const experiment = getExperiment(db, expId);
      if (!experiment) { db.close(); return sendJson(res, 404, { error: 'Experiment not found' }); }
      setExperimentYouTubeVideo(db, expId, videoId);
      const updated = getExperiment(db, expId);
      db.close();
      return sendJson(res, 200, { experiment: updated });
    }

    if (expId && req.method === 'POST' && req.url?.endsWith('/youtube-sync')) {
      const body = await readBody(req);
      const stage = ['24h','72h','manual'].includes(body.stage) ? body.stage : 'manual';
      const config = getYouTubeConfig();
      if (!config) return sendJson(res, 400, { error: 'YouTube OAuth is not configured' });
      const db = openDb(root);
      const experiment = getExperiment(db, expId);
      if (!experiment) { db.close(); return sendJson(res, 404, { error: 'Experiment not found' }); }
      if (!experiment.youtubeVideoId) { db.close(); return sendJson(res, 400, { error: 'この実験にYouTube動画を紐付けてください' }); }
      const token = await getValidAccessToken(db, config);
      const meta = await fetchVideoMetadata(token, experiment.youtubeVideoId);
      const yt = await fetchVideoAnalytics(token, experiment.youtubeVideoId, meta.publishedAt);
      saveAnalytics(db, {
        experimentId: expId,
        stage,
        platform: 'youtube_api',
        capturedAt: new Date().toISOString(),
        views: yt.views,
        engagedViews: yt.engagedViews,
        avgViewDurationSec: yt.averageViewDuration,
        stayedToWatchPct: yt.engagedRatePct,
        likes: yt.likes,
        subscribersDelta: yt.subscribersDelta,
        clicks: null,
        conversions: null,
        revenueYen: null
      });
      updateExperimentStatus(db, expId, stage === '24h' ? 'review_24h' : stage === '72h' ? 'review_72h' : experiment.status);
      const analytics = getAnalytics(db, expId);
      const updated = getExperiment(db, expId);
      db.close();
      return sendJson(res, 200, { experiment: updated, analytics, youtube: { ...yt, video: meta } });
    }


    if (expId && req.method === 'POST' && req.url?.endsWith('/supervisor/run')) {
      const db = openDb(root);
      const experiment = getExperiment(db, expId);
      if (!experiment) { db.close(); return sendJson(res, 404, { error: 'Experiment not found' }); }
      const run = db.prepare('SELECT output_dir FROM runs WHERE id=?').get(experiment.runId) as any;
      const productRows = db.prepare('SELECT product_id FROM run_products WHERE run_id=? ORDER BY rank').all(experiment.runId) as any[];
      const ids = productRows.map(x => String(x.product_id));
      const all = rankProducts(loadSeedProducts(root));
      const products = ids.map(id => all.find(x => x.id === id)).filter(Boolean) as any[];
      const script = generateScript(experiment.theme, products);
      const compliance = complianceReport(products);
      const result = await runSupervisorLoop({
        experiment,
        products,
        title: script.title,
        lines: script.lines,
        complianceBlocked: compliance.publishBlocked,
        complianceSummary: compliance.productChecks.flatMap((x:any)=>x.blocking.map((y:string)=>`${x.name}: ${y}`)),
        maxIterations: 3
      });
      saveSupervisorRun(db, expId, result);
      if (run?.output_dir) writeSupervisorArtifacts(String(run.output_dir), result);
      db.close();
      return sendJson(res, 200, { result, openaiConfigured: Boolean(process.env.OPENAI_API_KEY), model: process.env.OPENAI_SUPERVISOR_MODEL || null });
    }

    if (expId && req.method === 'GET' && req.url?.endsWith('/supervisor')) {
      const db = openDb(root);
      const experiment = getExperiment(db, expId);
      if (!experiment) { db.close(); return sendJson(res, 404, { error: 'Experiment not found' }); }
      const runs = getSupervisorRuns(db, expId, 10);
      db.close();
      return sendJson(res, 200, { runs, openaiConfigured: Boolean(process.env.OPENAI_API_KEY), model: process.env.OPENAI_SUPERVISOR_MODEL || null });
    }

    if (expId && req.method === 'POST' && req.url?.endsWith('/judge')) {
      const db = openDb(root);
      const experiment = getExperiment(db, expId);
      if (!experiment) { db.close(); return sendJson(res, 404, { error: 'Experiment not found' }); }
      const analytics = getAnalytics(db, expId);
      const result = judgeExperiment(experiment, analytics);
      saveJudgement(db, expId, result.judgement, result.learning, result.nextAction);
      const updated = getExperiment(db, expId);
      db.close();
      sendJson(res, 200, { ...result, experiment: updated });
      return;
    }

    if (expId && req.method === 'GET' && req.url?.endsWith('/prompt')) {
      const db = openDb(root);
      const experiment = getExperiment(db, expId);
      if (!experiment) { db.close(); return sendJson(res, 404, { error: 'Experiment not found' }); }
      const run = db.prepare('SELECT output_dir FROM runs WHERE id=?').get(experiment.runId) as any;
      const productsRows = db.prepare('SELECT product_id FROM run_products WHERE run_id=? ORDER BY rank').all(experiment.runId) as any[];
      const ids = productsRows.map(x => String(x.product_id));
      const all = rankProducts(loadSeedProducts(root));
      const products = ids.map(id => all.find(x => x.id === id)).filter(Boolean) as any[];
      const script = generateScript(experiment.theme, products);
      const compliance = complianceReport(products);
      const recentLearnings = getRecentClosedExperiments(db, 5).filter(x => x.id !== expId);
      const prompt = buildPlanningPrompt({
        experiment,
        products,
        scriptTitle: script.title,
        scriptLines: script.lines,
        complianceBlocked: compliance.publishBlocked,
        complianceSummary: compliance.productChecks.flatMap((x: any) => x.blocking.map((y: string) => `${x.name}: ${y}`)),
        recentLearnings
      });
      if (run?.output_dir) writePlanningPrompt(String(run.output_dir), prompt);
      db.close();
      sendJson(res, 200, { prompt });
      return;
    }

    if (req.method === 'GET' && req.url === '/api/v1/capabilities') {
      const db=openDb(root);
      const experiments=listExperiments(db,50);
      db.close();
      return sendJson(res,200,{
        version:'1.0-integration-preview',
        supported:{productCandidateScoring:true,supervisor:true,humanizer:true,assetRightsGate:true,manualReviewInsights:true,approvedFootageDraft:true,youtubeReadAnalytics:true,manualConversions:true,pdcaSuggestions:true},
        requiresSetup:{youtubeAnalytics:'Google OAuth',modelReview:'OPENAI_API_KEY (別料金)',videoDraft:'ffmpegと商用広告利用許可を確認済みの実写3素材'},
        notImplemented:['ライブ商品検索','Amazonレビュー自動取得','素材の利用許諾の自動認証','日本語TTS/字幕の動画焼き込み','YouTube自動アップロード','Amazon成約の自動取得','完全無人投稿'],
        experiments:experiments.length
      });
    }

    if (req.method === 'POST' && req.url === '/api/v1/review-insights') {
      const body=await readBody(req);
      const notes=Array.isArray(body.notes) ? body.notes.map(String) : String(body.notes||'').split('\n');
      return sendJson(res,200,reviewInsights(notes));
    }

    if (expId && req.method === 'GET' && req.url?.endsWith('/workflow')) {
      const db=openDb(root); const exp=getExperiment(db,expId);
      if(!exp){db.close();return sendJson(res,404,{error:'Experiment not found'});}
      const run=db.prepare('SELECT output_dir FROM runs WHERE id=?').get(exp.runId) as any;
      const assets=run?.output_dir?inspectAssetManifest(String(run.output_dir)):{ready:false,problems:['run未確認'],entries:[]};
      const snaps=getAnalytics(db,expId);
      const supervisor=getSupervisorRuns(db,expId,1)[0] || null;
      const analysis=pdcaNext(exp,snaps);
      db.close();
      return sendJson(res,200,{experiment:exp,assets,supervisor:supervisor?{verdict:supervisor.finalVerdict,humanScore:supervisor.humanScore}:null,analyticsCount:snaps.length,next:analysis,publishAllowed:false,publishReason:'投稿API未接続。編集済み動画・素材権利・広告表示を別途確認してください。'});
    }

    if (expId && req.method === 'POST' && req.url?.endsWith('/video-draft')) {
      const db=openDb(root);const exp=getExperiment(db,expId);
      if(!exp){db.close();return sendJson(res,404,{error:'Experiment not found'});}
      const row=db.prepare('SELECT output_dir FROM runs WHERE id=?').get(exp.runId) as any;db.close();
      if(!row?.output_dir)return sendJson(res,404,{error:'run not found'});
      return sendJson(res,200,renderApprovedVideo(String(row.output_dir),YOUTUBE_SHORTS_SECONDARY_CTA));
    }

    if (expId && req.method === 'GET' && req.url?.endsWith('/hub-proposal')) {
      const db=openDb(root);const exp=getExperiment(db,expId);
      if(!exp){db.close();return sendJson(res,404,{error:'Experiment not found'});}
      const row=db.prepare('SELECT output_dir FROM runs WHERE id=?').get(exp.runId) as any;db.close();
      if(!row?.output_dir)return sendJson(res,404,{error:'run not found'});
      return sendJson(res,200,createHubProposal(path.resolve(root,'..'),String(row.output_dir)));
    }
    if (req.method === 'GET' && req.url === '/api/health') {
      sendJson(res, 200, { ok: true, version: '1.0-integration-preview' });
      return;
    }

    if (req.method !== 'GET') {
      res.writeHead(405);
      res.end('Method Not Allowed');
      return;
    }

    const filePath = safeStaticPath(req.url || '/');
    if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nPort ${preferredPort} is already in use.`);
    console.error(`OAuth uses a fixed callback URL, so Affiliate AutoPilot will not switch ports automatically.`);
    console.error(`Stop the process using ${preferredPort}, or change PORT + GOOGLE_REDIRECT_URI + GCP redirect URI together.\n`);
    process.exit(1);
  }
  throw err;
});

server.listen(preferredPort, '127.0.0.1', () => {
  const config = getYouTubeConfig();
  console.log(`\nAffiliate AutoPilot v1.0 Integration Preview is running.`);
  console.log(`Open: http://localhost:${preferredPort}`);
  console.log(`YouTube OAuth: ${config ? 'configured' : 'not configured (.env)'}\n`);
});
