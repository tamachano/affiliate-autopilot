const $ = s => document.querySelector(s);
let currentRun = null;
let currentExperiment = null;

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2200);
}

async function api(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function setTab(name) {
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.id === name));
  document.querySelectorAll('.nav-item').forEach(x => x.classList.toggle('active', x.dataset.tab === name));
  $('#pageTitle').textContent = ({plan:'企画',experiment:'Experiment Manager',results:'結果・判定',youtube:'YouTube連携',supervisor:'Supervisor',workflow:'統合ワークフロー',handoff:'ChatGPT共有'})[name] || name;
}

document.querySelectorAll('.nav-item').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
document.querySelectorAll('[data-theme]').forEach(b => b.addEventListener('click', () => $('#themeInput').value = b.dataset.theme));

function badge(ok, yes, no) { return `<span class="mini-badge ${ok ? 'ok' : 'block'}">${ok ? yes : no}</span>`; }

function renderRun(result) {
  currentRun = result;
  currentExperiment = result.experiment;
  $('#runBadge').textContent = '企画作成済み';
  $('#runBadge').className = 'status-pill good';
  $('#statExp').textContent = result.experiment.id.replace('exp-','').slice(0, 10);
  $('#statProducts').textContent = result.topProducts.length;
  $('#statVariables').textContent = result.experiment.variablesChanged.length;
  $('#statGate').textContent = result.compliance.publishBlocked ? 'BLOCK' : 'OK';

  $('#productGrid').innerHTML = result.topProducts.map((p, i) => `
    <div class="product-card">
      <div class="rank-no">RANK ${i+1}</div><h3>${p.name}</h3><div class="price">¥${p.priceYen.toLocaleString()}</div>
      <p>${p.problem}<br>→ ${p.benefit}</p>
      <div class="score-row"><div><span class="muted">SCORE</span><div class="score">${p.score}</div></div>${badge(p.claimsVerified,'仕様確認','仕様要確認')}</div>
      <div class="evidence">SKU: ${p.sku || '—'} / ASIN: ${p.asin || '—'}<br>Asset: ${p.assetRightsStatus || 'not_checked'}</div>
    </div>`).join('');

  $('#scriptTitle').textContent = result.script.title;
  $('#scriptLines').className = 'script-list';
  $('#scriptLines').innerHTML = result.script.lines.map((line,i) => `<div class="script-item"><div class="script-label">${i===0?'HOOK':i===result.script.lines.length-1?'CTA':`CUT ${i}`}</div><div class="script-text">${line}</div></div>`).join('');

  $('#complianceList').className = 'check-list';
  $('#complianceList').innerHTML = result.compliance.productChecks.map(c => `<div class="check-card"><div class="check-head"><div class="check-name">${c.name}</div>${badge(c.readyToPublish,'公開OK','要確認')}</div>${c.blocking.length?`<div class="check-blocking">${c.blocking.map(x=>`• ${x}`).join('<br>')}</div>`:'<div class="check-ok">• 自動チェック上のブロック項目なし</div>'}</div>`).join('');

  fillExperiment(result.experiment);
  $('#handoffPrompt').textContent = result.planningPrompt;
  refreshExperiments();
}

async function run() {
  const theme = $('#themeInput').value.trim();
  if (!theme) return toast('テーマを入力してください');
  const button = $('#runButton');
  button.disabled = true; button.textContent = '生成中…';
  try {
    const data = await api('/api/run', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({theme})});
    renderRun(data); toast('企画と実験を作成しました');
    await runSupervisorAuto();
    await refreshWorkflow();
  } catch (e) { toast(e.message); $('#runBadge').textContent='ERROR'; $('#runBadge').className='status-pill bad'; }
  finally { button.disabled=false; button.textContent='企画を作成'; }
}
$('#runButton').addEventListener('click', run);
$('#themeInput').addEventListener('keydown', e => { if (e.key === 'Enter') run(); });


function syncExperimentGuardUI() {
  const variables = ($('#variables')?.value || '').split(',').map(x=>x.trim()).filter(Boolean);
  const baselineRaw = $('#baselineValue')?.value ?? '';
  const exploratory = variables.length > 1 || baselineRaw === '';
  const primary = $('#primaryMetric');
  const criteria = $('#successCriteria');
  const target = $('#targetValue');
  if (primary) {
    if (exploratory && primary.value === 'affiliate_clicks') primary.value = 'stayed_to_watch_pct';
    primary.readOnly = exploratory;
  }
  if (criteria) {
    if (exploratory) criteria.value = '探索実験: 初回コンバージョンが発生したら導線成立。未発生の場合は300再生未満では結論を出さず、視聴指標を次の統制実験のベースライン候補として保存する';
    criteria.readOnly = exploratory;
  }
  if (target) {
    if (exploratory) target.value = '';
    target.disabled = exploratory;
  }
}

function fillExperiment(exp) {
  currentExperiment = exp;
  $('#expId').textContent = exp.id;
  $('#expStatus').textContent = exp.status;
  $('#hypothesis').value = exp.hypothesis || '';
  $('#variables').value = (exp.variablesChanged || []).join(', ');
  $('#primaryMetric').value = exp.primaryMetric || '';
  $('#secondaryMetrics').value = (exp.secondaryMetrics || []).join(', ');
  $('#successCriteria').value = exp.successCriteria || '';
  $('#baselineValue').value = exp.baselineValue ?? '';
  $('#targetValue').value = exp.targetValue ?? '';
  $('#linkedVideoId').textContent = exp.youtubeVideoId || '未紐付け';
  const exploratory = (exp.variablesChanged || []).length > 1 || exp.baselineValue == null;
  const modeBadge = $('#experimentModeBadge');
  const modeNote = $('#experimentModeNote');
  if (modeBadge) { modeBadge.textContent = exploratory ? '探索実験' : '統制実験'; modeBadge.className = `status-pill ${exploratory ? 'warn' : 'good'}`; }
  if (modeNote) {
    const p = modeNote.querySelector('p');
    if (p) p.textContent = exploratory
      ? '因果は断定しません。観測値を次の1変数テストのベースライン候補として保存します。'
      : '1変数＋ベースラインあり。主要指標で勝敗を判定できます。';
  }
  syncExperimentGuardUI();
  if (exp.judgement && exp.judgement !== 'pending') {
    $('#judgementBox').className = `judgement ${exp.judgement}`;
    $('#judgementBox').innerHTML = `<strong>${exp.judgement.toUpperCase()}</strong><p>${exp.learning || ''}</p><small>次: ${exp.nextAction || ''}</small>`;
  }
}

async function refreshExperiments() {
  try {
    const data = await api('/api/experiments');
    const list = data.experiments || [];
    $('#experimentList').className = list.length ? 'experiment-list' : 'empty-state';
    $('#experimentList').innerHTML = list.length ? list.map(exp => `
      <button class="experiment-row" data-exp-id="${exp.id}">
        <div><strong>${exp.theme}</strong><span>${exp.id}</span></div>
        <div><span class="status-dot ${exp.judgement}">${exp.judgement}</span><small>${exp.status}</small></div>
      </button>`).join('') : 'まだ実験がありません。';
    document.querySelectorAll('[data-exp-id]').forEach(btn => btn.addEventListener('click', () => loadExperiment(btn.dataset.expId)));
  } catch (e) { toast(e.message); }
}
$('#refreshExperiments').addEventListener('click', refreshExperiments);

async function loadExperiment(id) {
  try {
    const data = await api(`/api/experiments/${encodeURIComponent(id)}`);
    fillExperiment(data.experiment);
    renderAnalytics(data.analytics || []);
    await loadPrompt();
    await loadSupervisor();
    setTab('experiment');
  } catch (e) { toast(e.message); }
}

$('#variables').addEventListener('input', syncExperimentGuardUI);
$('#baselineValue').addEventListener('input', syncExperimentGuardUI);

$('#savePlanning').addEventListener('click', async () => {
  if (!currentExperiment) return toast('先に実験を作成してください');
  const variablesChanged = $('#variables').value.split(',').map(x=>x.trim()).filter(Boolean);
  if (variablesChanged.length > 2) return toast('変更変数は2つまでです');
  try {
    const data = await api(`/api/experiments/${encodeURIComponent(currentExperiment.id)}/planning`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      hypothesis: $('#hypothesis').value,
      variablesChanged,
      primaryMetric: $('#primaryMetric').value,
      secondaryMetrics: $('#secondaryMetrics').value.split(',').map(x=>x.trim()).filter(Boolean),
      successCriteria: $('#successCriteria').value,
      baselineValue: $('#baselineValue').value,
      targetValue: $('#targetValue').value
    })});
    fillExperiment(data.experiment); await loadPrompt(); refreshExperiments(); toast('実験設計を保存しました');
  } catch(e) { toast(e.message); }
});

$('#markReady').addEventListener('click', async () => {
  if (!currentExperiment) return toast('実験を選択してください');
  try {
    const data = await api(`/api/experiments/${encodeURIComponent(currentExperiment.id)}/status`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'ready'})});
    fillExperiment(data.experiment); refreshExperiments(); toast('企画レビュー済みにしました');
  } catch(e){ toast(e.message); }
});

function num(id) { const v = $(id).value; return v === '' ? null : Number(v); }
async function saveAnalyticsData(showToast = true) {
  if (!currentExperiment) { toast('実験を選択してください'); return false; }
  try {
    const data = await api(`/api/experiments/${encodeURIComponent(currentExperiment.id)}/analytics`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      stage: $('#stage').value, platform: $('#platform').value,
      views:num('#views'), stayedToWatchPct:num('#stayed'), avgViewDurationSec:num('#avd'), likes:num('#likes'), subscribersDelta:num('#subs'), clicks:num('#clicks'), conversions:num('#conversions'), revenueYen:num('#revenue')
    })});
    renderAnalytics(data.analytics || []); if (showToast) toast('分析データを保存しました');
    return true;
  } catch(e){ toast(e.message); return false; }
}

$('#saveAnalytics').addEventListener('click', () => saveAnalyticsData(true));

$('#saveAndJudge').addEventListener('click', async () => {
  const ok = await saveAnalyticsData(false);
  if (!ok || !currentExperiment) return;
  try {
    const data = await api(`/api/experiments/${encodeURIComponent(currentExperiment.id)}/judge`, {method:'POST'});
    fillExperiment(data.experiment);
    $('#judgementBox').className = `judgement ${data.judgement}`;
    $('#judgementBox').innerHTML = `<strong>${data.judgement.toUpperCase()}</strong><p>${data.learning}</p><small>次: ${data.nextAction}</small><div class="reason">reason: ${data.reason}</div>`;
    refreshExperiments(); toast('保存して判定しました');
  } catch(e){ toast(e.message); }
});

function renderAnalytics(items) {
  $('#analyticsHistory').innerHTML = items.map(x => `<div class="analytics-row"><strong>${x.stage} / ${x.platform}</strong><span>${x.views ?? '—'} views · ${x.clicks ?? '—'} clicks · ${x.conversions ?? '—'} conv · ¥${x.revenueYen ?? '—'}</span></div>`).join('');
}

$('#judgeButton')?.addEventListener('click', async () => {
  if (!currentExperiment) return toast('実験を選択してください');
  try {
    const data = await api(`/api/experiments/${encodeURIComponent(currentExperiment.id)}/judge`, {method:'POST'});
    fillExperiment(data.experiment);
    $('#judgementBox').className = `judgement ${data.judgement}`;
    $('#judgementBox').innerHTML = `<strong>${data.judgement.toUpperCase()}</strong><p>${data.learning}</p><small>次: ${data.nextAction}</small><div class="reason">reason: ${data.reason}</div>`;
    refreshExperiments(); toast('実験を判定しました');
  } catch(e){ toast(e.message); }
});

async function loadPrompt() {
  if (!currentExperiment) return toast('実験を選択してください');
  try {
    const data = await api(`/api/experiments/${encodeURIComponent(currentExperiment.id)}/prompt`);
    $('#handoffPrompt').textContent = data.prompt;
  } catch(e){ toast(e.message); }
}
$('#refreshPrompt').addEventListener('click', loadPrompt);
$('#copyPrompt').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#handoffPrompt').textContent); toast('ChatGPT用プロンプトをコピーしました'); }
  catch { toast('コピーできませんでした'); }
});

// Simple result entry: stage buttons + pasted analytics parser
document.querySelectorAll('[data-stage-value]').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('[data-stage-value]').forEach(x => x.classList.toggle('active', x === btn));
  $('#stage').value = btn.dataset.stageValue;
}));

function parseDurationToSeconds(value) {
  const parts = String(value).trim().split(':').map(Number);
  if (parts.some(Number.isNaN)) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return Number(value);
}

$('#parseAnalytics').addEventListener('click', () => {
  const raw = $('#analyticsPaste').value || '';
  if (!raw.trim()) return toast('Studioのテキストを貼ってください');
  const normalized = raw.replace(/,/g, '');
  const patterns = [
    ['#views', /(?:視聴回数|再生回数|views?)\s*[:：]?\s*([0-9]+)/i, Number],
    ['#stayed', /(?:視聴を継続|stayed\s*to\s*watch)\s*[:：]?\s*([0-9.]+)\s*%?/i, Number],
    ['#avd', /(?:平均視聴時間|average\s*view\s*duration)\s*[:：]?\s*([0-9]+:[0-9]{1,2}(?::[0-9]{1,2})?|[0-9.]+)/i, parseDurationToSeconds],
    ['#likes', /(?:高評価|いいね|likes?)\s*[:：]?\s*([0-9]+)/i, Number],
    ['#subs', /(?:登録者|subscribers?)(?:\s*(?:増加|delta|Δ))?\s*[:：]?\s*([+-]?[0-9]+)/i, Number],
    ['#clicks', /(?:affiliate\s*clicks?|クリック(?:数)?)\s*[:：]?\s*([0-9]+)/i, Number],
    ['#conversions', /(?:conversions?|成果(?:件数)?)\s*[:：]?\s*([0-9]+)/i, Number],
    ['#revenue', /(?:revenue|報酬|売上)\s*(?:¥|円)?\s*[:：]?\s*([0-9.]+)/i, Number]
  ];
  let found = 0;
  for (const [selector, rx, convert] of patterns) {
    const m = normalized.match(rx);
    if (m) {
      const v = convert(m[1]);
      if (v !== null && !Number.isNaN(v)) { $(selector).value = v; found++; }
    }
  }
  toast(found ? `${found}項目を自動入力しました` : '読み取れる数値が見つかりませんでした');
});

refreshExperiments();

async function refreshYouTubeStatus() {
  try {
    const data = await api('/api/youtube/status');
    const badge = $('#youtubeStatusBadge');
    const box = $('#youtubeStatus');
    if (!data.configured) {
      badge.textContent = '未設定'; badge.className = 'status-pill bad';
      box.className = 'youtube-status';
      box.innerHTML = '<strong>.env が未設定です</strong><p>GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI を確認してください。</p>';
      return;
    }
    if (!data.connected) {
      badge.textContent = '未接続'; badge.className = 'status-pill neutral';
      box.className = 'youtube-status';
      box.innerHTML = `<strong>YouTubeはまだ接続されていません</strong><p>${data.error || '「YouTubeを接続」からGoogle認証を行ってください。'}</p>`;
      return;
    }
    badge.textContent = '接続済み'; badge.className = 'status-pill good';
    box.className = 'youtube-status connected';
    box.innerHTML = `<div class="channel-card">${data.channel.thumbnail ? `<img src="${data.channel.thumbnail}" alt="">` : ''}<div><strong>${data.channel.title}</strong><span>Channel ID: ${data.channel.id}</span><small>${Number(data.channel.subscriberCount||0).toLocaleString()} subscribers · ${Number(data.channel.videoCount||0).toLocaleString()} videos</small></div></div>`;
  } catch(e) { toast(e.message); }
}

async function loadYouTubeVideos() {
  const list = $('#youtubeVideoList');
  list.className = 'empty-state'; list.textContent = '取得中…';
  try {
    const data = await api('/api/youtube/videos');
    const videos = data.videos || [];
    list.className = videos.length ? 'youtube-video-list' : 'empty-state';
    list.innerHTML = videos.length ? videos.map(v => `
      <div class="youtube-video-row">
        ${v.thumbnail ? `<img src="${v.thumbnail}" alt="">` : ''}
        <div class="youtube-video-info"><strong>${v.title}</strong><span>${v.videoId}</span><small>${v.publishedAt ? new Date(v.publishedAt).toLocaleString() : ''}</small></div>
        <button class="ghost" data-link-video="${v.videoId}">この実験に紐付け</button>
      </div>`).join('') : '動画が見つかりませんでした。';
    document.querySelectorAll('[data-link-video]').forEach(btn => btn.addEventListener('click', async () => {
      if (!currentExperiment) return toast('先にExperimentを選択してください');
      try {
        const result = await api(`/api/experiments/${encodeURIComponent(currentExperiment.id)}/youtube-link`, {
          method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({videoId:btn.dataset.linkVideo})
        });
        fillExperiment(result.experiment); refreshExperiments();
        toast('YouTube動画を実験に紐付けました');
      } catch(e) { toast(e.message); }
    }));
  } catch(e) { list.className='empty-state'; list.textContent='取得できませんでした。'; toast(e.message); }
}

$('#refreshYouTube').addEventListener('click', refreshYouTubeStatus);
$('#loadYouTubeVideos').addEventListener('click', loadYouTubeVideos);
$('#youtubeDisconnect').addEventListener('click', async () => {
  try { await api('/api/youtube/disconnect', {method:'POST'}); await refreshYouTubeStatus(); $('#youtubeVideoList').className='empty-state'; $('#youtubeVideoList').textContent='YouTube接続後に動画一覧を取得できます。'; toast('YouTube接続を解除しました'); }
  catch(e) { toast(e.message); }
});

$('#syncYouTube').addEventListener('click', async () => {
  if (!currentExperiment) return toast('実験を選択してください');
  if (!currentExperiment.youtubeVideoId) return toast('YouTube連携タブで動画を紐付けてください');
  const btn = $('#syncYouTube'); btn.disabled = true; btn.textContent = '取得中…';
  try {
    const data = await api(`/api/experiments/${encodeURIComponent(currentExperiment.id)}/youtube-sync`, {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({stage:$('#stage').value})
    });
    fillExperiment(data.experiment); renderAnalytics(data.analytics || []);
    const yt = data.youtube || {};
    if (yt.views != null) $('#views').value = yt.views;
    if (yt.engagedRatePct != null) $('#stayed').value = Number(yt.engagedRatePct).toFixed(1);
    if (yt.averageViewDuration != null) $('#avd').value = yt.averageViewDuration;
    if (yt.likes != null) $('#likes').value = yt.likes;
    if (yt.subscribersDelta != null) $('#subs').value = yt.subscribersDelta;
    toast('YouTube Analyticsを取得しました');
  } catch(e) { toast(e.message); }
  finally { btn.disabled=false; btn.textContent='YouTubeから取得'; }
});

const oauthResult = new URLSearchParams(location.search).get('youtube');
if (oauthResult === 'connected') { toast('YouTube接続が完了しました'); history.replaceState({}, '', '/'); setTab('youtube'); }
if (oauthResult === 'error') { toast('YouTube接続がキャンセルされました'); history.replaceState({}, '', '/'); setTab('youtube'); }
refreshYouTubeStatus();



function verdictClass(v) {
  if (v === 'GO') return 'good';
  if (v === 'STOP') return 'bad';
  return 'warn';
}

function renderSupervisorResult(result) {
  const last = result?.iterations?.[result.iterations.length - 1];
  const mode = $('#supervisorMode');
  mode.textContent = `${result?.creativeVerdict || '—'} / ${result?.assetStatus || '—'}`;
  mode.className = `status-pill ${verdictClass(result?.finalVerdict)}`;
  const hs = last?.humanScore ?? '—';
  $('#humanScoreBadge').textContent = `Human ${hs}`;
  $('#humanScoreBadge').className = `status-pill ${Number(hs) >= 80 ? 'good' : 'warn'}`;
  const lines = result?.finalLines || [];
  const secondary = result?.secondaryCTA || 'チャンネル登録・高評価もよろしく！';
  $('#supervisorFinal').className = 'supervisor-final-list';
  $('#supervisorFinal').innerHTML = lines.length ? lines.map((line,i)=>`<div class="supervisor-final-line"><span>${i===0?'HOOK':i===lines.length-1?'音声CTA':`CUT ${i}`}</span><strong>${line}</strong></div>`).join('') + `<div class="supervisor-final-line"><span>画面字幕</span><strong>${secondary}</strong></div><p>企画: ${result.creativeVerdict||'—'} / 素材: ${result.assetStatus||'—'} / 公開: ${result.publishVerdict||'—'}</p>` : '最終台本なし';
}

function renderSupervisorHistory(runs) {
  const box = $('#supervisorHistory');
  if (!runs?.length) { box.className='empty-state'; box.textContent='まだSupervisor履歴はありません。'; return; }
  box.className='supervisor-history';
  box.innerHTML = runs.map(run => {
    const result = run.result || {};
    const last = result.iterations?.[result.iterations.length - 1] || {};
    const reviews = last.reviews || [];
    return `<div class="supervisor-run">
      <div class="supervisor-run-head"><div><strong>${run.finalVerdict}</strong><span>${new Date(run.createdAt).toLocaleString()} · ${run.source}</span></div><span>Human ${run.humanScore} / Overall ${run.overallScore} / ${run.iterations} iter</span></div>
      <div class="dimension-grid">${reviews.map(r=>`<div class="dimension-card"><b>${r.dimension}</b><span>${r.score} · ${r.verdict}</span></div>`).join('')}</div>
      ${last.changes?.length ? `<div class="supervisor-changes">${last.changes.map(x=>`• ${x}`).join('<br>')}</div>` : ''}
    </div>`;
  }).join('');
  renderSupervisorResult(runs[0].result);
}

async function loadSupervisor() {
  if (!currentExperiment) return;
  try {
    const data = await api(`/api/experiments/${encodeURIComponent(currentExperiment.id)}/supervisor`);
    renderSupervisorHistory(data.runs || []);
    const mode = $('#supervisorMode');
    if (!data.runs?.length) {
      mode.textContent = data.openaiConfigured ? 'AI+Local ready' : 'Local ready';
      mode.className = 'status-pill neutral';
    }
  } catch(e) { toast(e.message); }
}

$('#loadSupervisor')?.addEventListener('click', loadSupervisor);
async function runSupervisorAuto(switchTab = false) {
  if (!currentExperiment) return;
  const btn = $('#runSupervisor');
  if (btn) { btn.disabled=true; btn.textContent='レビュー中…'; }
  try {
    const data = await api(`/api/experiments/${encodeURIComponent(currentExperiment.id)}/supervisor/run`, {method:'POST'});
    renderSupervisorResult(data.result);
    await loadSupervisor();
    if (switchTab) setTab('supervisor');
    toast(`企画: ${data.result.creativeVerdict} / 素材: ${data.result.assetStatus} / 公開: ${data.result.publishVerdict}`);
  } catch(e) { toast(e.message); }
  finally { if (btn) { btn.disabled=false; btn.textContent='Supervisorを実行'; } }
}
$('#runSupervisor')?.addEventListener('click', () => runSupervisorAuto(true));

// v1 integration dashboard: truthful capabilities, rights gate and evidence-based PDCA.
async function refreshWorkflow(){
  try {
    const cap=await api('/api/v1/capabilities');
    const features=Object.entries(cap.supported).map(([k,v])=>`<div class="caprow"><span>${k}</span><strong>${v?'利用可':'未接続'}</strong></div>`).join('');
    const pending=cap.notImplemented.map(x=>`<div class="caprow"><span>${x}</span><strong>未実装</strong></div>`).join('');
    $('#capabilityBox').className='';
    $('#capabilityBox').innerHTML=`<strong>使用可能</strong>${features}<br><strong>未実装 / 要接続</strong>${pending}`;
    if(!currentExperiment)return;
    const data=await api(`/api/experiments/${encodeURIComponent(currentExperiment.id)}/workflow`);
    const rights=data.assets;
    const state=$('#workflowState');state.className='';
    state.innerHTML=`<p><strong>素材</strong> ${rights.ready?'READY':'BLOCKED'}</p><p>${rights.problems.join(' / ')||'すべて確認済み'}</p><p><strong>Supervisor</strong> ${data.supervisor?.verdict||'未実行'}</p><p><strong>公開</strong> ${data.publishAllowed?'READY':'別途確認が必要'}</p><p class="hint">${data.publishReason}</p>`;
    const n=data.next;
    $('#pdcaNext').className='';
    $('#pdcaNext').innerHTML=`<p><strong>次の1変数:</strong> ${n.proposedNext.variable}</p><p><strong>仮説:</strong> ${n.proposedNext.hypothesis}</p><p><strong>指標:</strong> ${n.proposedNext.metric}</p><p class="hint">${n.uncertainty}</p>`;
  }catch(e){toast(e.message);}
}
$('#refreshWorkflow')?.addEventListener('click',refreshWorkflow);
$('#analyzeReviewNotes')?.addEventListener('click',async()=>{
  try{const data=await api('/api/v1/review-insights',{method:'POST',body:JSON.stringify({notes:$('#reviewNotes').value})});
    const box=$('#reviewInsightsOutput');box.className='';box.innerHTML=data.themes.length?data.themes.map(x=>`<p><strong>${x.theme}</strong>（${x.matchedNotes}件）<br>→ ${x.hook}</p>`).join(''):`該当する共通テーマなし。`;
    toast('入力メモから傾向を抽出しました');
  }catch(e){toast(e.message);}
});
$('#createVideoDraft')?.addEventListener('click',async()=>{
 if(!currentExperiment)return toast('実験を選んでください');
 try{const data=await api(`/api/experiments/${encodeURIComponent(currentExperiment.id)}/video-draft`,{method:'POST'});
   toast(data.rendered?`ドラフトを作成: ${data.outputFile}`:`素材不足で停止: ${(data.blocked||[]).join(' / ')}`);await refreshWorkflow();
 }catch(e){toast(e.message);}
});
refreshWorkflow();
