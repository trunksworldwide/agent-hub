
-- Phase 0A: Fix Realtime Publication for all tables subscribed in the client
-- Uses idempotent DO block pattern to avoid errors if already added

DO $$
DECLARE
  tbl text;
  tbls text[] := ARRAY[
    'activities',
    'agents',
    'agent_status',
    'tasks',
    'task_comments',
    'task_outputs',
    'project_chat_messages',
    'project_chat_threads',
    'cron_job_patch_requests',
    'cron_create_requests',
    'cron_delete_requests',
    'agent_provision_requests',
    'skills_mirror',
    'channels_mirror',
    'project_settings'
  ];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    END IF;
  END LOOP;
END $$;
