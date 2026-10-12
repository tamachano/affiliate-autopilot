"""Private photo preview: VOICEVOX Core + FFmpeg, no upload or rights approval.

Usage: python render-photo-short.py IMAGE RUNTIME_DIRECTORY OUTPUT_DIRECTORY
Runtime directory needs 0.vvm, NotoSansJP.ttf, open_jtalk_dic_utf_8-1.11,
and voicevox_onnxruntime-linux-x64-1.23.2/lib/*.so.
"""
import hashlib
import argparse
import json
import pathlib
import subprocess
import sys
import wave
from voicevox_core.blocking import Onnxruntime, OpenJtalk, Synthesizer, VoiceModelFile


def run(*args):
    subprocess.run(args, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("image")
    parser.add_argument("runtime")
    parser.add_argument("output")
    parser.add_argument("--source-description", default="User-provided photo; permission assessment pending")
    args = parser.parse_args()
    image, runtime, output = map(lambda p: pathlib.Path(p).resolve(), (args.image, args.runtime, args.output))
    if not image.is_file():
        raise ValueError("Product photo missing")
    output.mkdir(parents=True, exist_ok=True)
    synth = Synthesizer(
        Onnxruntime.load_once(filename=str(runtime / "voicevox_onnxruntime-linux-x64-1.23.2/lib/libvoicevox_onnxruntime.so.1.23.2")),
        OpenJtalk(str(runtime / "open_jtalk_dic_utf_8-1.11")),
        cpu_num_threads=2,
    )
    with VoiceModelFile.open(str(runtime / "0.vvm")) as model:
        synth.load_voice_model(model)
        styles = [(m.name, s.name, s.id) for m in model.metas for s in m.styles]
    style = next(s[2] for s in styles if s[0] == "ずんだもん" and s[1] == "ノーマル")
    scenes = [
        ("参考書、手で押さえてない？", "参考書、ずっと\n手で押さえてない？"),
        ("本の角に挟む、重り付きクリップ。", "本の角に挟む\n重り付きクリップ"),
        ("開いたページを、押さえるのを助けます。", "開いたページを\n押さえるのを助ける"),
        ("楽天の商品ページは、プロフィールから。", "楽天の商品ページは\nプロフィールから"),
    ]
    durations = []
    speed = 1.1
    for attempt in range(4):
        durations = []
        for index, (speech, _) in enumerate(scenes):
            query = synth.create_audio_query(speech, style)
            query.speed_scale = speed
            query.pre_phoneme_length = 0.08
            query.post_phoneme_length = 0.12
            path = output / f"voice-{index}.wav"
            path.write_bytes(synth.synthesis(query, style))
            with wave.open(str(path)) as wav:
                durations.append(wav.getnframes() / wav.getframerate())
        if sum(durations) <= 14.8:
            break
        speed *= sum(durations) / 14.6
    if sum(durations) > 14.8 or speed > 1.5:
        raise ValueError("Narration is too long; revise copy rather than truncate speech")
    pause = (15.0 - sum(durations)) / len(scenes)
    for index in range(len(scenes)):
        path = output / f"voice-{index}.wav"
        with wave.open(str(path), "rb") as wav:
            params = wav.getparams()
            frames = wav.readframes(wav.getnframes())
        silence_frames = round(pause * params.framerate)
        with wave.open(str(path), "wb") as wav:
            wav.setparams(params)
            wav.writeframes(frames + b"\0" * silence_frames * params.sampwidth * params.nchannels)
        durations[index] += silence_frames / params.framerate
    (output / "voice-list.txt").write_text("".join(f"file 'voice-{i}.wav'\n" for i in range(4)))
    run("ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(output / "voice-list.txt"),
        "-af", "loudnorm=I=-16:TP=-1.5:LRA=11,apad", "-t", "15", "-ar", "48000", str(output / "narration.wav"))
    # Only resize the complete photo. All text is outside its square region.
    filters = ["[1:v]scale=880:880:force_original_aspect_ratio=decrease[photo]",
               "[0:v][photo]overlay=(W-w)/2:500[base]"]
    font = runtime / "NotoSansJP.ttf"
    texts = [("PR / 楽天アフィリエイト", 80, 30, "#58606b", None),
             ("ソニック  カドノオモクリップ", 1460, 43, "#202735", None),
             ("SP-1667  ・  重り付きクリップ", 1540, 32, "#58606b", None),
             ("VOICEVOX:ずんだもん", 1770, 27, "#58606b", None)]
    start = 0.0
    timing = []
    for i, (_, caption) in enumerate(scenes):
        end = start + durations[i] if i < 3 else 15.0
        texts.append((caption, 235, 58, "#202735", (start, end)))
        timing.append({"start": round(start, 3), "end": round(end, 3), "caption": caption, "speech": scenes[i][0]})
        start = end
    last = "base"
    for i, (text, y, size, color, window) in enumerate(texts):
        textfile = output / f"caption-{i}.txt"
        textfile.write_text(text, encoding="utf-8")
        enable = f":enable='gte(t,{window[0]})*lt(t,{window[1]})'" if window else ""
        label = f"text{i}"
        filters.append(f"[{last}]drawtext=fontfile='{font}':textfile='{textfile}':expansion=none:fontsize={size}:fontcolor={color}:x=(w-text_w)/2:y={y}:line_spacing=20{enable}[{label}]")
        last = label
    video = output / "clip-photo-preview.mp4"
    run("ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=0xf7f6f2:s=1080x1920:r=30:d=15",
        "-loop", "1", "-i", str(image), "-i", str(output / "narration.wav"),
        "-filter_complex", ";".join(filters), "-map", f"[{last}]", "-map", "2:a:0", "-t", "15",
        "-c:v", "libx264", "-threads", "2", "-preset", "fast", "-crf", "20", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(video))
    probe = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(video)]))
    video_stream = next(s for s in probe["streams"] if s["codec_type"] == "video")
    assert (video_stream["width"], video_stream["height"]) == (1080, 1920)
    assert abs(float(probe["format"]["duration"]) - 15) < 0.1
    assert any(s["codec_type"] == "audio" for s in probe["streams"])
    metadata = {"status": "PRIVATE_PREVIEW", "publicUpload": False, "rightsVerified": False,
                "rightsSource": args.source_description,
                "sourcePhotoSha256": hashlib.sha256(image.read_bytes()).hexdigest(),
                "videoSha256": hashlib.sha256(video.read_bytes()).hexdigest(),
                "voiceCredit": "VOICEVOX:ずんだもん", "voiceStyleId": style, "voiceSpeed": speed, "scenes": timing,
                "width": 1080, "height": 1920, "duration": 15}
    (output / "preview-report.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2))
    (output / "youtube-description.txt").write_text("【PR】楽天アフィリエイト\nソニック カドノオモクリップ SP-1667。\n楽天への商品リンクはプロフィールの商品紹介ページから。\nhttps://jinsei-no-sitsu.quality-life.workers.dev/#product-003\n音声：VOICEVOX:ずんだもん\n\n未公開の確認用動画。素材の公開条件と最終映像を確認してから公開する。\n")
    print(json.dumps(metadata, ensure_ascii=False))


if __name__ == "__main__":
    main()
