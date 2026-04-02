insert into public.workspaces (name, slug, timezone)
values ('Primary Workspace', 'primary-workspace', 'UTC')
on conflict (slug) do nothing;
