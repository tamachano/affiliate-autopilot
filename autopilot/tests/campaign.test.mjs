import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { prepareCampaign, createHubProposal, parseCampaignRequest } from '../dist/campaign.js';
import { runAffiliate } from '../dist/pipeline.js';
import { inspectAssetManifest } from '../dist/workflow.js';
import { renderApprovedVideo } from '../dist/render.js';
const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function fixture() {
  const repo=fs.mkdtempSync(path.join(os.tmpdir(),'autopilot-integration-'));
  const app=path.join(repo,'autopilot');fs.mkdirSync(path.join(app,'data'),{recursive:true});
  fs.copyFileSync(path.join(source,'data/products.seed.json'),path.join(app,'data/products.seed.json'));
  fs.mkdirSync(path.join(repo,'data'),{recursive:true});
  for (const n of ['products.json','product-map.json']) fs.copyFileSync(path.join(source,'../data',n),path.join(repo,'data',n));
  return {repo,app,clean:()=>fs.rmSync(repo,{recursive:true,force:true})};
}
const request={id:'clip-integration-test',theme:'学生向け・ページを開いておく便利グッズ',productIds:['sonic-kadono-omoclip'],mode:'prepare'};
test('One-product campaign runs Supervisor, exports stable hub link, and holds unlicensed media',async()=>{
  const f=fixture();try {
    const before=fs.readFileSync(path.join(f.repo,'data/products.json'),'utf8');
    const {result,outputDir}=await prepareCampaign(f.app,f.repo,request);
    assert.equal(result.creativeVerdict,'GO');assert.equal(result.hubReady,false);assert.equal(result.hubUpdated,false);
    assert.equal(result.videoDraftRendered,false);assert.match(result.productLinks[0].url,/#product-003$/);
    assert.equal(fs.readFileSync(path.join(f.repo,'data/products.json'),'utf8'),before);
    const review=JSON.parse(fs.readFileSync(path.join(outputDir,'supervisor-review.json')));
    assert.equal(review.modelUsed,undefined);assert.equal(review.publishVerdict,'BLOCKED');
    assert.ok(fs.readFileSync(path.join(outputDir,'youtube.txt'),'utf8').includes('商品 No.003'));
    const m=JSON.parse(fs.readFileSync(path.join(outputDir,'asset-manifest.json')));m.entries=[];
    fs.writeFileSync(path.join(outputDir,'asset-manifest.json'),JSON.stringify(m));
    assert.equal(inspectAssetManifest(outputDir).ready,false);
  } finally {f.clean();}
});
test('Existing three-product planning is preserved',()=>{
  const f=fixture();try {
    const run=runAffiliate(f.app,'学生向け便利グッズ');assert.equal(run.topProducts.length,3);
    assert.equal(run.storyboard.length,5);assert.equal(run.script.durationSec,15);
  } finally {f.clean();}
});
test('Reviewed final video exports only its mapped product; tampering blocks publication',async()=>{
  const f=fixture();try {
    const {outputDir}=await prepareCampaign(f.app,f.repo,request);
    const m=JSON.parse(fs.readFileSync(path.join(outputDir,'asset-manifest.json')));
    const clip=path.join(outputDir,'media/cut-1.mp4');
    // Synthetic color is a test fixture, never a product advertisement or deliverable.
    const made=spawnSync('ffmpeg',['-y','-f','lavfi','-i','color=c=gray:s=1080x1920:r=30','-t','1','-c:v','libx264','-preset','ultrafast',clip],{stdio:'ignore'});
    assert.equal(made.status,0);
    Object.assign(m.entries[0],{rights:'verified',allowCommercialVideo:true,allowAffiliateAdvertising:true,evidenceUrl:'https://example.org/test-fixture-license'});
    fs.writeFileSync(path.join(outputDir,'asset-manifest.json'),JSON.stringify(m));
    assert.equal(inspectAssetManifest(outputDir).ready,true);
    const rendered=renderApprovedVideo(outputDir,'test');assert.equal(rendered.rendered,true);
    fs.copyFileSync(rendered.outputFile,path.join(outputDir,'shorts-final.mp4'));
    const exp=JSON.parse(fs.readFileSync(path.join(outputDir,'experiment.json')));
    const pub={runId:exp.runId,experimentId:exp.id,finalVideoReviewed:true,disclosureReviewed:true,youtubeVideoId:'testVideo01',destinationEvidenceUrl:'https://www.youtube.com/shorts/testVideo01',publishedAt:'2026-10-12',sha256:createHash('sha256').update(fs.readFileSync(rendered.outputFile)).digest('hex')};
    fs.writeFileSync(path.join(outputDir,'video-publication.json'),JSON.stringify(pub));
    const proposal=createHubProposal(f.repo,outputDir);assert.equal(proposal.ready,true);
    assert.equal(proposal.products.length,3);assert.equal(proposal.products.find(p=>p.id==='003').experimentId,exp.id);
    const materials=path.join(f.repo,'campaign-assets',request.id);fs.cpSync(outputDir,materials,{recursive:true});
    const published=await prepareCampaign(f.app,f.repo,{...request,mode:'publish'});
    assert.equal(published.result.hubUpdated,true);assert.equal(published.result.experimentId,exp.id);
    fs.appendFileSync(path.join(outputDir,'shorts-final.mp4'),'tampered');
    const blocked=createHubProposal(f.repo,outputDir);assert.equal(blocked.ready,false);assert.ok(blocked.problems.some(p=>p.includes('動画が変更')));
    m.entries[0].allowCommercialVideo='true';fs.writeFileSync(path.join(outputDir,'asset-manifest.json'),JSON.stringify(m));
    assert.equal(inspectAssetManifest(outputDir).ready,false);
  } finally {f.clean();}
});
test('Invalid campaign paths and duplicate products fail closed',()=>{
  assert.throws(()=>parseCampaignRequest({...request,id:'../escape'}));
  assert.throws(()=>parseCampaignRequest({...request,productIds:['x','x','y']}));
});
