interface ICalEvent {
  uid: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  startTime?: string | null; // HH:MM
  endTime?: string | null; // HH:MM
  summary: string;
  description?: string;
  location?: string;
  categories?: string; // GUARDA, EVENTO, ATIVIDADE
}

function escapeIcal(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function formatIcalDate(dateStr: string): string {
  // All-day event: VALUE=DATE format YYYYMMDD
  return dateStr.replace(/-/g, "");
}

function formatIcalDateTime(dateStr: string, timeStr: string): string {
  // YYYYMMDDTHHMMSS
  return dateStr.replace(/-/g, "") + "T" + timeStr.replace(/:/g, "") + "00";
}

export function generateICalFeed(events: ICalEvent[], calendarName: string): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Kindar//Calendario de Guarda//PT",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcal(calendarName)}`,
    "X-WR-TIMEZONE:America/Sao_Paulo",
    "CALSCALE:GREGORIAN",
  ];

  for (const event of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${event.uid}`);

    if (event.startTime && event.endTime) {
      lines.push(`DTSTART;TZID=America/Sao_Paulo:${formatIcalDateTime(event.startDate, event.startTime)}`);
      // For end, use endDate with endTime
      lines.push(`DTEND;TZID=America/Sao_Paulo:${formatIcalDateTime(event.endDate, event.endTime)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${formatIcalDate(event.startDate)}`);
      // iCal DATE end is exclusive, so add 1 day
      const end = new Date(event.endDate + "T12:00:00");
      end.setDate(end.getDate() + 1);
      const y = end.getFullYear();
      const m = String(end.getMonth() + 1).padStart(2, "0");
      const d = String(end.getDate()).padStart(2, "0");
      lines.push(`DTEND;VALUE=DATE:${y}${m}${d}`);
    }

    lines.push(`SUMMARY:${escapeIcal(event.summary)}`);
    if (event.description) {
      lines.push(`DESCRIPTION:${escapeIcal(event.description)}`);
    }
    if (event.location) {
      lines.push(`LOCATION:${escapeIcal(event.location)}`);
    }
    if (event.categories) {
      lines.push(`CATEGORIES:${event.categories}`);
    }
    lines.push(`DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`);
    // Reminder 1 hour before
    lines.push("BEGIN:VALARM");
    lines.push("TRIGGER:-PT1H");
    lines.push("ACTION:DISPLAY");
    lines.push(`DESCRIPTION:${escapeIcal(event.summary)}`);
    lines.push("END:VALARM");
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
