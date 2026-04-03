import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  'https://lllwfhcigtbetlcwzbnw.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsbHdmaGNpZ3RiZXRsY3d6Ym53Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE0NTMyNCwiZXhwIjoyMDkwNzIxMzI0fQ.CQZX39cMi6WszDQ5C_jTYg2BnFWkFWNAZszwbxHygOc'
)

async function run() {
  const p = await sb.from('profiles').select('id, workspace_id, telegram_user_id')
  const a = await sb.from('telegram_accounts').select('id, workspace_id, label, telegram_username')
  const cl = await sb.from('campaign_leads').select('id, next_due_at, status, next_step_order')
  const t = await sb.from('send_tasks').select('id, status, due_at')

  console.log('Profiles:', JSON.stringify(p.data))
  console.log('Accounts:', JSON.stringify(a.data))
  console.log('Campaign Leads:', JSON.stringify(cl.data))
  console.log('Tasks:', JSON.stringify(t.data))
}

run()
