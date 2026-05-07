/**
 * Calendar Sync — exporta eventos do Kindar para o calendario nativo
 * do celular (iOS EventKit / Android CalendarProvider) via expo-calendar.
 *
 * Estrategia:
 *   1. Solicita permissao
 *   2. Cria/reusa calendario "Kindar" (via fonte default)
 *   3. Para cada evento de guarda/atividade/social do range, cria entry
 *      (idempotente via dedupe por 'kindar_event_id' no notes field —
 *      expo-calendar nao oferece API de update-by-externalId, entao o
 *      approach pragmatico e deletar-e-recriar o calendario inteiro)
 */

import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';
import type { CalendarEvent } from '../hooks/useCalendar';

const KINDAR_CALENDAR_TITLE = 'Kindar';

async function getDefaultSource(): Promise<Calendar.Source | null> {
  if (Platform.OS === 'ios') {
    // Prefer the default calendar source (iCloud or Local)
    const defaultCal = await Calendar.getDefaultCalendarAsync();
    return (defaultCal?.source as Calendar.Source) || null;
  }
  // Android: create via local account
  const sources = await Calendar.getSourcesAsync();
  const local = sources.find(s => s.type === Calendar.SourceType.LOCAL);
  return local || sources[0] || null;
}

async function findOrCreateKindarCalendar(): Promise<string> {
  const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const existing = cals.find(c => c.title === KINDAR_CALENDAR_TITLE);
  if (existing) return existing.id;

  const source = await getDefaultSource();
  if (!source) throw new Error('Nao foi possivel localizar calendar source no dispositivo');

  const id = await Calendar.createCalendarAsync({
    title: KINDAR_CALENDAR_TITLE,
    color: '#D4735A',            // Kindar brand
    entityType: Calendar.EntityTypes.EVENT,
    sourceId: (source as { id?: string }).id,
    source: source as Calendar.Source,
    name: KINDAR_CALENDAR_TITLE,
    ownerAccount: (source as { name?: string }).name || KINDAR_CALENDAR_TITLE,
    accessLevel: Calendar.CalendarAccessLevel.OWNER,
  });
  return id;
}

async function wipeCalendar(calendarId: string) {
  // Delete all events from our own calendar so we can re-create without dupes
  const start = new Date();
  start.setFullYear(start.getFullYear() - 1);
  const end = new Date();
  end.setFullYear(end.getFullYear() + 2);
  const existing = await Calendar.getEventsAsync([calendarId], start, end);
  for (const ev of existing) {
    try { await Calendar.deleteEventAsync(ev.id); } catch { /* ignore */ }
  }
}

export interface SyncResult {
  success: boolean;
  error?: string;
  created?: number;
}

/**
 * Export all events (custody + activity + social) for the next N months
 * to the phone's native calendar. Called from the "Sincronizar com Celular"
 * button in the calendar tab.
 */
export async function syncEventsToDeviceCalendar(
  events: CalendarEvent[],
  memberNames: Record<string, string>
): Promise<SyncResult> {
  try {
    // 1. Permission
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    if (status !== 'granted') {
      return { success: false, error: 'Permissao negada. Autorize em Ajustes > Calendarios.' };
    }

    // 2. Calendar
    const calendarId = await findOrCreateKindarCalendar();

    // 3. Clear previous Kindar events to avoid duplicates on re-sync
    await wipeCalendar(calendarId);

    // 4. Group custody events (they're per-day) back into ranges so the
    //    phone calendar shows a single multi-day block instead of N daily
    //    entries.
    const custodyByRange = new Map<string, { start: string; end: string; title: string }>();
    let created = 0;

    // Custody events: hook emits one per day, in priority order
    // (swap > exception > regular). When a date has both a swap and a
    // regular row, both used to be synced to the iPhone calendar — two
    // conflicting all-day events on the same day. Dedup per date here
    // keeping the FIRST occurrence (highest priority), then sort by date.
    // Array.prototype.sort is stable so this preserves the priority
    // ordering useCalendar gave us. Mirrors the WeekendPlanner fix.
    const seen = new Set<string>();
    const custodyEvents = events
      .filter(e => e.type === 'custody')
      .filter(e => {
        if (seen.has(e.date)) return false;
        seen.add(e.date);
        return true;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 0; i < custodyEvents.length; i++) {
      const e = custodyEvents[i];
      const who = e.responsibleId ? (memberNames[e.responsibleId] || 'Outro') : '?';
      const title = `Com ${who}${e.title ? ` · ${e.title}` : ''}`;
      const key = `${e.responsibleId}-${e.title}`;
      const existing = custodyByRange.get(key);
      if (existing && isNextDay(existing.end, e.date)) {
        existing.end = e.date;
      } else {
        custodyByRange.set(`${key}-${e.date}`, { start: e.date, end: e.date, title });
      }
    }

    for (const range of custodyByRange.values()) {
      const start = new Date(range.start + 'T00:00:00');
      const end = new Date(range.end + 'T23:59:59');
      try {
        await Calendar.createEventAsync(calendarId, {
          title: range.title,
          startDate: start,
          endDate: end,
          allDay: true,
          notes: 'Guarda — Kindar',
        });
        created++;
      } catch { /* ignore failed events */ }
    }

    // Activities + social events
    for (const e of events) {
      if (e.type === 'custody') continue;
      const prefix = e.type === 'activity' ? '🎯 ' : '🚩 ';
      const start = new Date(e.date + (e.time ? `T${e.time}:00` : 'T09:00:00'));
      const end = new Date(start);
      end.setHours(end.getHours() + 1);
      try {
        await Calendar.createEventAsync(calendarId, {
          title: `${prefix}${e.title}`,
          startDate: start,
          endDate: end,
          allDay: !e.time,
          notes: `Kindar ${e.type}`,
        });
        created++;
      } catch { /* ignore */ }
    }

    return { success: true, created };
  } catch (err: unknown) {
    const msg = (err as { message?: string })?.message || 'Falha ao sincronizar';
    return { success: false, error: msg };
  }
}

function isNextDay(endIso: string, startIso: string): boolean {
  const end = new Date(endIso + 'T12:00:00');
  const next = new Date(end);
  next.setDate(next.getDate() + 1);
  return next.toISOString().slice(0, 10) === startIso;
}
