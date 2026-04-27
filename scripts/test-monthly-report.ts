/**
 * Test script: sends a monthly report email for March 2026
 * Usage: npx tsx scripts/test-monthly-report.ts
 *
 * Requires .env.local with RESEND_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { config } from "dotenv";
config({ path: ".env.local" });

// Patch env for Next.js patterns
process.env.NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://kindar.com.br";

async function main() {
  // Dynamic imports to respect env loading
  const { createClient } = await import("@supabase/supabase-js");
  const { collectMonthlyData } = await import("../src/lib/reports/monthly-child-report");
  const { sendMonthlyReport } = await import("../src/lib/emails/send-monthly-report");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const REPORT_YEAR = 2026;
  const REPORT_MONTH = 3; // March

  // Test with Familia Pedro Barata (has rich data)
  const GROUP_ID = "6626786b-7976-4ef8-a540-3582ee663173";

  console.log("Fetching children...");
  const { data: children } = await supabase
    .from("children")
    .select("id, full_name, birth_date, sex, photo_url")
    .eq("group_id", GROUP_ID);

  if (!children || children.length === 0) {
    console.error("No children found");
    process.exit(1);
  }

  console.log(`Found ${children.length} children: ${children.map(c => c.full_name).join(", ")}`);

  console.log("Collecting monthly data...");
  const reports = await Promise.all(
    children.map(child =>
      collectMonthlyData(child.id, GROUP_ID, REPORT_YEAR, REPORT_MONTH, {
        full_name: child.full_name,
        birth_date: child.birth_date,
        sex: child.sex,
        photo_url: child.photo_url,
      })
    )
  );

  const withData = reports.filter(r => r.hasData);
  console.log(`Children with data: ${withData.length}/${reports.length}`);

  for (const r of reports) {
    console.log(`  ${r.child.full_name}: hasData=${r.hasData}`);
    console.log(`    Activities: ${r.activities.total} (${r.activities.completed} completed, ${r.activities.missed} missed)`);
    console.log(`    Checkins: ${r.checkins.total} (${JSON.stringify(r.checkins.byCategory)})`);
    console.log(`    Health: ${r.health.appointments.length} appts, ${r.health.vaccinesAdministered.length} vaccines, ${r.health.illnesses.length} illnesses`);
    console.log(`    Custody: ${r.custody.totalDays} days`);
    console.log(`    Expenses: ${r.expenses.count} (R$ ${r.expenses.total.toFixed(2)})`);
    console.log(`    Decisions: ${r.decisions.total} (${JSON.stringify(r.decisions.byStatus)})`);
  }

  if (withData.length === 0) {
    console.log("No data to report. Exiting.");
    process.exit(0);
  }

  // Send to both recipients
  const recipients = [
    { email: "henrique.de.pedro@gmail.com", name: "Henrique" },
    { email: "angelino.barata@gmail.com", name: "Angelino" },
  ];

  for (const recipient of recipients) {
    console.log(`Sending to ${recipient.email}...`);
    try {
      await sendMonthlyReport(recipient.email, recipient.name, withData);
      console.log(`  OK - sent to ${recipient.email}`);
    } catch (err) {
      console.error(`  FAILED - ${err}`);
    }
  }

  console.log("Done!");
}

main().catch(console.error);
