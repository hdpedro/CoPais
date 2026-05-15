// =============================================
// SBP (Sociedade Brasileira de Pediatria) Vaccination Calendar
// Based on the standard Brazilian pediatric schedule
// =============================================

export interface SbpDose {
  /** Dose number (1-based) */
  dose: number;
  /** Label for display, e.g. "1a dose", "Reforco" */
  label: string;
  /** Recommended age in months (0 = ao nascer) */
  recommendedAgeMonths: number;
  /** Human-readable age label */
  ageLabel: string;
}

export interface SbpVaccine {
  /** Canonical vaccine name */
  name: string;
  /** Aliases for fuzzy matching with existing records */
  aliases: string[];
  /** Ordered list of doses */
  doses: SbpDose[];
}

export const SBP_VACCINE_CALENDAR: SbpVaccine[] = [
  {
    name: "BCG",
    aliases: ["bcg"],
    doses: [
      { dose: 1, label: "Dose unica", recommendedAgeMonths: 0, ageLabel: "Ao nascer" },
    ],
  },
  {
    name: "Hepatite B",
    aliases: ["hepatite b", "hep b", "hepb"],
    doses: [
      { dose: 1, label: "1a dose", recommendedAgeMonths: 0, ageLabel: "Ao nascer" },
      { dose: 2, label: "2a dose", recommendedAgeMonths: 1, ageLabel: "1 mes" },
      { dose: 3, label: "3a dose", recommendedAgeMonths: 6, ageLabel: "6 meses" },
    ],
  },
  {
    name: "Pentavalente (DTPa)",
    aliases: ["pentavalente", "dtpa", "dtp", "dtp (reforco)", "dtp (2o reforco)"],
    doses: [
      { dose: 1, label: "1a dose", recommendedAgeMonths: 2, ageLabel: "2 meses" },
      { dose: 2, label: "2a dose", recommendedAgeMonths: 4, ageLabel: "4 meses" },
      { dose: 3, label: "3a dose", recommendedAgeMonths: 6, ageLabel: "6 meses" },
      { dose: 4, label: "1o reforco", recommendedAgeMonths: 15, ageLabel: "15 meses" },
      { dose: 5, label: "2o reforco", recommendedAgeMonths: 48, ageLabel: "4 anos" },
    ],
  },
  {
    name: "VIP/VOP (Polio)",
    aliases: ["vip", "vop", "polio", "vip (polio inativada)", "vop (polio oral)", "vop (polio oral reforco)"],
    doses: [
      { dose: 1, label: "1a dose (VIP)", recommendedAgeMonths: 2, ageLabel: "2 meses" },
      { dose: 2, label: "2a dose (VIP)", recommendedAgeMonths: 4, ageLabel: "4 meses" },
      { dose: 3, label: "3a dose (VIP)", recommendedAgeMonths: 6, ageLabel: "6 meses" },
      { dose: 4, label: "1o reforco (VOP)", recommendedAgeMonths: 15, ageLabel: "15 meses" },
      { dose: 5, label: "2o reforco (VOP)", recommendedAgeMonths: 48, ageLabel: "4 anos" },
    ],
  },
  {
    name: "Pneumococica 13",
    aliases: ["pneumococica", "pneumo", "pneumococica 10v", "pneumococica 10v (reforco)", "pneumococica 13v"],
    doses: [
      { dose: 1, label: "1a dose", recommendedAgeMonths: 2, ageLabel: "2 meses" },
      { dose: 2, label: "2a dose", recommendedAgeMonths: 4, ageLabel: "4 meses" },
      { dose: 3, label: "Reforco", recommendedAgeMonths: 12, ageLabel: "12 meses" },
    ],
  },
  {
    name: "Rotavirus",
    aliases: ["rotavirus", "rota"],
    doses: [
      { dose: 1, label: "1a dose", recommendedAgeMonths: 2, ageLabel: "2 meses" },
      { dose: 2, label: "2a dose", recommendedAgeMonths: 4, ageLabel: "4 meses" },
    ],
  },
  {
    name: "Meningococica C",
    aliases: ["meningococica", "meningo", "meningococica c", "meningococica c (reforco)"],
    doses: [
      { dose: 1, label: "1a dose", recommendedAgeMonths: 3, ageLabel: "3 meses" },
      { dose: 2, label: "2a dose", recommendedAgeMonths: 5, ageLabel: "5 meses" },
      { dose: 3, label: "Reforco", recommendedAgeMonths: 12, ageLabel: "12 meses" },
    ],
  },
  {
    name: "Febre Amarela",
    aliases: ["febre amarela", "febre amarela (reforco)"],
    doses: [
      { dose: 1, label: "1a dose", recommendedAgeMonths: 9, ageLabel: "9 meses" },
      { dose: 2, label: "Reforco", recommendedAgeMonths: 48, ageLabel: "4 anos" },
    ],
  },
  {
    name: "Triplice Viral (SCR)",
    aliases: ["triplice viral", "scr", "triplice viral (scr)", "tetra viral (scrv)", "scrv"],
    doses: [
      { dose: 1, label: "1a dose", recommendedAgeMonths: 12, ageLabel: "12 meses" },
      { dose: 2, label: "2a dose", recommendedAgeMonths: 15, ageLabel: "15 meses" },
    ],
  },
  {
    name: "Hepatite A",
    aliases: ["hepatite a", "hep a", "hepa"],
    doses: [
      { dose: 1, label: "Dose unica", recommendedAgeMonths: 12, ageLabel: "12 meses" },
    ],
  },
  {
    name: "Varicela",
    aliases: ["varicela", "catapora"],
    doses: [
      { dose: 1, label: "1a dose", recommendedAgeMonths: 12, ageLabel: "12 meses" },
      { dose: 2, label: "Reforco", recommendedAgeMonths: 48, ageLabel: "4 anos" },
    ],
  },
];

// =============================================
// Comparison Logic
// =============================================

export type VaccineReminderStatus = "on_time" | "overdue" | "upcoming" | "future";

export interface VaccineDoseStatus {
  vaccineName: string;
  dose: SbpDose;
  status: VaccineReminderStatus;
  /** If recorded, the date it was administered */
  administeredDate?: string;
  /** How many months overdue (negative = early, positive = late) */
  monthsDiff?: number;
}

export interface VaccineComparisonResult {
  onTime: VaccineDoseStatus[];
  overdue: VaccineDoseStatus[];
  upcoming: VaccineDoseStatus[];
  future: VaccineDoseStatus[];
}

interface VaccinationRecord {
  vaccine_name: string;
  dose_label?: string | null;
  administered_date: string;
}

/**
 * Fuzzy-matches a vaccination record against an SBP vaccine entry.
 * Checks if the record name contains the vaccine name or any alias, or vice versa.
 */
function matchesVaccine(recordName: string, vaccine: SbpVaccine): boolean {
  const rLower = recordName.toLowerCase();
  const nameLower = vaccine.name.toLowerCase();

  if (rLower.includes(nameLower) || nameLower.includes(rLower)) return true;

  return vaccine.aliases.some(
    (alias) => rLower.includes(alias) || alias.includes(rLower)
  );
}

/**
 * Counts how many doses of a given vaccine have been recorded.
 * Returns matching records sorted by date ascending.
 */
function getRecordedDoses(
  vaccine: SbpVaccine,
  records: VaccinationRecord[]
): VaccinationRecord[] {
  return records
    .filter((r) => matchesVaccine(r.vaccine_name, vaccine))
    .sort(
      (a, b) =>
        new Date(a.administered_date).getTime() -
        new Date(b.administered_date).getTime()
    );
}

/**
 * @deprecated Use `getVaccineStatus(supabase, childId)` de `@/lib/services/vaccines`.
 * Esta função está mantida apenas pra compat com código legado. Motor real está em
 * `vaccine_recommended_doses` mantido por trigger (migration 00082). Será removida.
 *
 * Compare a child's vaccination records against the SBP calendar.
 *
 * @param birthDate - Child's birth date string (YYYY-MM-DD)
 * @param records - Existing vaccination records from the database
 * @param toleranceMonths - Number of months tolerance for "on time" (default: 1)
 * @param upcomingWindowMonths - How many months ahead to show as "upcoming" (default: 3)
 */
export function compareVaccinations(
  birthDate: string,
  records: VaccinationRecord[],
  toleranceMonths = 1,
  upcomingWindowMonths = 3
): VaccineComparisonResult {
  const birth = new Date(birthDate + "T12:00:00");
  const now = new Date();
  const ageMonths =
    (now.getFullYear() - birth.getFullYear()) * 12 +
    (now.getMonth() - birth.getMonth());

  const result: VaccineComparisonResult = {
    onTime: [],
    overdue: [],
    upcoming: [],
    future: [],
  };

  for (const vaccine of SBP_VACCINE_CALENDAR) {
    const recordedDoses = getRecordedDoses(vaccine, records);

    for (let i = 0; i < vaccine.doses.length; i++) {
      const dose = vaccine.doses[i];
      const matchedRecord = recordedDoses[i]; // i-th dose matches i-th record chronologically

      if (matchedRecord) {
        // Dose was administered
        result.onTime.push({
          vaccineName: vaccine.name,
          dose,
          status: "on_time",
          administeredDate: matchedRecord.administered_date,
        });
      } else if (ageMonths >= dose.recommendedAgeMonths + toleranceMonths) {
        // Past due (age > recommended + tolerance and not recorded)
        result.overdue.push({
          vaccineName: vaccine.name,
          dose,
          status: "overdue",
          monthsDiff: ageMonths - dose.recommendedAgeMonths,
        });
      } else if (
        ageMonths >= dose.recommendedAgeMonths - upcomingWindowMonths &&
        ageMonths < dose.recommendedAgeMonths + toleranceMonths
      ) {
        // Coming up within the window
        result.upcoming.push({
          vaccineName: vaccine.name,
          dose,
          status: "upcoming",
          monthsDiff: dose.recommendedAgeMonths - ageMonths,
        });
      } else {
        // Still in the future
        result.future.push({
          vaccineName: vaccine.name,
          dose,
          status: "future",
        });
      }
    }
  }

  // Sort overdue by most overdue first
  result.overdue.sort((a, b) => (b.monthsDiff ?? 0) - (a.monthsDiff ?? 0));
  // Sort upcoming by soonest first
  result.upcoming.sort((a, b) => (a.monthsDiff ?? 0) - (b.monthsDiff ?? 0));

  return result;
}
