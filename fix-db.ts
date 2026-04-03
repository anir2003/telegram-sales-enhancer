import { getAdminSupabaseClient } from './apps/web/lib/supabase/server'
import { config } from 'dotenv'
config({ path: '.env' })

async function run() {
  const sb = getAdminSupabaseClient()
  if (!sb) {
    console.log("No supabase client")
    return
  }

  // Fix campaign lead
  await sb.from('campaign_leads')
    .update({ status: 'sent_waiting_followup' })
    .eq('id', '61b498e2-2ac3-4357-8532-501baf849892')

  // Keep first sent task, delete all the pending duplicates for step 1
  const { data: dupes } = await sb.from('send_tasks')
    .select('id')
    .eq('campaign_lead_id', '61b498e2-2ac3-4357-8532-501baf849892')
    .eq('step_order', 1)
    .eq('status', 'pending')

  if (dupes) {
    for (const d of dupes) {
      await sb.from('send_tasks').delete().eq('id', d.id)
    }
  }

  console.log("Fixed DB")
}
run()
