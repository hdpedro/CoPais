import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createNotificationWithPush } from "@/lib/push";
import { captureServerEvent } from "@/lib/posthog-server";
import { sendNurtureEmail } from "@/lib/emails/nurture";

// Retention messages by days since signup
const RETENTION_SCHEDULE: Array<{
  daysAfterSignup: number;
  eventType: string;
  title: string;
  message: string;
  link: string;
}> = [
  {
    daysAfterSignup: 1,
    eventType: "retention_d1",
    title: "Complete seu Kindar",
    message: "Configure a rotina da sua familia em poucos minutos. Comece agora!",
    link: "/dashboard",
  },
  {
    daysAfterSignup: 3,
    eventType: "retention_d3",
    title: "Registre uma atividade",
    message: "Futebol, terapia, escola — organize as atividades da crianca no Kindar.",
    link: "/atividades/nova",
  },
  {
    daysAfterSignup: 7,
    eventType: "retention_d7",
    title: "Como esta a rotina?",
    message: "Faca um check-in rapido e mantenha o historico da semana.",
    link: "/checkin",
  },
  {
    daysAfterSignup: 14,
    eventType: "retention_d14",
    title: "Sua familia esta usando o Kindar?",
    message: "Convide o outro responsavel para compartilhar a rotina da crianca.",
    link: "/convite/enviar",
  },
];

export async function GET(request: Request) {
  // Verify cron secret (Vercel sends this header)
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // Allow in development or if CRON_SECRET is not set
    if (process.env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabase = createAdminClient();
  let totalSent = 0;

  try {
    for (const schedule of RETENTION_SCHEDULE) {
      // Find users who signed up X days ago and haven't received this notification
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - schedule.daysAfterSignup);
      const targetDateStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
      const targetDateEnd = new Date(targetDateStart);
      targetDateEnd.setDate(targetDateEnd.getDate() + 1);

      // Get users who signed up on the target date
      const { data: users } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .gte("created_at", targetDateStart.toISOString())
        .lt("created_at", targetDateEnd.toISOString());

      if (!users || users.length === 0) continue;

      for (const user of users) {
        // Check if already sent this notification
        const { data: existing } = await supabase
          .from("retention_events")
          .select("user_id")
          .eq("user_id", user.id)
          .eq("event_type", schedule.eventType)
          .single();

        if (existing) continue; // Already sent

        // Send push notification
        await createNotificationWithPush(
          user.id,
          schedule.eventType,
          schedule.title,
          schedule.message,
          schedule.link
        );

        // Send nurture email for D+3, D+7, D+14
        const emailType = schedule.daysAfterSignup === 3 ? "d3" : schedule.daysAfterSignup === 7 ? "d7" : schedule.daysAfterSignup === 14 ? "d14" : null;
        if (emailType && user.email) {
          void sendNurtureEmail(user.email, user.full_name || "", emailType);
        }

        // Record that we sent it
        await supabase.from("retention_events").insert({
          user_id: user.id,
          event_type: schedule.eventType,
        });

        captureServerEvent(user.id, "retention_notification_sent", {
          event_type: schedule.eventType,
          days_after_signup: schedule.daysAfterSignup,
        });

        totalSent++;
      }
    }

    return NextResponse.json({ success: true, sent: totalSent });
  } catch (error) {
    console.error("[cron/retention] Error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
