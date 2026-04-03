import { config } from 'dotenv';
config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function test() {
  const payload = {
    name: 'CLI Test',
    description: null,
    start_date: null,
    end_date: null,
    timezone: 'UTC',
    send_window_start: '09:00',
    send_window_end: '18:00',
    workspace_id: '123e4567-e89b-12d3-a456-426614174000', // valid uuid
    created_by: '123e4567-e89b-12d3-a456-426614174000',
  };

  const { data, error } = await supabase.from('campaigns').insert(payload).select('*').single();
  console.log('Result:', { data, error });
}
test();
