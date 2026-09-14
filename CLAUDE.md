# YUマーケット (akatuki)

公開先: https://nihiro0714.github.io/akatuki/ （GitHub Pages、`docs/` 配下を配信）
画面は `docs/app.js` のハッシュルーター（`#/login` など）で切り替えている。

## Supabase Auth を入れるときに必ず守ること

### 1. 確認メールのリンクの戻り先
- Supabase ダッシュボードの Authentication → URL Configuration で **Site URL を `https://nihiro0714.github.io/akatuki/` にする**。既定の `http://localhost:3000` のままだと、確認メールのリンクが localhost に飛ぶ。
- 同じ URL を Redirect URLs にも入れておき、`signUp` の `options.emailRedirectTo` でも同じ URL を指定する。

### 2. ハッシュルーターとの衝突
- 確認リンクから戻ると、URL に `#access_token=...` や `?code=...` が付いた状態でページが開く。
- 今の `route()` はこれを未知のハッシュとして `#/login` へ書き換えるので、先に走ると supabase-js がトークンを読めず認証が完了しない。
- **起動時は `await supabase.auth.getSession()` でセッション取得（トークンの取り込み）を終えてから、`route()` / `go()` を呼ぶ順序にする。** `hashchange` の購読もその後に登録する。
- ログイン判定は localStorage の `store.session()` ではなく、Supabase のセッションを基準にする。
