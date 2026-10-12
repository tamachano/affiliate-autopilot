# 実物写真・日本語音声・字幕の確認用動画

2026-10-12、ユーザー提供のカドノオモクリップ商品写真①で実際にレンダリング。
15秒、1080×1920、H.264、AAC音声のMP4を生成し、ffprobeと抽出フレームで確認した。
VOICEVOX:ずんだもん（ノーマル）をローカルCPUで実行。外部の有料音声APIは使わない。

## 入口

- `scripts/setup-photo-runtime.py`: Linux x64 / Python 3.12以降向けの無料ランタイム準備。
- `scripts/render-photo-short.py`: 元画像、ランタイム、出力先から確認用MP4を生成。
- FFmpeg / ffprobeが必要。字幕と音声原稿は現在カドノオモクリップ用。
- 元画像全体を比率を保って拡大し、文字は画像領域の外に配置。合成した実演はない。
- 音声を途中で切らず、各発話後の無音で15秒に合わせる。
- 200×200の元画像のため、大画面では写真がぼやける。高解像度素材の確認は未完了。

## 公開と権利

`preview-report.json`は常に `PRIVATE_PREVIEW` / `rightsVerified:false`。
画像が楽天アフィリエイトのリンク作成画面から取得されたことはユーザーが確認した。
取得元の確認だけで、写真の個別条件を満たしたと判断しない。
楽天のガイドラインは、画像に直接文字や装飾を加える加工・切り抜き、
創作性のある写真や独自デザイン等について制限を定めている。
説明入り画像②③はこのプレビューに使用していない。

- https://affiliate.rakuten.co.jp/guideline/rule/
- https://voicevox.hiroshiba.jp/term/
- https://zunko.jp/con_ongen_kiyaku.html
- https://www.sonic-s.co.jp/product/sp-1667

VOICEVOXのクレジットは動画と概要欄案に含む。
このスクリプトはYouTubeへのアップロードも、商品ページへの反映も行わない。
既存キャンペーンの素材許諾・最終映像・公開済みYouTube動画の確認ゲートは維持する。
GitHub Actionsのキャンペーンには、この写真レンダラーをまだ接続していない。
