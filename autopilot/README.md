# Affiliate AutoPilot v1.4 — GitHub / Cloudflare integration

v1.3の既存ソースを引き継ぎ、1商品企画・GitHubでの制作依頼・商品ページとの連携を追加しました。現在の運用は [INTEGRATION.md](INTEGRATION.md) を参照してください。以下は既存ローカル機能の説明です。

**統合実装版（未接続機能を含む完成版ではありません）。** v0.5.1からの段階的な更新を一つに統合した、ローカル開発環境用のプレビューです。

## 起動
Windows PowerShell / Node.js 22以降:
```powershell
npm install
npm run dev
```
`http://localhost:4317` を開いてください。既存の `.env` と `db/` は新しいフォルダに移行してください。

## 何ができるか
- 既存の候補商品からスコアリングと3商品の企画作成
- Supervisor / Humanizerの最大3ラウンド改善と履歴保存
- CTAを音声と画面字幕で別管理
- 商品仕様と素材権利の公開ゲート
- `output/<run>/asset-manifest.json` の素材証拠・実ファイル検査
- `media/cut-1.mp4`, `cut-2.mp4`, `cut-3.mp4` があり、広告利用権利が確認済みで、ffmpegが利用できる環境なら、**無音・字幕なし**の縦型15秒ドラフトを作成
- ユーザー提供のレビュー傾向メモから悩みの抽出と言い換えフック候補生成（**実在レビューの自動収集ではない**）
- YouTube既存連携からのAnalytics読取・手動CV入力・次の1変数仮説作成
- 接続済み/未実装の一覧表示

## 大事な制限
**未接続**：ライブの商品探索、レビュー本文の自動取得、商用利用許可の自動確認、日本語TTS、字幕焼き込み、YouTubeの自動投稿、Affiliate成約情報の自動収集。
動画ドラフトは公開用の完成動画ではありません。権利、広告表示、字幕、音声、導線、商品仕様を別途確認してください。`asset-manifest.json` の許諾欄はユーザーの証拠による自己申告であり、第三者権利をシステムが保証するものではありません。

## 素材の置き方
`/api/run` の実行後に `output/<run>/asset-manifest.json` を確認。`media/` に自分で撮影したmp4動画など、広告利用に必要な権利を確保した映像を配置します。各 `evidenceUrl`, `allowCommercialVideo`, `allowAffiliateAdvertising` を真実に即して更新してください。適当な商品画像転載はNG。

## AIレビュー
OpenAI API利用はオプション。`.env` の `OPENAI_API_KEY` と `OPENAI_SUPERVISOR_MODEL` でモデルレビューを追加可能（ChatGPT有料プランとは別料金）。キー未設定時はローカルルールで動作します。

## 今後Gitで更新
`init-git.ps1` でローカルGitリポジトリを初期化できます。`git pull`には別途リモートリポジトリの登録が必要です。`db/` `.env` `output/` と `node_modules/` はコミットしないでください。

## Supervisor判定の修正

企画レビューと公開判定を分離しました。素材権利が未確認のときは、企画が良ければ `creativeVerdict: GO`、素材は `assetStatus: ASSET_PENDING`、公開は `publishVerdict: BLOCKED` となります。素材が未確認の状態を理由に、企画レビューを永久STOPしません。ただし公開ゲートを回避することはできません。


## 商品紹介ページ (MVP)

`npm run hub:build` はリポジトリ直下の `data/products.json` から既存の商品紹介ページを生成します。公開はGitHub Actionsが担当します。旧バージョンの別Cloudflare設定・別商品リストは使用しません。

## v1.3 レビュー動画の方針とリンク自動生成
`REVIEW-PILOT.md` を参照。既知のASINまたはAmazon商品URLから公式のテキストリンク形式を生成します。自動でAmazonの商品検索・在庫確認・レビュー収集を行う機能ではありません。リンク先の確認は人間が行い、`destinationVerified:true` の商品だけ購入ボタンを表示します。
