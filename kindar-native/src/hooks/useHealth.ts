/**
 * useHealth — Central hook for health module data.
 * Fetches illnesses, medications, appointments, allergies, and builds timeline.
 */

import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuth } from '../store/auth';
import { getDisplayName } from '../lib/constants';

// ── Types ──

export type HealthEventType = 'illness' | 'medication' | 'appointment' | 'observation' | 'allergy' | 'dose';

export type ChildStatus = 'healthy' | 'monitoring' | 'treatment';

export interface HealthEvent {
  id: string;
  type: HealthEventType;
  title: string;
  subtitle: string;
  date: string; // ISO
  childId: string;
  childName: string;
  createdBy: string;
  createdByName: string;
  metadata: Record<string, unknown>;
}

export interface ChildHealthState {
  childId: string;
  childName: string;
  birthDate: string;
  status: ChildStatus;
  statusLabel: string;
  detail: string;
  activeIllnessCount: number;
  activeMedCount: number;
  allergyCount: number;
}

export interface Illness {
  id: string;
  child_id: string;
  title: string;
  symptoms: string[] | null;
  severity: string | null;
  status: string;
  start_date: string;
  end_date: string | null;
  diagnosis: string | null;
  notes: string | null;
  hospital_visit: boolean | null;
  hospital_name: string | null;
  created_by: string;
  created_at: string;
  childName: string;
  authorName: string;
}

export interface Medication {
  id: string;
  child_id: string;
  name: string;
  dosage: string;
  frequency: string;
  frequency_hours: number | null;
  reason: string | null;
  start_date: string;
  end_date: string | null;
  status: string;
  notes: string | null;
  created_by: string;
  created_at: string;
  childName: string;
  authorName: string;
}

export interface Appointment {
  id: string;
  child_id: string;
  title: string;
  appointment_date: string;
  location: string | null;
  status: string;
  notes: string | null;
  summary: string | null;
  professionalName: string | null;
  professionalSpecialty: string | null;
  childName: string;
}

export interface Allergy {
  id: string;
  child_id: string;
  name: string;
  allergy_type: string;
  severity: string;
  reaction: string | null;
  childName: string;
}

interface HealthData {
  children: Array<{ id: string; full_name: string; birth_date: string }>;
  childStates: ChildHealthState[];
  illnesses: Illness[];
  medications: Medication[];
  appointments: Appointment[];
  allergies: Allergy[];
  timeline: HealthEvent[];
}

function formatDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function useHealth(selectedChildId?: string) {
  const { userId, activeGroup } = useAuth();
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!userId || !activeGroup) return;
    const groupId = activeGroup.groupId;

    try {
      // Members for name lookup
      const { data: members } = await supabase
        .from('group_members')
        .select('user_id, profiles(full_name)')
        .eq('group_id', groupId);

      const memberMap: Record<string, string> = {};
      (members || []).forEach((m: any) => {
        memberMap[m.user_id] = getDisplayName(m.profiles?.full_name);
      });

      // All queries in parallel
      const [
        { data: children },
        { data: illnesses },
        { data: medications },
        { data: appointments },
        { data: allergies },
      ] = await Promise.all([
        supabase.from('children')
          .select('id, full_name, birth_date')
          .eq('group_id', groupId)
          .order('birth_date'),
        supabase.from('illness_episodes')
          .select('id, child_id, title, symptoms, severity, status, start_date, end_date, diagnosis, notes, hospital_visit, hospital_name, created_by, created_at, children(full_name)')
          .eq('group_id', groupId)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase.from('active_medications')
          .select('id, child_id, name, dosage, frequency, frequency_hours, reason, start_date, end_date, status, notes, created_by, created_at, children(full_name)')
          .eq('group_id', groupId)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase.from('medical_appointments')
          .select('id, child_id, title, appointment_date, location, status, notes, summary, children(full_name), medical_professionals(name, specialty)')
          .eq('group_id', groupId)
          .order('appointment_date', { ascending: false })
          .limit(30),
        supabase.from('child_allergies')
          .select('id, child_id, name, allergy_type, severity, reaction, children(full_name)')
          .eq('group_id', groupId),
      ]);

      // Map illnesses
      const mappedIllnesses: Illness[] = (illnesses || []).map((i: any) => ({
        ...i,
        childName: getDisplayName(i.children?.full_name),
        authorName: memberMap[i.created_by] || '',
      }));

      // Map medications
      const mappedMeds: Medication[] = (medications || []).map((m: any) => ({
        ...m,
        childName: getDisplayName(m.children?.full_name),
        authorName: memberMap[m.created_by] || '',
      }));

      // Map appointments
      const mappedAppts: Appointment[] = (appointments || []).map((a: any) => ({
        ...a,
        professionalName: a.medical_professionals?.name || null,
        professionalSpecialty: a.medical_professionals?.specialty || null,
        childName: getDisplayName(a.children?.full_name),
      }));

      // Map allergies
      const mappedAllergies: Allergy[] = (allergies || []).map((a: any) => ({
        ...a,
        childName: getDisplayName(a.children?.full_name),
      }));

      // Build child states
      const childStates: ChildHealthState[] = (children || []).map((c: any) => {
        const cIllnesses = mappedIllnesses.filter(i => i.child_id === c.id && i.status === 'active');
        const cMeds = mappedMeds.filter(m => m.child_id === c.id && m.status === 'active');
        const cAllergies = mappedAllergies.filter(a => a.child_id === c.id);

        const status: ChildStatus =
          cIllnesses.length > 0 ? 'treatment' : cMeds.length > 0 ? 'monitoring' : 'healthy';

        const statusLabel =
          status === 'treatment' ? 'Em tratamento'
            : status === 'monitoring' ? 'Em observacao'
              : 'Saudavel';

        const detail =
          cIllnesses.length > 0 ? cIllnesses[0].title
            : cMeds.length > 0 ? `${cMeds.length} medicamento${cMeds.length > 1 ? 's' : ''} ativo${cMeds.length > 1 ? 's' : ''}`
              : cAllergies.length > 0 ? `${cAllergies.length} alergia${cAllergies.length > 1 ? 's' : ''}`
                : 'Nenhum registro recente';

        return {
          childId: c.id,
          childName: getDisplayName(c.full_name),
          birthDate: c.birth_date,
          status,
          statusLabel,
          detail,
          activeIllnessCount: cIllnesses.length,
          activeMedCount: cMeds.length,
          allergyCount: cAllergies.length,
        };
      });

      // Build unified timeline
      const timeline: HealthEvent[] = [];

      // Filter by child if selected
      const filterChild = (childId: string) => !selectedChildId || childId === selectedChildId;

      mappedIllnesses.filter(i => filterChild(i.child_id)).forEach(i => {
        timeline.push({
          id: i.id,
          type: 'illness',
          title: i.title,
          subtitle: i.symptoms?.join(', ') || i.diagnosis || '',
          date: i.created_at,
          childId: i.child_id,
          childName: i.childName,
          createdBy: i.created_by,
          createdByName: i.authorName,
          metadata: { severity: i.severity, status: i.status, hospital_visit: i.hospital_visit },
        });
      });

      mappedMeds.filter(m => filterChild(m.child_id)).forEach(m => {
        timeline.push({
          id: m.id,
          type: 'medication',
          title: m.name,
          subtitle: `${m.dosage} · ${m.frequency}`,
          date: m.created_at,
          childId: m.child_id,
          childName: m.childName,
          createdBy: m.created_by,
          createdByName: m.authorName,
          metadata: { dosage: m.dosage, frequency: m.frequency, reason: m.reason, status: m.status },
        });
      });

      mappedAppts.filter(a => filterChild(a.child_id)).forEach(a => {
        timeline.push({
          id: a.id,
          type: 'appointment',
          title: a.title,
          subtitle: [a.professionalName, a.professionalSpecialty, a.location].filter(Boolean).join(' · '),
          date: a.appointment_date,
          childId: a.child_id,
          childName: a.childName,
          createdBy: '',
          createdByName: '',
          metadata: { status: a.status, summary: a.summary },
        });
      });

      // Sort timeline by date descending
      timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setData({
        children: children || [],
        childStates,
        illnesses: mappedIllnesses,
        medications: mappedMeds,
        appointments: mappedAppts,
        allergies: mappedAllergies,
        timeline,
      });
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  }, [userId, activeGroup, selectedChildId]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  return { data, loading, refresh: loadData };
}
