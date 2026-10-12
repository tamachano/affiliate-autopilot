import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { runAffiliate } from './pipeline.js';
import { runSupervisorLoop, writeSupervisorArtifacts } from './supervisor.js';
import { openDb, saveSupervisorRun } from './db.js';
import { inspectAssetManifest } from './workflow.js';
import { renderApprovedVideo } from './render.js';
import { writeJson } from './utils.js';

export const HUB_URL = 'https://jinsei-no-sitsu.quality-life.workers.dev/';
export type CampaignRequest = { id:string; theme:string; productIds:string[]; mode:'prepare'|'publish' };

export function parseCampaignRequest(value:any):CampaignRequest {
  if (!value || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(value.id)) throw Error('Invalid campaign ID');
  if (!['prepare','publish'].includes(value.mode)) throw Error('Invalid campaign mode');
  if (typeof value.theme!=='string' || !value.theme.trim() || value.theme.length>120) throw Error('Invalid theme');
  if (!Array.isArray(value.productIds) || ![1,3].includes(value.productIds.length) ||
      value.productIds.some((id:any)=>typeof id!=='string' || !/^[a-z0-9-]{1,80}$/.test(id)) ||
      new Set(value.productIds).size!==value.productIds.length) throw Error('Choose one or three unique product IDs');
  return {id:value.id,theme:value.theme.trim(),productIds:value.productIds,mode:value.mode};
}

function providerFor(url:string) {
  let u:URL;
  try { u=new URL(url); } catch { throw Error('Invalid affiliate link'); }
  if (u.protocol!=='https:' || u.username || u.password) throw Error('Invalid affiliate HTTPS link');
  if (['a.r10.to','r10.to','hb.afl.rakuten.co.jp'].includes(u.hostname)) return 'rakuten';
  if ((u.hostname==='amazon.co.jp'||u.hostname.endsWith('.amazon.co.jp')) && u.searchParams.get('tag')==='tamama0a-22') return 'amazon';
  throw Error('Unsupported affiliate provider or tracking ID');
}

// Re-read saved products and reviews: later seed edits cannot alter this video's identity.
export function createHubProposal(repoRoot:string,runDir:string) {
  const products=JSON.parse(fs.readFileSync(path.join(runDir,'products.json'),'utf8'));
  if(!Array.isArray(products) || ![1,3].includes(products.length) || new Set(products.map((p:any)=>p.id)).size!==products.length) throw Error('Invalid reviewed product snapshot');
  const experiment=JSON.parse(fs.readFileSync(path.join(runDir,'experiment.json'),'utf8'));
  const reviewFile=path.join(runDir,'supervisor-review.json');
  const review=fs.existsSync(reviewFile)?JSON.parse(fs.readFileSync(reviewFile,'utf8')):null;
  const problems:string[]=[];
  if (!review || review.runId!==experiment.runId || review.experimentId!==experiment.id || review.creativeVerdict!=='GO') problems.push('企画レビュー未完了、または実験IDが不一致');
  const assets=inspectAssetManifest(runDir);
  problems.push(...assets.problems);
  for (const p of products) {
    if (p.claimsVerified!==true || !Array.isArray(p.evidence) || !p.evidence.some((e:any)=>e.type==='official_product' && /^https:\/\//.test(e.url))) problems.push(`${p.name}: メーカー仕様の根拠が未確認`);
    if (p.affiliateUrlVerified!==true) problems.push(`${p.name}: 購入リンクの遷移確認が未完了`);
    try { providerFor(p.affiliateUrl); } catch { problems.push(`${p.name}: 購入リンクの形式が不正`); }
  }
  let publication:any=null;
  const publicationFile=path.join(runDir,'video-publication.json');
  if (fs.existsSync(publicationFile)) publication=JSON.parse(fs.readFileSync(publicationFile,'utf8'));
  if (!publication || publication.finalVideoReviewed!==true || publication.disclosureReviewed!==true ||
      publication.runId!==experiment.runId || publication.experimentId!==experiment.id ||
      !/^[A-Za-z0-9_-]{11}$/.test(publication.youtubeVideoId||'') ||
      !/^https:\/\/(www\.)?youtube\.com\//.test(publication.destinationEvidenceUrl||'') ||
      !publication.destinationEvidenceUrl.includes(publication.youtubeVideoId) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(publication.publishedAt||'')) {
    problems.push('完成動画・広告表記・YouTube公開先の確認記録が未完了');
  }
  if (publication?.finalVideoReviewed===true) {
    const finalFile=path.join(runDir,'shorts-final.mp4');
    if (!fs.existsSync(finalFile)) problems.push('確認対象の完成動画がありません');
    else {
      const digest=createHash('sha256').update(fs.readFileSync(finalFile)).digest('hex');
      if (publication.sha256!==digest) problems.push('確認後に動画が変更されています');
      const probe=spawnSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',finalFile],{encoding:'utf8',timeout:15000});
      try {
        const info=JSON.parse(probe.stdout); const v=info.streams.find((s:any)=>s.codec_type==='video');
        if (probe.status!==0 || !v || v.width!==1080 || v.height!==1920 || Number(info.format.duration)<14 || Number(info.format.duration)>16) throw Error('format');
      } catch { problems.push('完成動画の15秒・9:16の形式確認に失敗'); }
    }
  }
  const existing=JSON.parse(fs.readFileSync(path.join(repoRoot,'data/products.json'),'utf8'));
  const map=JSON.parse(fs.readFileSync(path.join(repoRoot,'data/product-map.json'),'utf8'));
  const rows=structuredClone(existing);
  let next=Math.max(0,...rows.map((p:any)=>Number(p.id)||0))+1;
  const links:any[]=[];
  for (const p of products) {
    const known=rows.find((r:any)=>r.productId===p.id || r.id===map[p.id]);
    const id=known?.id || String(next++).padStart(3,'0');
    links.push({productId:p.id,hubId:id,url:`${HUB_URL}#product-${id}`});
    if (problems.length) continue;
    const row={...known,id,productId:p.id,name:p.name,description:p.benefit,provider:providerFor(p.affiliateUrl),url:p.affiliateUrl,publishedAt:publication.publishedAt,enabled:true,experimentId:experiment.id,youtubeVideoId:publication.youtubeVideoId};
    if (known) rows[rows.indexOf(known)]=row; else rows.push(row);
  }
  const proposal={schemaVersion:1,runId:experiment.runId,experimentId:experiment.id,ready:problems.length===0,problems:[...new Set(problems)],hubUrl:HUB_URL,productLinks:links,products:rows};
  writeJson(path.join(runDir,'hub-proposal.json'),proposal);
  return proposal;
}

export async function prepareCampaign(appRoot:string,repoRoot:string,input:unknown) {
  const request=parseCampaignRequest(input);
  const materials=path.join(repoRoot,'campaign-assets',request.id);
  const savedReview=request.mode==='publish' && fs.existsSync(path.join(materials,'supervisor-review.json'));
  let run:any;
  let supervisor:any;
  if(savedReview) {
    const products=JSON.parse(fs.readFileSync(path.join(materials,'products.json'),'utf8'));
    const experiment=JSON.parse(fs.readFileSync(path.join(materials,'experiment.json'),'utf8'));
    if(JSON.stringify(products.map((p:any)=>p.id))!==JSON.stringify(request.productIds)) throw Error('Reviewed products differ from campaign request');
    if(typeof experiment.runId!=='string' || /[\\/\x00-\x1f]/.test(experiment.runId)) throw Error('Invalid reviewed run ID');
    fs.mkdirSync(path.join(appRoot,'output'),{recursive:true});
    const outputDir=fs.mkdtempSync(path.join(appRoot,'output','reviewed-'+request.id+'-'));
    fs.mkdirSync(outputDir,{recursive:true});
    run={outputDir,runId:experiment.runId,experiment,topProducts:products};
    supervisor=JSON.parse(fs.readFileSync(path.join(materials,'supervisor-review.json'),'utf8'));
  } else {
    run=runAffiliate(appRoot,request.theme,{productIds:request.productIds});
    supervisor=await runSupervisorLoop({experiment:run.experiment,products:run.topProducts,title:run.script.title,lines:run.script.lines,complianceBlocked:run.compliance.publishBlocked,complianceSummary:run.compliance.productChecks.flatMap((x:any)=>x.blocking),allowPaidModel:false});
    writeSupervisorArtifacts(run.outputDir,supervisor);
    const db=openDb(appRoot);try {saveSupervisorRun(db,run.experiment.id,supervisor);} finally {db.close();}
  }
  // Reviewed publication uses the original snapshot, never regenerated experiment IDs.
  if (fs.existsSync(materials)) {
    const allowed=savedReview ? ['products.json','experiment.json','supervisor-review.json','media','asset-manifest.json','shorts-final.mp4','video-publication.json'] : ['media','asset-manifest.json'];
    for(const item of allowed) {
      const source=path.join(materials,item);
      if (fs.existsSync(source)) {
        const inspect=(entry:string) => {
          if(fs.lstatSync(entry).isSymbolicLink()) throw Error('Material symlinks are not allowed');
          if(fs.statSync(entry).isDirectory())for(const name of fs.readdirSync(entry))inspect(path.join(entry,name));
        };
        inspect(source);
        fs.cpSync(source,path.join(run.outputDir,item),{recursive:true});
      }
    }
  }
  const assets=inspectAssetManifest(run.outputDir);
  const draft=assets.ready?renderApprovedVideo(run.outputDir,supervisor.secondaryCTA):{rendered:false,blocked:assets.problems};
  const proposal=createHubProposal(repoRoot,run.outputDir);
  const finalText=`${supervisor.finalTitle}\n\n広告・PR：アフィリエイト広告を含みます。\n商品紹介ページ：${HUB_URL}\n${proposal.productLinks.map((p:any)=>`${run.topProducts.find((x:any)=>x.id===p.productId)?.name}: 商品 No.${p.hubId}`).join('\n')}\n\nShortsからはチャンネルプロフィールのリンクへ。\nAmazonのアソシエイトとして、適格販売により収入を得ています。\n`;
  fs.writeFileSync(path.join(run.outputDir,'youtube.txt'),finalText);
  const result={schemaVersion:1,campaignId:request.id,mode:request.mode,runId:run.runId,experimentId:run.experiment.id,creativeVerdict:supervisor.creativeVerdict,videoDraftRendered:draft.rendered,videoUploadImplemented:false,hubReady:proposal.ready,hubUpdated:false,problems:proposal.problems,productLinks:proposal.productLinks,hubUrl:HUB_URL,artifactName:`campaign-${request.id}`,generatedAt:new Date().toISOString()};
  if(request.mode==='publish' && proposal.ready) {
    const destination=path.join(repoRoot,'data/products.json');
    fs.writeFileSync(destination,JSON.stringify(proposal.products,null,2)+'\n');
    result.hubUpdated=true;
  }
  writeJson(path.join(run.outputDir,'campaign-result.json'),result);
  return {result,outputDir:run.outputDir};
}
