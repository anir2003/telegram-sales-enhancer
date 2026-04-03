import { importLeadsCsv } from './apps/web/lib/server/repository'
const csv = `First Name,Last Name,Company,Telegram Username,Tags,Notes,Source
John,Doe,Acme,@johndoe,VIP,Cool guy,Web
`
async function run() {
  try {
    const res = await importLeadsCsv(csv)
    console.log(res)
  } catch (e) {
    console.error(e)
  }
}
run()
