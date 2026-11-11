# 大会注文管理 - 認証付き公開手順

## 重要
- GitHubリポジトリは **Private** にする。
- GitHub Pagesには公開しない。RenderのWeb Serviceとして実行する。
- Renderが発行する `onrender.com` URL自体はインターネットから到達可能です。「URLを知る人だけ」の非公開URLではありません。アプリの注文画面・注文API・刺繍見本画像はスタッフ認証で保護します。
- このアプリはMySQL互換DBを使用します。RenderのWeb ServiceだけではDBにならないため、外部MySQLを用意し、接続文字列を `DATABASE_URL` に登録してください。既存注文データを保持する場合は、現在のDBを確認し、必ずバックアップと移行計画を先に行ってください。

## 1. GitHub
1. GitHubで新しいPrivate repositoryを作成。
2. ZIPを展開し、プロジェクト一式をアップロード。
3. `.env`、パスワード、DB接続文字列は絶対にコミットしない（`.env.example` は見本）。

## 2. Render Web Service
- New > Web ServiceからPrivate GitHub repositoryを接続。
- Runtime: Docker（プロジェクトの `Dockerfile` を使用）
- Health Check Path: `/api/health`
- Renderの `PORT` 環境変数をアプリが自動使用します。

## 3. Render環境変数
以下をRenderのEnvironmentに設定する。
- `NODE_ENV` = `production`
- `STAFF_AUTH_ONLY` = `true`
- `DATABASE_URL` = 外部MySQLの接続URL
- `AUTH_SESSION_SECRET` = 32文字以上のランダムな秘密値
- `INITIAL_ADMIN_EMAIL` = `hs.0319yu@gmail.com`
- `INITIAL_ADMIN_SETUP_KEY` = 使い捨ての強いランダム文字列（初期管理者作成後に削除または変更）

秘密値の生成例: `openssl rand -hex 32`

## 4. データベース
Docker起動時に `pnpm db:migrate` を実行するようDockerfileへ設定済みです。起動のたびにマイグレーション確認を行い、適用済みのSQLは再実行されません。

既存注文データがあるDBを接続する場合は、必ずバックアップを取ってから実行する。今回のマイグレーションは `staff_accounts` テーブルを追加し、既存 `orders` テーブルは変更しない。

新規Aiven MySQLを使う場合、2026年11月時点では新規Free MySQLサービスの作成が停止されており、Developerプランは月額5米ドルから。料金とプランは契約前にAiven公式ページで確認する。

## 5. 最初の管理者登録
1. Renderが発行したHTTPS URLを開く。
2. 管理者名、初期設定キー、メール `hs.0319yu@gmail.com`、12文字以上のパスワードを入力。
3. 初期設定キーはRenderの環境変数 `INITIAL_ADMIN_SETUP_KEY` と同じ値。
4. 登録完了後、`INITIAL_ADMIN_SETUP_KEY` はRenderから削除する。

## 6. スタッフ追加
管理者でログインし「スタッフ管理」から名前、メールアドレス、初期パスワード（12文字以上）を登録する。退職・異動時は利用停止にする。

## セキュリティ仕様
- パスワードはscryptでハッシュ化して保存。
- セッションは署名付きJWT、HttpOnly/Secure/SameSite=Lax Cookie、12時間有効。
- ログイン失敗はIP・メール単位で15分間に8回までに制限（プロセス内制限）。
- 注文一覧・作成・受渡し変更はサーバー側で認証必須。
- `STAFF_AUTH_ONLY=true` の場合、テンプレートのOAuthログインにはフォールバックしない。

## 注意点
- Render無料Web Serviceは15分間アクセスがないと停止し、次のアクセスで起動に時間がかかるため、注文業務で常時利用する場合は有料インスタンスを推奨。
- 注文データのバックアップをDBサービス側で有効にする。
- 現在のAIメモ解析は既存のLLMプロバイダー設定に依存する。Renderへ移す場合、LLMの接続設定がないとAI解析だけ利用できない可能性がある。
- 公開前に、ログイン前の `/api/trpc/orders.list` が401相当で拒否されること、無効化したスタッフが再ログインできないことを確認する。
