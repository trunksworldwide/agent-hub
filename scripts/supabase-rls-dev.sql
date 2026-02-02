-- Dev-only RLS policies to unblock Lovable (anon key).
-- Tighten later by requiring authenticated users.

-- projects
alter table if exists public.projects enable row level security;
drop policy if exists projects_select_anon on public.projects;
create policy projects_select_anon on public.projects for select to anon using (true);
drop policy if exists projects_write_anon on public.projects;
create policy projects_write_anon on public.projects for all to anon using (true) with check (true);

-- agents
alter table if exists public.agents enable row level security;
drop policy if exists agents_select_anon on public.agents;
create policy agents_select_anon on public.agents for select to anon using (true);
drop policy if exists agents_write_anon on public.agents;
create policy agents_write_anon on public.agents for all to anon using (true) with check (true);

-- tasks
alter table if exists public.tasks enable row level security;
drop policy if exists tasks_select_anon on public.tasks;
create policy tasks_select_anon on public.tasks for select to anon using (true);
drop policy if exists tasks_insert_anon on public.tasks;
create policy tasks_insert_anon on public.tasks for insert to anon with check (true);
drop policy if exists tasks_update_anon on public.tasks;
create policy tasks_update_anon on public.tasks for update to anon using (true) with check (true);
drop policy if exists tasks_delete_anon on public.tasks;
create policy tasks_delete_anon on public.tasks for delete to anon using (true);

-- activities
alter table if exists public.activities enable row level security;
drop policy if exists activities_select_anon on public.activities;
create policy activities_select_anon on public.activities for select to anon using (true);
drop policy if exists activities_insert_anon on public.activities;
create policy activities_insert_anon on public.activities for insert to anon with check (true);

-- agent_status (optional)
alter table if exists public.agent_status enable row level security;
drop policy if exists agent_status_select_anon on public.agent_status;
create policy agent_status_select_anon on public.agent_status for select to anon using (true);
drop policy if exists agent_status_write_anon on public.agent_status;
create policy agent_status_write_anon on public.agent_status for all to anon using (true) with check (true);
