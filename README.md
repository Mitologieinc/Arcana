# Arcana

Notion の席課金なしで、自社の Cloudflare アカウントに載せるチーム Wiki。人数が増えてもアプリ側の課金は増えません。払うのは Workers / D1 / Durable Objects / R2 の従量だけです。

## できること

- ページ・ネスト・ブロック編集（見出し、リスト、ToDo、コード、画像）
- サイドバーのページツリーと全文検索
- データベース（テーブル / カンバン、フィルタ）
- 同時編集（Yjs + Durable Objects）
- メンバー登録、ページ権限、リンク共有
- パスキー（WebAuthn）ログイン
- メンバー数の上限なし（ゲストも席として数えない）

## 環境の切り方

**1 環境 = 1 Worker + 1 D1 + 1 R2 + 1 Durable Object 名前空間。** staging と production で同じ DB / バケットを共有しません。

| 環境 | Worker | D1 | R2 |
| --- | --- | --- | --- |
| ローカル（`npm run dev`） | `cf-bible` | `cf-bible` | `cf-bible-files` |
| staging | `cf-bible-staging` | `cf-bible-staging` | `cf-bible-files-staging` |
| production | `cf-bible-production` | `cf-bible-production` | `cf-bible-files-production` |

`wrangler.jsonc` の `database_id` はプレースホルダです。実デプロイ前に各環境の ID へ差し替えてください。

## アカウント

1 環境は 1 社なので、その URL に届いた人は `/signup` からそのまま登録できます。招待コードは不要です。

- ワークスペースがまだない → 最初のユーザーがオーナーになり、ワークスペースを作る
- すでにワークスペースがある → 新しいアカウントは member として参加する
- 設定から発行した招待リンク（`/signup?invite=<token>`）は、メールと役割を先に決める任意の近道

古い `/setup` と `/invite/:token` は `/signup` にリダイレクトします。インスタンスをインターネットに出す場合は、Cloudflare Access などで手前を守ってください。

## 必要環境

- Node.js 22+
- Cloudflare アカウント（デプロイ時）

## ローカル

```bash
cp .dev.vars.example .dev.vars
# .dev.vars の BETTER_AUTH_SECRET を openssl rand -base64 32 の値に置き換え
npm install
npx wrangler types
npm run db:migrate:local
npm run dev
```

ブラウザで http://localhost:5173 を開き、ログイン画面の「アカウントを作成」から始めます。

## デプロイ

環境ごとにリソースを作り、返ってきた D1 の `database_id` を `wrangler.jsonc` の該当 `env` に書きます。

```bash
# staging
npx wrangler d1 create cf-bible-staging
npx wrangler r2 bucket create cf-bible-files-staging
npx wrangler secret put BETTER_AUTH_SECRET --env staging
npm run db:migrate:staging
npm run deploy:staging

# production
npx wrangler d1 create cf-bible-production
npx wrangler r2 bucket create cf-bible-files-production
npx wrangler secret put BETTER_AUTH_SECRET --env production
npm run db:migrate:production
npm run deploy:production
```

`npm run deploy` は production 向けです。任意で本番 URL を `BETTER_AUTH_URL` にしても構いません（未設定ならリクエストの Origin を使います）。

## 構成

- Worker + 静的アセット（Vite / React / Hono）
- D1: ユーザー、ページツリー、権限、検索インデックス
- Durable Objects: ページ本文の Yjs 同時編集
- R2: 画像アップロード
