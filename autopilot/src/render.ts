import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspectAssetManifest } from './workflow.js';

function execFfmpeg(args:string[]) {
  const r=spawnSync('ffmpeg',args,{encoding:'utf8',timeout:120000,maxBuffer:3_000_000});
  if(r.error) throw new Error(`ffmpegを実行できません: ${r.error.message}`);
  if(r.status!==0) throw new Error(`動画生成に失敗: ${String(r.stderr).slice(-800)}`);
}

export function renderApprovedVideo(runDir:string, secondaryCTA:string) {
  const m=inspectAssetManifest(runDir);
  if(!m.ready) return {rendered:false,blocked:m.problems};
  const result=path.join(runDir,'shorts-draft.mp4');
  const tmpDir=path.join(runDir,'render-tmp'); fs.mkdirSync(tmpDir,{recursive:true});
  const clips:string[]=[];
  const durations=m.entries.map(() => 15/m.entries.length);
  try {
    for(let i=0;i<m.entries.length;i++) {
      const input=path.resolve(runDir,m.entries[i].relativeFile);
      const clip=path.join(tmpDir,`part${i}.mp4`);
      execFfmpeg(['-y','-stream_loop','-1','-i',input,'-t',String(durations[i]),'-vf','scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p','-an','-c:v','libx264','-preset','veryfast','-crf','24',clip]);
      clips.push(clip);
    }
    const concat=path.join(tmpDir,'concat.txt');fs.writeFileSync(concat,clips.map(x=>`file '${x.replace(/'/g,"'\\''")}'`).join('\n'));
    execFfmpeg(['-y','-f','concat','-safe','0','-i',concat,'-c','copy',result]);
    // An actual licensed-media-only silent draft; not pretending to include Japanese TTS/subtitles.
    return {rendered:true,outputFile:result,secondaryCTA,notes:['権利確認済み素材を使った無音の縦型ドラフトです','日本語ナレーション・字幕・BGMは未実装','公開前に画面字幕・音声・CTA・動画の権利を確認してください']};
  } finally {fs.rmSync(tmpDir,{recursive:true,force:true});}
}
