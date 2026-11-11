# 大会注文管理

React / TypeScript / Express / tRPC / Drizzle / MySQL の注文管理アプリです。

## 主な機能
- 注文登録、保存済み注文の検索・受け渡し管理・印刷
- 商品ごとの刺繍指定、1〜32番の色選択
- 刺繍見本画像の拡大・縮小（タッチピンチ、マウスホイール、ドラッグ移動）
- 管理者とスタッフの個別メールアドレス・パスワード認証
- 管理者によるスタッフ追加・利用停止
- 注文APIと刺繍見本画像をサーバー側認証で保護

## 開発
- `pnpm install`
- `.env` に `DATABASE_URL`、`AUTH_SESSION_SECRET`、`INITIAL_ADMIN_SETUP_KEY` を設定
- `pnpm db:migrate`
- `pnpm dev`

## 公開
GitHub Pagesではなく、Docker対応のRender Web Service等にデプロイします。詳しくは `DEPLOY_RENDER.md` を参照してください。

初期管理者メールアドレスは `hs.0319yu@gmail.com` です。初期登録時に、Renderの環境変数 `INITIAL_ADMIN_SETUP_KEY` と一致するキー、および12文字以上のパスワードを入力します。初期登録後はセットアップキーをホスティング環境から削除してください。

## セキュリティ上の注意
- GitHubリポジトリはPrivateにしてください。
- `.env`、DB接続文字列、秘密鍵、スタッフパスワードをGitHubへコミットしないでください。
- Renderが発行するURLはインターネットから到達可能ですが、注文画面・注文API・刺繍見本画像はスタッフ認証が必要です。
- 既存注文データがある場合、DB移行前に必ずバックアップを取ってください。
- AIメモ解析は既存のManus LLM接続設定に依存します。別ホスティング環境ではAI接続情報を別途設定しない限り利用できない場合があります。
