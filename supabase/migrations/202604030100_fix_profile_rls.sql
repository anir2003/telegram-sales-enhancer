-- Allow users to read their own profile even before joining an organization.
-- Without this, new users with workspace_id = NULL are invisible to themselves
-- because the existing policy checks workspace_id = requesting_workspace_id()
-- and NULL = NULL evaluates to false in SQL.

create policy "profiles read self" on public.profiles
for select using (id = auth.uid());
