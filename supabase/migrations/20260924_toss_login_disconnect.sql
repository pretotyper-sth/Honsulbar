create table if not exists public.toss_login_links (
  user_key text primary key,
  is_connected boolean not null default true,
  connected_at timestamptz not null default now(),
  disconnected_at timestamptz
);

alter table public.toss_login_links enable row level security;
revoke all on public.toss_login_links from anon, authenticated;

create or replace function public.apply_toss_login_disconnect(p_user_key text, p_action text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_key !~ '^[0-9]{1,30}$' or p_user_key = '0' then
    raise exception 'Invalid user key';
  end if;

  if p_action = 'unlink' then
    insert into public.toss_login_links (user_key, is_connected, disconnected_at)
    values (p_user_key, false, now())
    on conflict (user_key) do update
      set is_connected = false, disconnected_at = now();
  elsif p_action = 'withdraw' then
    delete from public.toss_login_links where user_key = p_user_key;
  else
    raise exception 'Invalid action';
  end if;
end;
$$;

revoke all on function public.apply_toss_login_disconnect(text, text) from public, anon, authenticated;
grant execute on function public.apply_toss_login_disconnect(text, text) to service_role;
