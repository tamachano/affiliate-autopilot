# v1.3 レビュー起点企画 + 無料のリンク自動生成

## 動画制作のルール
- ナレーションはメリットを中心に、視聴者の共感→価値→プロフィール誘導の15秒構成。
- 詳細注記は「※商品の詳細・対応条件は販売ページをご確認ください。」（必要な場合に読める大きさで表示）。
- 安全性や購入判断に重要な制約は小さい注記だけにしない。購入経験を偽らない。事実以上の宣伝をしない。
- レビュー内容は独自の表現に再構成。レビュー文章の転載・禁止された自動スクレイピングはしない。

## Amazonアソシエイトリンク
1. `data/affiliate.settings.json` に `amazonTrackingId` が設定済み（公開用の識別子であり秘密鍵ではありません）。
2. `data/hub.products.json` に商品 `asin` または `amazonProductUrl` を設定する。
3. `destinationVerified:true` は、Amazonのページを実際に開いて商品名・型番・購入先を確認した場合のみ指定する。
4. `npm run links:check` でリンク生成結果を確認。
5. `npm run hub:build` で公開商品リストを生成（未確認リンクはサイトに出さない）。
6. `npm run hub:publish` で手動の公開指示時だけCloudflareへデプロイ。

Amazon公式のシンプルなテキストリンク形式を利用：`https://www.amazon.co.jp/dp/ASIN/ref=nosim?tag=trackingId`。
https://affiliate.amazon.co.jp/help/topic/t5/a3

**制限**：Amazon内を商品名で検索するAPI連携・レビュー収集・商品の存在確認・在庫や価格更新は未実装。商品名をもとにASINを推測せず、ASIN確定と商品一致確認までは公開を保留。Google/YouTube/Cloudflare認証設定は変更していません。
