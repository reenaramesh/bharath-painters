export type HiringActivity = {
  id: string;
  application_id?: number;
  activity_type: string;
  title: string;
  person: string;
  status: string;
  start_date: string;
  end_date: string;
};

export type AssignableHiringOutcome = HiringActivity & {
  sourceType: 'application' | 'booking';
  sourceId: number;
};

export function schedulesWithinHiringDates<T extends { start_date: string; end_date: string }>(
  outcome: Pick<HiringActivity, 'start_date' | 'end_date'>,
  schedules: T[],
): T[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(outcome.start_date) || !/^\d{4}-\d{2}-\d{2}$/.test(outcome.end_date)) return [];
  return schedules.filter(schedule => /^\d{4}-\d{2}-\d{2}$/.test(schedule.start_date)
    && /^\d{4}-\d{2}-\d{2}$/.test(schedule.end_date)
    && schedule.start_date >= outcome.start_date && schedule.end_date <= outcome.end_date);
}

export function assignableHiringOutcomes(rows: HiringActivity[]): AssignableHiringOutcome[] {
  return rows.reduce<AssignableHiringOutcome[]>((result, row) => {
    if (row.activity_type === 'Accepted applicator' && row.status === 'ACCEPTED' && Number.isSafeInteger(row.application_id) && Number(row.application_id) > 0) {
      result.push({ ...row, sourceType: 'application', sourceId: Number(row.application_id) });
    }
    if (row.activity_type === 'Applicator booking' && row.status === 'CONFIRMED') {
      const match = /^booking-(\d+)$/.exec(row.id);
      if (match && Number(match[1]) > 0) result.push({ ...row, sourceType: 'booking', sourceId: Number(match[1]) });
    }
    return result;
  }, []);
}
