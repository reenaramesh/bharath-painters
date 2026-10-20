import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { Button, Card, Text, useTheme } from 'react-native-paper';
import { api } from '../providers/AppProvider';
import { Heading, Screen, State, styles } from '../components/ui';
import { StatusPill } from '../components/ModuleUI';
import { OfflineQueuePanel } from '../components/OfflineQueuePanel';
import { enqueueMobileOperation } from '../core/offlineQueue';
import { ApiError } from '../core/api';
import { useApp } from '../providers/AppProvider';
import { tokens } from '../theme';

type Attendance = { id: number; date: string; status: string; approval_status: string; note?: string };
type Member = { membership_id: number; name?: string; employee_name?: string; employee_code?: string; mobile?: string; job_title?: string; blood_group?: string; custom_fields?: Record<string, string | number | boolean>; custom_field_definitions?: { id: number; label: string; is_active: boolean }[]; salary_basis?: string; salary_amount?: string; profile_history?: { id: number; changes: { label: string; old_value?: unknown; new_value?: unknown }[]; changed_by: string; recorded_at: string }[]; salary_history?: { id: number; effective_from: string; previous_salary_amount?: string; salary_amount?: string; previous_salary_basis: string; salary_basis: string; changed_by: string; recorded_at: string }[]; attendance?: Attendance[] };

export function EmployeeAttendanceScreen() {
  const { user } = useApp();
  const routeParams = useLocalSearchParams<{ membershipId?: string }>();
  const theme = useTheme();
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const today = new Date().toLocaleDateString('en-CA');
  const load = useCallback(async () => {
    try {
      const list = await api.get<Member[]>('/jobs/in-house-applicators/');
      const details = await Promise.all(list.map(async member => { const data = await api.get<Member>(`/jobs/in-house-applicators/${member.membership_id}/`); const history = await api.get<{ profile_changes: Member['profile_history']; salary_changes: Member['salary_history'] }>(`/jobs/in-house-applicators/${member.membership_id}/history/`); return { ...data, profile_history: history.profile_changes, salary_history: history.salary_changes }; }));
      setMembers(details); setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Employee attendance could not be loaded.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function review(member: Member, row: Attendance, decision: 'APPROVED' | 'REJECTED') {
    const key = `${member.membership_id}:${row.id}`; setBusy(key); setError(''); setNotice('');
    try {
      await api.request(`/jobs/in-house-applicators/${member.membership_id}/attendance/${row.id}/review/`, { decision });
      setNotice(`Attendance ${decision.toLowerCase()} and employee earnings updated.`); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Attendance review could not be saved.'); }
    finally { setBusy(''); }
  }
  async function markToday(member: Member, attendanceStatus: 'PRESENT' | 'HALF_DAY' | 'ABSENT' | 'LEAVE') {
    const key = `${member.membership_id}:today`; setBusy(key); setError(''); setNotice('');
    try {
      const endpoint = `/jobs/in-house-applicators/${member.membership_id}/attendance/`;
      const payload = { date: today, status: attendanceStatus };
      try {
        await api.request(endpoint, payload);
        setNotice(`Today's attendance saved as ${attendanceStatus.toLowerCase().replace('_', ' ')}.`); await load();
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 0 && user?.id) {
          await enqueueMobileOperation({ actorId: user.id, kind: 'attendance', endpoint, payload, expectedVersion: null });
          setNotice(`Today's attendance is Pending Sync as ${attendanceStatus.toLowerCase().replace('_', ' ')}. The server must accept it before it enters review.`);
        } else throw cause;
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Attendance could not be saved.'); }
    finally { setBusy(''); }
  }
  return <Screen scroll={false}><ScrollView contentContainerStyle={[styles.content, { paddingBottom: tokens.space.xxl }]}>
    <Heading title="Employees & attendance" subtitle="Record today's attendance and review painter submissions before earnings are approved." />
    {user?.id && <OfflineQueuePanel actorId={user.id} />}
    {!!notice && <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.primary }}>{notice}</Text>}
    {!!error && <State title="Attendance needs attention" description={error} action="Reload" onAction={() => void load()} />}
    {!members.length && !error && <State title="No in-house employees" description="Employees linked to your contractor account appear here." action="Refresh" onAction={() => void load()} />}
    {[...members].sort((a, b) => Number(b.membership_id === Number(routeParams.membershipId)) - Number(a.membership_id === Number(routeParams.membershipId))).map(member => <Card key={member.membership_id} mode={member.membership_id === Number(routeParams.membershipId) ? 'contained' : 'outlined'}><Card.Content style={{ gap: tokens.space.sm }}>
      <Text variant="titleMedium">{member.name || member.employee_name || `Employee ${member.membership_id}`}</Text>
      <Text variant="bodySmall">{member.employee_code || `Employee ${member.membership_id}`}{member.job_title ? ` ? ${member.job_title}` : ''}{member.mobile ? ` ? ${member.mobile}` : ''}</Text>
      {!!member.blood_group && <Text variant="bodySmall">Blood group: {member.blood_group}</Text>}
      {member.custom_field_definitions?.filter(field => member.custom_fields?.[String(field.id)] !== undefined).map(field => <Text key={field.id} variant="bodySmall">{field.label}: {String(member.custom_fields?.[String(field.id)])}</Text>)}
      <Text variant="bodySmall">{member.salary_basis || 'Wage basis'}{member.salary_amount ? ` ? ?${member.salary_amount}` : ''}</Text>
      {member.salary_history?.map(row => <Text key={`salary-${row.id}`} variant="bodySmall">Salary updated: INR {row.previous_salary_amount || '0'} to INR {row.salary_amount || '0'} from {row.effective_from}</Text>)}
      {member.profile_history?.flatMap(row => row.changes.map((change, index) => <Text key={`change-${row.id}-${index}`} variant="bodySmall">{change.label}: {String(change.old_value ?? '-')} to {String(change.new_value ?? '-')} · {row.recorded_at ? new Date(row.recorded_at).toLocaleDateString() : ''}</Text>))}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {(['PRESENT', 'HALF_DAY', 'ABSENT', 'LEAVE'] as const).map(value => <Button key={value} mode="outlined" disabled={!!busy} onPress={() => void markToday(member, value)}>{value.replace('_', ' ')}</Button>)}
      </View>
      {(member.attendance || []).filter(row => row.approval_status === 'PENDING').map(row => <View key={row.id} style={{ gap: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: theme.colors.outlineVariant }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text>{row.date} · {row.status.replace('_', ' ')}</Text><StatusPill status={row.approval_status} /></View>
        {!!row.note && <Text variant="bodySmall">{row.note}</Text>}
        <View style={{ flexDirection: 'row', gap: 8 }}><Button mode="contained" disabled={!!busy} loading={busy === `${member.membership_id}:${row.id}`} onPress={() => void review(member, row, 'APPROVED')}>Approve</Button><Button mode="outlined" disabled={!!busy} onPress={() => void review(member, row, 'REJECTED')}>Reject</Button></View>
      </View>)}
    </Card.Content></Card>)}
  </ScrollView></Screen>;
}
