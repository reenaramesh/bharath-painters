import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Button, Card, Checkbox, Text, useTheme } from 'react-native-paper';
import { api } from '../providers/AppProvider';
import { Heading, Screen, State, styles } from '../components/ui';
import { StatusPill } from '../components/ModuleUI';
import { tokens } from '../theme';
import { assignableHiringOutcomes, schedulesWithinHiringDates, type AssignableHiringOutcome } from '../core/hiringOutcomes';

type Schedule = { id: number; quotation_number: string; property: string; customer: string; start_date: string; end_date: string; status: string; customer_accepted?: boolean; contractor_accepted?: boolean; painters: { id: number; name: string; status: string }[] };
type PainterOption = { id: number; name: string; mobile: string; employment_type: string };
export function ScheduleProgressScreen() {
  const theme = useTheme();
  const [rows, setRows] = useState<Schedule[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState<number | null>(null);
  const [assigning, setAssigning] = useState<number | null>(null);
  const [team, setTeam] = useState<PainterOption[]>([]);
  const [selectedPainters, setSelectedPainters] = useState<number[]>([]);
  const [outcomes, setOutcomes] = useState<AssignableHiringOutcome[]>([]);
  const [hiringTab, setHiringTab] = useState<'SCHEDULES' | 'HIRING'>('SCHEDULES');
  const [selectedScheduleByOutcome, setSelectedScheduleByOutcome] = useState<Record<string, number>>({});
  const load = useCallback(async () => {
    try {
      const [schedules, activity] = await Promise.all([
        api.get<Schedule[]>('/jobs/work-schedules/'),
        api.get<{ results?: Parameters<typeof assignableHiringOutcomes>[0] }>('/jobs/activity/'),
      ]);
      setRows(schedules);
      setOutcomes(assignableHiringOutcomes(Array.isArray(activity.results) ? activity.results : []));
      setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Schedules and hiring outcomes could not be loaded.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function progress(schedule: Schedule, action: 'START' | 'COMPLETE') {
    setBusy(schedule.id); setError(''); setNotice('');
    try {
      await api.request(`/jobs/work-schedules/${schedule.id}/progress/`, { action });
      setNotice(action === 'START' ? 'Project work started.' : 'Project completion submitted after server checks.');
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Project progress could not be saved.'); }
    finally { setBusy(null); }
  }
  async function openAssignments(schedule: Schedule) {
    setAssigning(schedule.id); setError(''); setNotice('');
    try {
      const people = await api.get<PainterOption[]>('/jobs/my-team/', {
        start_date: schedule.start_date, end_date: schedule.end_date, schedule_id: schedule.id,
      });
      setTeam(Array.isArray(people) ? people : []);
      setSelectedPainters(schedule.painters.map(person => person.id));
    } catch (cause) { setAssigning(null); setError(cause instanceof Error ? cause.message : 'Eligible Paint Applicators could not be loaded.'); }
  }
  function togglePainter(id: number) {
    setSelectedPainters(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  }
  async function saveAssignments(schedule: Schedule) {
    setBusy(schedule.id); setError(''); setNotice('');
    try {
      await api.request(`/jobs/work-schedules/${schedule.id}/painters/`, { painters: selectedPainters }, true, 'PUT');
      setAssigning(null); setNotice('Project assignments saved. Painter acceptance and attendance approval remain in the existing workflow.'); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Assignments could not be saved.'); }
    finally { setBusy(null); }
  }
  async function assignOutcome(outcome: AssignableHiringOutcome) {
    const scheduleId = selectedScheduleByOutcome[outcome.id];
    if (!scheduleId) { setError('Choose a confirmed project schedule first.'); return; }
    setBusy(outcome.sourceId); setError(''); setNotice('');
    try {
      const result = await api.request<{ already_assigned?: boolean }>(`/jobs/hiring-outcomes/${outcome.sourceType}/${outcome.sourceId}/assign/`, { schedule_id: scheduleId });
      setNotice(result.already_assigned ? 'This hiring outcome was already linked to that project.' : 'Paint Applicator assigned. Their freelance status and hiring record are preserved.');
      setSelectedScheduleByOutcome(current => { const next = { ...current }; delete next[outcome.id]; return next; });
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'This Paint Applicator could not be assigned.'); }
    finally { setBusy(null); }
  }
  return <Screen scroll={false}><ScrollView contentContainerStyle={[styles.content, { paddingBottom: tokens.space.xxl }]}>
    <Heading title="Schedules & progress" subtitle="Manage project execution and connect accepted hires to confirmed schedules." />
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Button mode={hiringTab === 'SCHEDULES' ? 'contained-tonal' : 'outlined'} contentStyle={{ minHeight: 44 }} onPress={() => setHiringTab('SCHEDULES')}>Schedules</Button>
      <Button mode={hiringTab === 'HIRING' ? 'contained-tonal' : 'outlined'} contentStyle={{ minHeight: 44 }} onPress={() => setHiringTab('HIRING')}>Hiring outcomes</Button>
    </View>
    {!!notice && <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.primary }}>{notice}</Text>}
    {!!error && <State title="Progress needs attention" description={error} action="Reload" onAction={() => void load()} />}
    {hiringTab === 'SCHEDULES' && !rows.length && !error && <State title="No scheduled projects" description="Confirmed and active schedules appear here." action="Refresh" onAction={() => void load()} />}
    {hiringTab === 'SCHEDULES' && rows.map(row => <Card key={row.id} mode="outlined"><Card.Content style={{ gap: tokens.space.xs }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}><Text variant="titleMedium" style={{ flex: 1 }}>{row.property || row.quotation_number}</Text><StatusPill status={row.status} /></View>
      <Text>{row.customer} · {row.quotation_number}</Text>
      <Text variant="bodySmall">{row.start_date} to {row.end_date}</Text>
      {(row.painters || []).map(person => <Text key={`${row.id}-${person.id}`} variant="bodySmall">{person.name} · {person.status.replaceAll('_', ' ')}</Text>)}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
        {row.status === 'CONFIRMED' && <>
          <Button mode="outlined" disabled={busy === row.id} onPress={() => void openAssignments(row)}>Assign painters</Button>
          <Button mode="contained" disabled={busy === row.id} onPress={() => void progress(row, 'START')}>Start project</Button>
        </>}
        {row.status === 'IN_PROGRESS' && <Button mode="contained" disabled={busy === row.id} onPress={() => void progress(row, 'COMPLETE')}>Complete project</Button>}
      </View>
      {assigning === row.id && <View style={{ gap: 4, paddingTop: 8 }}>
        <Text variant="titleSmall">Eligible for these dates</Text>
        {!team.length && <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>No verified team members or confirmed bookings are available for this schedule.</Text>}
        {team.map(person => <Checkbox.Item key={person.id} label={`${person.name} · ${person.employment_type.replaceAll('_', ' ')}`} status={selectedPainters.includes(person.id) ? 'checked' : 'unchecked'} onPress={() => togglePainter(person.id)} accessibilityLabel={`Assign ${person.name}`} />)}
        <View style={{ flexDirection: 'row', gap: 8 }}><Button mode="contained" disabled={busy === row.id} onPress={() => void saveAssignments(row)}>Save assignments</Button><Button mode="text" onPress={() => setAssigning(null)}>Cancel</Button></View>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>The server validates contractor ownership, verification, date overlap and conflicts before saving.</Text>
      </View>}
    </Card.Content></Card>)}
    {hiringTab === 'HIRING' && !outcomes.length && !error && <State title="No assignable hiring outcomes" description="Accepted job applications and confirmed bookings appear here until assigned to a project." action="Refresh" onAction={() => void load()} />}
    {hiringTab === 'HIRING' && outcomes.map(outcome => {
      const confirmed = rows.filter(row => row.status === 'CONFIRMED' && row.customer_accepted && row.contractor_accepted);
      const eligibleSchedules = schedulesWithinHiringDates(outcome, confirmed);
      return <Card key={outcome.id} mode="outlined"><Card.Content style={{ gap: tokens.space.xs }}>
        <Text variant="titleMedium">{outcome.title}</Text>
        <Text>{outcome.person} · {outcome.sourceType === 'application' ? 'Accepted job application' : 'Confirmed booking'}</Text>
        <Text variant="bodySmall">{outcome.start_date} to {outcome.end_date}</Text>
        <Text variant="labelMedium">Select a mutually confirmed project</Text>
        {!confirmed.length && <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>No mutually confirmed schedules are available yet.</Text>}
        {!!confirmed.length && !eligibleSchedules.length && <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>No confirmed project schedule falls fully within this hiring date range.</Text>}
        {eligibleSchedules.map(schedule => <Checkbox.Item key={schedule.id} label={`${schedule.property || schedule.quotation_number} · ${schedule.start_date} to ${schedule.end_date}`} status={selectedScheduleByOutcome[outcome.id] === schedule.id ? 'checked' : 'unchecked'} onPress={() => setSelectedScheduleByOutcome(current => ({ ...current, [outcome.id]: schedule.id }))} accessibilityLabel={`Select ${schedule.quotation_number}`} />)}
        <Button mode="contained" disabled={!selectedScheduleByOutcome[outcome.id] || busy === outcome.sourceId} loading={busy === outcome.sourceId} onPress={() => void assignOutcome(outcome)}>Assign to project</Button>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Server checks ownership, eligibility, complete date-range containment and duplicate/conflicting assignments. No employee account is created.</Text>
      </Card.Content></Card>;
    })}
  </ScrollView></Screen>;
}
