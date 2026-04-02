alter table public.workspaces
add column if not exists join_password_hash text;

alter table public.profiles
alter column workspace_id drop not null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, workspace_id, email, full_name, role)
  values (
    new.id,
    null,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    'member'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;
