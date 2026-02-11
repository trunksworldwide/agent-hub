-- Fix 4: Unique constraint on chat_delivery_queue (message_id, target_agent_key)
-- First remove any existing duplicates (keep newest per pair)
DELETE FROM public.chat_delivery_queue a
USING public.chat_delivery_queue b
WHERE a.message_id = b.message_id
  AND a.target_agent_key = b.target_agent_key
  AND a.created_at < b.created_at;

-- Add unique constraint
ALTER TABLE public.chat_delivery_queue
  ADD CONSTRAINT uq_chat_delivery_message_agent
  UNIQUE (message_id, target_agent_key);