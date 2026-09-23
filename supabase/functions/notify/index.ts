// 申し込みと承認をメールで知らせる。Supabase の Database Webhook（applications の
// INSERT / UPDATE）から呼ばれる。外部ライブラリは使わず、REST API を fetch で叩く。
//
// 必要な環境変数（Edge Functions の Secrets に設定する）:
//   BREVO_API_KEY   Brevo の API キー
//   SENDER_EMAIL    Brevo で認証した送信元アドレス
//   SENDER_NAME     差出人の表示名（省略時は YUマーケット）
//   SITE_URL        サイトの URL（省略時は公開先）
//   WEBHOOK_SECRET  Webhook のヘッダーと突き合わせる合言葉
// SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY は Supabase が自動で入れる。

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY")!;
const SENDER_EMAIL = Deno.env.get("SENDER_EMAIL")!;
const SENDER_NAME = Deno.env.get("SENDER_NAME") ?? "YUマーケット";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://zennzai2007.github.io/akatuki/";
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET")!;

async function api(path: string) {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
}

async function emailOf(userId: string): Promise<string> {
  const user = await api(`/auth/v1/admin/users/${userId}`);
  return user.email;
}

async function listingOf(listingId: string) {
  const rows = await api(`/rest/v1/listings?id=eq.${listingId}&select=name,owner_id`);
  return rows[0];
}

async function send(to: string, subject: string, text: string) {
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": BREVO_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({
      sender: { name: SENDER_NAME, email: SENDER_EMAIL },
      to: [{ email: to }],
      subject,
      textContent: text,
    }),
  });
  if (!response.ok) throw new Error(`brevo: ${response.status} ${await response.text()}`);
}

const footer = `\n\nサイト: ${SITE_URL}\nこのメールは送信専用です。返信しても届きません。`;

Deno.serve(async (request) => {
  if (request.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) {
    return new Response("forbidden", { status: 403 });
  }

  try {
    const payload = await request.json();
    const record = payload.record;
    const before = payload.old_record;

    // 新しい申し込み → 出品者へ
    if (payload.type === "INSERT" && record?.status === "申込中") {
      const listing = await listingOf(record.listing_id);
      if (!listing) return new Response("no listing");
      await send(
        await emailOf(listing.owner_id),
        "【YUマーケット】新しい申し込みが届きました",
        `「${listing.name}」に新しい申し込みが届きました。\n` +
          `サイトの「取引」画面で内容を確認して、承認するか決めてください。` + footer,
      );
      return new Response("sent");
    }

    // 承認された → 申込者へ
    if (payload.type === "UPDATE" && before?.status === "申込中" && record?.status === "取引中") {
      const listing = await listingOf(record.listing_id);
      if (!listing) return new Response("no listing");
      await send(
        await emailOf(record.applicant_id),
        "【YUマーケット】申し込みが承認されました",
        `「${listing.name}」の申し込みが承認されました。\n` +
          `サイトの「取引」画面から、受け渡しの相談ができます。` + footer,
      );
      return new Response("sent");
    }

    return new Response("skipped");
  } catch (error) {
    console.error(error);
    return new Response("error", { status: 500 });
  }
});
