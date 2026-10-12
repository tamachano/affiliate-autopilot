# Affiliate AutoPilot | product hub auto-publish

既存の Cloudflare Worker `jinsei-no-sitsu` に3商品の紹介サイトを自動公開します。

公開先: https://jinsei-no-sitsu.quality-life.workers.dev/
GitHub: https://github.com/tamachano/affiliate-autopilot

## 接続と検証の状態

2026-10-12、ChatGPTによる `data/products.json` の更新だけで以下を実行・確認しました。

- GitHub Actionsの起動、商品データの検証・ビルド。
- GitHub Secretsを使ったCloudflareへの公開。
- 本番のHTML・商品データ・表示スクリプト・アイコンの4ファイルがビルド結果と一致。
- ブラウザ上で3商品と更新した説明文を表示。
- 購入リンクのhref、Amazonアソシエイトtag、広告リンクのrel属性を確認。
- カドノオモクリップの楽天短縮リンクが同商品の楽天ビック販売ページに遷移。

成功した実行: https://github.com/tamachano/affiliate-autopilot/actions/runs/38238476448
検証対象コミット: `c025d3c6f37cdd0c23a9326652fdfe950e2887e9`

購入リンクの設定確認と、販売先の商品・在庫・利用条件の確認は別です。Amazonの商品ページへの遷移確認はこの初回検証には含みません。

## 通常運用

ユーザーがチャットで商品URLを共有し、AIが仕様・利用条件・販売先・アフィリエイト導線を確認して紹介文を作成します。
確認済みの商品情報を `data/products.json` にcommitすると、mainへのpushで公開と本番データ一致検証が自動実行されます。
ユーザーによる商品情報の手入力、ZIPの解凍、デプロイコマンド実行は不要です。

商品情報の唯一の正本は `data/products.json`。`public/products.js` はビルド生成物です。
商品画像・動画の利用許諾や権利調査は自動公開処理では解決しません。
Affiliate AutoPilot v1.3を引き継いだ本体は `autopilot/` で管理します。1商品・3商品の企画、Supervisor、素材ゲート、完成動画からの商品ページへの連携を追加しました。制作依頼は `data/campaigns/`、実行結果は `data/campaign-results/` に記録します。詳細は [autopilot/INTEGRATION.md](autopilot/INTEGRATION.md) を参照してください。

日本語TTS・字幕の焼き込み・YouTube自動投稿・成約情報の自動収集は未実装です。無音ドラフトは完成広告として扱いません。

## 認証と公開先

以下のRepository Actions Secretsは初回設定済みです。値はソースやチャットに記載しません。

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

`wrangler.jsonc` のWorker名を変更すると別の公開先になるため、既存名を維持してください。
公開は直列実行します。失敗時はActionsのどの段階が失敗したかを調べ、必要な修正だけを行います。
変更前の状態はGit履歴から確認できます。

## ローカル確認

```sh
node scripts/build.cjs
node scripts/verify-live.cjs
```

`verify-live.cjs` は、本番のファイル内容とローカルのpublic内の内容が一致した場合のみ成功します。
古いデータ・HTTPエラーは失敗となります。販売先の在庫や素材の利用許諾を判定する機能ではありません。

## 動画制作連携の実行確認（2026-10-12）

- 最新の制作依頼実行: https://github.com/tamachano/affiliate-autopilot/actions/runs/38242765455
- 本番サイトの公開・一致検証: https://github.com/tamachano/affiliate-autopilot/actions/runs/38242132311
- TypeScriptの型検査、4つの連携テスト、ローカルHTTPのhub-proposalエンドポイントを確認しました。
- カドノオモクリップの単品企画はGO。台本・絵コンテ・素材マニフェスト・実験ID・商品No.003へのリンクを自動生成し、結果をGitHubへ記録しました。
- 実商品の映像ファイルと広告利用許可は未確認です。完成動画およびYouTube公開先の確認も未完了のため、動画生成・この制作依頼からの商品ページ更新は実行していません。
- 許諾済み素材からの15秒・1080×1920ドラフト生成、確認済み完成動画からの商品ページ更新、改変動画・空マニフェスト・文字列権限フラグの拒否はテスト用の合成映像で検証済みです。合成映像は商品広告として提供・公開していません。
- 今後の入力はチャットの商品URL。調査した商品レコードと制作依頼はAIがGitHubへ登録する運用です。新しい動画の制作完了・自動投稿を意味するものではありません。
