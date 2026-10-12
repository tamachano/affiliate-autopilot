# Affiliate AutoPilot | product hub auto-publish

今ある3商品を引き継いだCloudflare Workers用の紹介サイトです。

## 通常運用（あなたは商品を入力しない）

一度だけ、このフォルダをGitHubのプライベートリポジトリのmainブランチに置き、CloudflareのActions Secretsを設定します。
その後、ChatGPTへ商品のアフィリエイトリンクを送るだけ。接続されたGitHubアプリ経由でChatGPTが `data/products.json` を更新し、mainへ反映できれば、GitHub Actionsが公開まで自動実行します。
**このZIP単体ではChatGPTとGitHubの書き込み連携はできません。** GitHubアプリの接続と、最初のリポジトリ作成・Secrets設定は必要です。

### GitHub Actions Secrets（初回のみ）
- `CLOUDFLARE_API_TOKEN` : Cloudflare Workers Scripts のデプロイ可能な権限を持つAPIトークン。必要最小権限に限定する。
- `CLOUDFLARE_ACCOUNT_ID` : CloudflareアカウントID。

SecretsはChatGPTに貼り付けないでください。GitHubの Settings → Secrets and variables → Actions に設定します。

GitHub Actionsのログが成功になり、公開サイトの3商品が変わらないことを最初に確認してください。

## ローカルの生成・検証
```
node scripts/build.cjs
```

商品情報の唯一の正本は `data/products.json`。`public/products.js` は自動生成です。
今の3件は、もぐもぐズー・ミニバッグシーラー・カドノオモクリップです。

公開先: https://jinsei-no-sitsu.quality-life.workers.dev/

### 大事なこと
- ユーザーがCloudflareへの自動公開を許可・接続しない限り、ChatGPTから勝手にデプロイすることはできません。
- 楽天の商品画像のShortsへの使用許諾はこの仕組みでは解決しません。
- 商品URLの正当性や紹介文はレビューしてからcommitします。
- 商品画像を直接転載する実装は含めていません。
