-- YUマーケット Supabase スキーマ
-- Supabase の SQL Editor で上から順に実行する。

-- ========== テーブル ==========
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null default '', faculty text not null default '', campus text not null default '',
  photo_url text,
  created_at timestamptz not null default now()
);
create table listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  category text, color text, condition text, period text, pickup text, campus text,
  description text not null default '', photo_url text,
  status text not null default 'open' check (status in ('open', 'reserved', 'done', 'cancelled')),
  created_at timestamptz not null default now()
);
create table applications (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  applicant_id uuid not null references profiles(id) on delete cascade,
  date text, place text, message text,
  status text not null default '申込中' check (status in ('申込中', '取引中', '取引完了', '取消')),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index on listings (owner_id);
create index on applications (listing_id);
create index on applications (applicant_id);
-- 同じ出品に同じ人が二重に申し込めない（取消後の再申込は可）
create unique index one_active_application
  on applications (listing_id, applicant_id)
  where status in ('申込中', '取引中');

-- ========== RLS ==========
alter table profiles enable row level security;
alter table listings enable row level security;
alter table applications enable row level security;

create policy "read profiles" on profiles for select to authenticated using (true);
create policy "update own profile" on profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "read listings" on listings for select to authenticated using (true);
create policy "own listings" on listings for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

create policy "read my applications" on applications for select to authenticated
  using ((select auth.uid()) = applicant_id
      or (select auth.uid()) = (select owner_id from listings where id = listing_id));
-- status は '申込中' でしか作れない（承認前に counterpart_email で連絡先を取られないように）
create policy "apply" on applications for insert to authenticated
  with check ((select auth.uid()) = applicant_id
      and status = '申込中' and completed_at is null
      and exists (select 1 from listings l
                  where l.id = listing_id and l.status = 'open'
                    and l.owner_id <> (select auth.uid())));
create policy "update my applications" on applications for update to authenticated
  using ((select auth.uid()) = applicant_id
      or (select auth.uid()) = (select owner_id from listings where id = listing_id))
  with check ((select auth.uid()) = applicant_id
      or (select auth.uid()) = (select owner_id from listings where id = listing_id));
-- クライアントから直接更新できる列は date, place のみ。status は RPC 経由のみ
revoke update on applications from anon, authenticated;
grant update (date, place) on applications to authenticated;

-- ========== 登録時: ドメイン制限 + profiles 自動作成 ==========
create or replace function public.on_auth_user_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(new.email, '') !~* '@yamaguchi-u\.ac\.jp$' then
    raise exception 'university email only';
  end if;
  insert into public.profiles (id) values (new.id);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.on_auth_user_created();

-- ========== RPC: 相手の連絡先（当事者かつ取引中/完了のときだけ） ==========
create or replace function public.counterpart_email(app_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare a record; me uuid := (select auth.uid()); result text;
begin
  select ap.applicant_id, l.owner_id, ap.status into a
  from public.applications ap join public.listings l on l.id = ap.listing_id
  where ap.id = app_id;
  if not found or a.status not in ('取引中', '取引完了') then return null; end if;
  if me = a.owner_id then
    select email into result from auth.users where id = a.applicant_id;
  elsif me = a.applicant_id then
    select email into result from auth.users where id = a.owner_id;
  else
    return null;
  end if;
  return result;
end $$;

-- ========== RPC: 承認（出品者のみ） ==========
create or replace function public.approve_application(app_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare lid uuid; oid uuid;
begin
  select ap.listing_id, l.owner_id into lid, oid
  from public.applications ap join public.listings l on l.id = ap.listing_id
  where ap.id = app_id and ap.status = '申込中' and l.status = 'open';
  if not found or oid <> (select auth.uid()) then raise exception 'not allowed'; end if;
  update public.applications set status = '取引中' where id = app_id;
  update public.applications set status = '取消'
    where listing_id = lid and id <> app_id and status = '申込中';
  update public.listings set status = 'reserved' where id = lid;
end $$;

-- ========== RPC: 受け渡し完了（出品者のみ） ==========
create or replace function public.complete_application(app_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare lid uuid; oid uuid;
begin
  select ap.listing_id, l.owner_id into lid, oid
  from public.applications ap join public.listings l on l.id = ap.listing_id
  where ap.id = app_id and ap.status = '取引中';
  if not found or oid <> (select auth.uid()) then raise exception 'not allowed'; end if;
  update public.applications set status = '取引完了', completed_at = now() where id = app_id;
  update public.listings set status = 'done' where id = lid;
end $$;

-- ========== RPC: 取消（当事者のどちらか） ==========
create or replace function public.cancel_application(app_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare lid uuid; oid uuid; aid uuid; st text; me uuid := (select auth.uid());
begin
  select ap.listing_id, l.owner_id, ap.applicant_id, ap.status into lid, oid, aid, st
  from public.applications ap join public.listings l on l.id = ap.listing_id
  where ap.id = app_id;
  if not found or st not in ('申込中', '取引中') or (me <> oid and me <> aid) then
    raise exception 'not allowed';
  end if;
  update public.applications set status = '取消' where id = app_id;
  if st = '取引中' then
    update public.listings set status = 'open' where id = lid;
  end if;
end $$;

revoke execute on function public.counterpart_email(uuid) from public, anon;
revoke execute on function public.approve_application(uuid) from public, anon;
revoke execute on function public.complete_application(uuid) from public, anon;
revoke execute on function public.cancel_application(uuid) from public, anon;
grant execute on function public.counterpart_email(uuid) to authenticated;
grant execute on function public.approve_application(uuid) to authenticated;
grant execute on function public.complete_application(uuid) to authenticated;
grant execute on function public.cancel_application(uuid) to authenticated;

-- ========== Storage: 写真 ==========
insert into storage.buckets (id, name, public) values ('photos', 'photos', true);
create policy "photos read" on storage.objects for select using (bucket_id = 'photos');
create policy "photos upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text);
-- 出品を取り消すと行ごと削除するので、写真も消せるようにする
create policy "photos delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text);
