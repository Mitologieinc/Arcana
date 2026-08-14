# CF Bible

Notion の席課金なしで、自社の Cloudflare アカウントに載せるチーム Wiki。人数が増えてもアプリ側の課金は増えません。払うのは Workers / D1 / Durable Objects / R2 の従量だけです。

## できること

- ページ・ネスト・ブロック編集（見出し、リスト、ToDo、コード、画像）
- サイドバーのページツリーと全文検索
- データベース（テーブル / カンバン、フィルタ）
- 同時編集（Yjs + Durable Objects）
- 招待制ワークスペース、ページ権限、リンク共有
- パスキー（WebAuthn）ログイン
- メンバー数の上限なし（ゲストも席として数えない）

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

ブラウザで http://localhost:5173 を開き、初回はセットアップ画面からオーナーを作成します。

## デプロイ

```bash
npx wrangler d1 create cf-bible
npx wrangler r2 bucket create cf-bible-files
```

返ってきた D1 の `database_id` を `wrangler.jsonc` に書き、続けて:

```bash
npx wrangler secret put BETTER_AUTH_SECRET
npm run db:migrate:remote
npm run deploy
```

任意で本番 URL を `BETTER_AUTH_URL` にしても構いません（未設定ならリクエストの Origin を使います）。

## 構成

- Worker + 静的アセット（Vite / React / Hono）
- D1: ユーザー、ページツリー、権限、検索インデックス
- Durable Objects: ページ本文の Yjs 同時編集
- R2: 画像アップロード
