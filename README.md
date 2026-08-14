# Arcana

Notion の席課金なしで、自社の Cloudflare アカウントに載せるチーム Wiki。人数が増えてもアプリ側の課金は増えません。払うのは Workers / D1 / Durable Objects / R2 の従量だけです。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Mitologieinc/Arcana)

ボタンを押すと、Git 連携・D1・R2・Durable Objects の作成・マイグレーション・デプロイまでまとめて走ります。認証用の `BETTER_AUTH_SECRET` も初回デプロイで自動発行します。終わったら `*.workers.dev` を開き、初期設定画面からオーナーを作ってください。

## できること

- ページ・ネスト・ブロック編集（見出し、リスト、ToDo、コード、画像）
- サイドバーのページツリーと全文検索
- データベース（テーブル / カンバン / カレンダー / ギャラリー）
- 同時編集（Yjs + Durable Objects）
- メンバー登録、ページ権限、リンク共有
- パスキー（WebAuthn）ログイン
- メンバー数の上限なし（ゲストも席として数えない）

## 環境の切り方

**1 環境 = 1 Worker + 1 D1 + 1 R2 + 1 Durable Object 名前空間。** staging と production で同じ DB / バケットを共有しません。

| 環境 | Worker | D1 | R2 |
| --- | --- | --- | --- |
| ワンタップ / デフォルト | `arcana` | `arcana` | `arcana-files` |
| ローカル（`npm run dev`） | `arcana` | `arcana` | `arcana-files` |
| staging | `arcana-staging` | `arcana-staging` | `arcana-files-staging` |
| production（名前付き env） | `arcana-production` | `arcana-production` | `arcana-files-production` |

## アカウント

1 環境は 1 社です。空の環境は `/setup` でワークスペースとオーナーを作ります。招待コードは不要です。

- ワークスペースがまだない → `/setup` で最初の人がオーナーになる
- すでにワークスペースがある → `/signup` から member として参加する
- 設定から発行した招待リンク（`/signup?invite=<token>`）は、メールと役割を先に決める任意の近道

インスタンスをインターネットに出す場合は、Cloudflare Access などで手前を守ってください。

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

ブラウザで http://localhost:5173 を開き、初期設定画面から始めます。

## CLI から出す場合

ワンタップと同じく、リソース作成・秘密鍵・マイグレーションは `npm run deploy` がやります。

```bash
npx wrangler login
npm run deploy
```

staging / 名前付き production に出すときだけ:

```bash
npm run deploy:staging
npm run deploy:production
```

任意で本番 URL を `BETTER_AUTH_URL` にしても構いません（未設定ならリクエストの Origin を使います）。

## 構成

- Worker + 静的アセット（Vite / React / Hono）
- D1: ユーザー、ページツリー、権限、検索インデックス
- Durable Objects: ページ本文の Yjs 同時編集
- R2: 画像アップロード
