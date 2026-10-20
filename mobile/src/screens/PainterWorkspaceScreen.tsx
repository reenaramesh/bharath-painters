import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Image, ScrollView, View } from 'react-native';
import { Button, Card, Text, TextInput, useTheme } from 'react-native-paper';
import * as ImagePicker from 'expo-image-picker';
import * as Network from 'expo-network';
import { api } from '../providers/AppProvider';
import { useApp } from '../providers/AppProvider';
import { ApiError } from '../core/api';
import { enqueueMobileOperation } from '../core/offlineQueue';
import { OfflineQueuePanel } from '../components/OfflineQueuePanel';
import { Heading, Screen, State, styles } from '../components/ui';
import { tokens } from '../theme';
import { createWorkPhotoUploadParts, type WorkPhotoStage } from '../core/workPhotoUpload';

type Assignment = { id: number; status: string; schedule: number; contractor_id: number; quotation_number: string; contractor_name: string; customer_name: string; property_name: string; address: string; city: string; start_date: string; end_date: string; work_scope: { id: number; description: string; quantity: string; unit: string }[] };
type EmploymentOption = { membership_id: number; employee_code: string; contractor_id: number; contractor_name: string };
type AttendanceRecord = { id: number; date: string; status: string; approval_status: string; overtime_hours: string; note?: string };
type SalaryRevision = { id: number; previous_salary_basis: string; previous_salary_amount?: string; salary_basis: string; salary_amount?: string; effective_from: string; recorded_at: string; changed_by: string };
type Employment = EmploymentOption & { employee_name?: string; name?: string; job_title?: string; blood_group?: string; mobile?: string; custom_fields?: Record<string, string | number | boolean>; custom_field_definitions?: { id: number; label: string; is_active: boolean }[]; salary_history?: SalaryRevision[]; profile_history?: { id: number; changes: { label: string; old_value?: unknown; new_value?: unknown }[]; changed_by: string; recorded_at: string }[]; employments: EmploymentOption[]; attendance: AttendanceRecord[] };
type JobRecord = { id: number; title: string; description: string; service_type: string; location: string; city: string; job_type: string; daily_wage?: string; weekly_wage?: string; start_date: string; end_date: string; status: string; has_applied: boolean };
type Booking = { id: number; work_type: string; contractor_name: string; start_date: string; end_date: string; agreed_wage?: string; status: string };
type Activity = { id: string; activity_type: string; application_id?: number; title: string; person: string; status: string; start_date: string; end_date: string };
type LedgerRow = { id: number; date: string; entry_type: string; amount: string; payment_mode: string; reference: string; note: string };
type Earnings = { payable_days?: string | number; daily_rate?: string; overtime_pay?: string; overtime_hours?: string; hourly_rate?: string; earning_type?: string; month: string; earned_amount: string; attendance_earning: string; bonus_total: string; payments_total?: string; advances_total?: string; outstanding_balance?: string; ledger?: LedgerRow[]; attendance: { date: string; status: string; approval_status?: string; earning: string; overtime_pay?: string; overtime_hours?: string; hourly_rate?: string }[] };
type WorkPhoto = { id: number; schedule: number; stage: WorkPhotoStage; area: string; caption: string; image: string; captured_at: string };

export function PainterWorkspaceScreen() {
  const routeParams = useLocalSearchParams<{ tab?: string }>();
  const { user } = useApp();
  const theme = useTheme();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [employment, setEmployment] = useState<Employment | null>(null);
  const [selectedMembershipId, setSelectedMembershipId] = useState<number | null>(null);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [applications, setApplications] = useState<Activity[]>([]);
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [tab, setTab] = useState<'ASSIGNMENTS' | 'JOBS' | 'APPLICATIONS' | 'BOOKINGS' | 'ATTENDANCE' | 'EARNINGS'>(() => routeParams.tab === 'EARNINGS' ? 'EARNINGS' : routeParams.tab === 'ATTENDANCE' ? 'ATTENDANCE' : 'ASSIGNMENTS');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const [photoSchedule, setPhotoSchedule] = useState<number | null>(null);
  const [photoAsset, setPhotoAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [photoStage, setPhotoStage] = useState<WorkPhotoStage>('PROGRESS');
  const [photoArea, setPhotoArea] = useState('');
  const [photoCaption, setPhotoCaption] = useState('');
  const [photos, setPhotos] = useState<WorkPhoto[]>([]);
  const today = new Date().toLocaleDateString('en-CA');
  const load = useCallback(async () => {
    if (!user) return;
    const [work, employee, jobRows, bookingRows, activityRows, earningsRow] = await Promise.allSettled([
      api.get<Assignment[]>('/jobs/my-assignments/'),
      api.get<Employment>('/jobs/my-in-house-employment/', selectedMembershipId ? { membership_id: selectedMembershipId } : undefined),
      api.get<{ jobs?: JobRecord[] }>('/jobs/list/'),
      api.get<{ results?: Booking[] }>('/jobs/applicator-bookings/'),
      api.get<{ results?: Activity[] }>('/jobs/activity/'),
      api.get<Earnings>('/jobs/my-in-house-earnings/', selectedMembershipId ? { membership_id: selectedMembershipId } : undefined),
    ]);
    if (work.status === 'fulfilled') { setAssignments(work.value); setError(''); }
    else setError(work.reason instanceof Error ? work.reason.message : 'Assignments could not be loaded.');
    if (employee.status === 'fulfilled') {
      setEmployment(employee.value);
      if (!selectedMembershipId && employee.value.membership_id) setSelectedMembershipId(employee.value.membership_id);
    } else setEmployment(null);
    setJobs(jobRows.status === 'fulfilled' ? jobRows.value.jobs || [] : []);
    setBookings(bookingRows.status === 'fulfilled' ? bookingRows.value.results || [] : []);
    setApplications(activityRows.status === 'fulfilled' ? (activityRows.value.results || []).filter(row => row.activity_type === 'Job application') : []);
    setEarnings(earningsRow.status === 'fulfilled' ? earningsRow.value : null);
  }, [user?.id, selectedMembershipId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (routeParams.tab === 'EARNINGS') setTab('EARNINGS'); }, [routeParams.tab]);
  useEffect(() => { if (routeParams.tab === 'ATTENDANCE') setTab('ATTENDANCE'); }, [routeParams.tab]);
  async function progress(item: Assignment, action: string) {
    setBusy(item.id); setError(''); setNotice('');
    try { await api.request(`/jobs/my-assignments/${item.id}/progress/`, { action }); setNotice(`Assignment ${action.toLowerCase().replaceAll('_', ' ')} saved.`); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Assignment update could not be saved.'); }
    finally { setBusy(null); }
  }
async function markAttendance(item: Assignment) {
    if (!employment || employment.membership_id !== selectedMembershipId || item.contractor_id !== employment.contractor_id) return;
    setBusy(item.id); setError(''); setNotice('');
    const endpoint = `/jobs/in-house-applicators/${employment.membership_id}/attendance/`;
    const payload = { date: today, status: 'PRESENT', assignment: item.id, schedule: item.schedule };
    try {
      const network = await Network.getNetworkStateAsync();
      if (!network.isConnected || network.isInternetReachable === false) throw new Error('offline');
      await api.request(endpoint, payload);
      setNotice('Attendance submitted. Your contractor must approve it before it contributes to earnings.');
    } catch (cause) {
      if ((cause instanceof Error && cause.message === 'offline') || (cause instanceof ApiError && cause.status === 0)) {
        try {
          await enqueueMobileOperation({ actorId: user!.id, kind: 'attendance', endpoint, payload, expectedVersion: null });
          setNotice('Attendance saved on this device. It will retry when the app is online; contractor approval is still required.');
        } catch (queueError) { setError(queueError instanceof Error ? queueError.message : 'Attendance could not be saved offline.'); }
      } else setError(cause instanceof Error ? cause.message : 'Attendance could not be submitted.');
    } finally { setBusy(null); }
  }
  async function applyForJob(item: JobRecord) {
    setBusy(item.id); setError(''); setNotice('');
    try { await api.request(`/jobs/${item.id}/apply/`, {}); setNotice('Application sent to the contractor.'); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Application could not be sent.'); }
    finally { setBusy(null); }
  }
  async function respondToBooking(item: Booking, action: 'ACCEPT' | 'REJECT') {
    setBusy(item.id); setError(''); setNotice('');
    try { await api.patch(`/jobs/applicator-bookings/${item.id}/action/`, { action }); setNotice(`Booking ${action.toLowerCase()}ed.`); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Booking response could not be saved.'); }
    finally { setBusy(null); }
  }
  async function openPhotos(item: Assignment) {
    setPhotoSchedule(item.schedule); setPhotoAsset(null); setPhotoArea(''); setPhotoCaption(''); setError('');
    try {
      const response = await api.get<{ results?: WorkPhoto[] }>('/jobs/work-photos/', { schedule: item.schedule });
      setPhotos(response.results || []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Project photos could not be loaded.'); }
  }
  async function choosePhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { setError('Allow photo-library access to attach a project progress photo.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.82 });
    if (!result.canceled) setPhotoAsset(result.assets[0] || null);
  }
  async function uploadPhoto() {
    if (!photoSchedule || !photoAsset) { setError('Choose a photo before uploading.'); return; }
    setBusy(photoSchedule); setError(''); setNotice('');
    try {
      const parts = createWorkPhotoUploadParts(photoSchedule, photoAsset, photoStage, photoArea, photoCaption);
      const form = new FormData();
      Object.entries(parts.fields).forEach(([key, value]) => form.append(key, value));
      const webFile = (photoAsset as ImagePicker.ImagePickerAsset & { file?: Blob }).file;
      form.append('image', webFile || parts.image as unknown as Blob);
      await api.upload('/jobs/work-photos/', form);
      setPhotoAsset(null); setPhotoCaption(''); setNotice('Progress photo uploaded to this project.');
      const response = await api.get<{ results?: WorkPhoto[] }>('/jobs/work-photos/', { schedule: photoSchedule });
      setPhotos(response.results || []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Photo could not be uploaded. Try again when connected.'); }
    finally { setBusy(null); }
  }
  return <Screen scroll={false}><ScrollView contentContainerStyle={[styles.content, { paddingBottom: tokens.space.xxl }]}>
    <Heading title="Painter workspace" subtitle="Your assigned projects, attendance and work updates." />
    <OfflineQueuePanel actorId={user?.id} />
    {employment && (employment.employments || []).length > 1 && <View style={{ gap: 8 }}><Text variant="titleSmall">Employment and payroll account</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{employment.employments.map(item => <Button key={item.membership_id} mode={item.membership_id === selectedMembershipId ? 'contained-tonal' : 'outlined'} onPress={() => setSelectedMembershipId(item.membership_id)}>{item.contractor_name}</Button>)}</ScrollView></View>}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
      {([['ASSIGNMENTS', 'Assignments'], ['JOBS', 'Available jobs'], ['APPLICATIONS', 'Applications'], ['BOOKINGS', 'Bookings'], ['ATTENDANCE', 'Attendance'], ['EARNINGS', 'Earnings']] as const).map(([key, label]) => <Button key={key} mode={tab === key ? 'contained-tonal' : 'outlined'} onPress={() => setTab(key)}>{label}</Button>)}
    </ScrollView>
    {employment && <Card mode="outlined"><Card.Content style={{ gap: 5 }}><Text variant="titleSmall">Employment details · {employment.employee_code}</Text><Text variant="bodySmall">{employment.contractor_name}{employment.job_title ? ` · ${employment.job_title}` : ''}</Text>{!!employment.blood_group && <Text variant="bodySmall">Blood group: {employment.blood_group}</Text>}{employment.custom_field_definitions?.filter(field => employment.custom_fields?.[String(field.id)] !== undefined).map(field => <Text key={field.id} variant="bodySmall">{field.label}: {String(employment.custom_fields?.[String(field.id)])}</Text>)}</Card.Content></Card>}
    {!!error && <State title="Action needs attention" description={error} action="Reload" onAction={() => void load()} />}
    {!!notice && <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.primary }}>{notice}</Text>}
    {tab === 'ASSIGNMENTS' && assignments.length === 0 && !error && <State title="No active assignments" description="Accepted job and booking assignments appear here." action="Refresh" onAction={() => void load()} />}
    {tab === 'ASSIGNMENTS' && assignments.map(item => <Card key={item.id} mode="outlined"><Card.Content style={{ gap: tokens.space.xs }}>
      <Text variant="titleMedium">{item.property_name} Â· {item.quotation_number}</Text>
      <Text variant="bodyMedium">{item.customer_name} Â· {item.contractor_name}</Text>
      <Text variant="bodySmall">{[item.address, item.city].filter(Boolean).join(', ')} Â· {item.start_date} to {item.end_date}</Text>
      {item.work_scope?.map(scope => <Text key={scope.id} variant="bodySmall">{scope.description}: {scope.quantity} {scope.unit}</Text>)}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        {item.status === 'ASSIGNED' && <Button mode="contained" disabled={busy === item.id} onPress={() => void progress(item, 'ACCEPT')}>Accept assignment</Button>}
        {item.status === 'ACCEPTED' && <><Button mode="outlined" disabled={busy === item.id} onPress={() => void progress(item, 'ON_THE_WAY')}>On the way</Button><Button mode="contained" disabled={busy === item.id} onPress={() => void progress(item, 'START')}>Start work</Button></>}
        {item.status === 'IN_PROGRESS' && <Button mode="contained" disabled={busy === item.id} onPress={() => void progress(item, 'COMPLETE')}>Mark my work complete</Button>}
        {employment && employment.membership_id === selectedMembershipId && item.contractor_id === employment.contractor_id && item.status === 'IN_PROGRESS' && <Button mode="outlined" disabled={busy === item.id || employment.membership_id !== selectedMembershipId} onPress={() => void markAttendance(item)}>Submit todayâ€™s attendance</Button>}
        {['ASSIGNED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED'].includes(item.status) && <Button mode="outlined" icon="camera-outline" disabled={busy === item.schedule} onPress={() => void openPhotos(item)}>Progress photos</Button>}
      </View>
      {photoSchedule === item.schedule && <View style={{ gap: 8, paddingTop: 8 }}>
        <Text variant="titleSmall">Project progress photos</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {([['BEFORE', 'Before'], ['PROGRESS', 'Progress'], ['AFTER', 'After']] as const).map(([value, label]) => <Button key={value} mode={photoStage === value ? 'contained-tonal' : 'outlined'} contentStyle={{ minHeight: 40 }} onPress={() => setPhotoStage(value)}>{label}</Button>)}
        </View>
        <TextInput label="Area (optional)" value={photoArea} onChangeText={setPhotoArea} accessibilityLabel="Photo area" />
        <TextInput label="Caption (optional)" value={photoCaption} onChangeText={setPhotoCaption} accessibilityLabel="Photo caption" />
        <Button mode="outlined" icon="image-plus" contentStyle={{ minHeight: 46 }} onPress={() => void choosePhoto()}>{photoAsset ? `Selected: ${photoAsset.fileName || 'work photo'}` : 'Choose photo'}</Button>
        <Button mode="contained" icon="cloud-upload-outline" contentStyle={{ minHeight: 46 }} disabled={!photoAsset || busy === item.schedule} loading={busy === item.schedule} onPress={() => void uploadPhoto()}>Upload photo</Button>
        {photos.map(photo => <Card key={photo.id} mode="outlined"><Card.Content style={{ gap: 6 }}><Image source={{ uri: photo.image }} accessibilityLabel={`${photo.stage.toLowerCase()} project photo`} style={{ width: '100%', height: 180, borderRadius: 12 }} resizeMode="cover"/><Text variant="labelMedium">{photo.stage} Â· {photo.area || 'Project'}</Text>{!!photo.caption && <Text variant="bodySmall">{photo.caption}</Text>}<Text variant="bodySmall">{photo.captured_at ? new Date(photo.captured_at).toLocaleString() : ''}</Text></Card.Content></Card>)}
      </View>}
    </Card.Content></Card>)}
    {tab === 'JOBS' && jobs.map(item => <Card key={item.id} mode="outlined"><Card.Content style={{ gap: tokens.space.xs }}><Text variant="titleMedium">{item.title}</Text><Text>{item.service_type} Â· {item.location}, {item.city}</Text><Text variant="bodySmall">{item.start_date} to {item.end_date} Â· {item.job_type}</Text><Text variant="bodySmall">{item.description}</Text><Text variant="bodySmall">{item.daily_wage ? `â‚¹${item.daily_wage}/day` : item.weekly_wage ? `â‚¹${item.weekly_wage}/week` : ''}</Text><Button mode="contained" disabled={item.has_applied || !!busy} onPress={() => void applyForJob(item)}>{item.has_applied ? 'Applied' : 'Apply'}</Button></Card.Content></Card>)}
    {tab === 'APPLICATIONS' && applications.map(item => <Card key={item.id} mode="outlined"><Card.Content style={{ gap: 4 }}><Text variant="titleMedium">{item.title}</Text><Text>{item.person} Â· {item.status.replaceAll('_', ' ')}</Text><Text variant="bodySmall">{item.start_date} to {item.end_date}</Text></Card.Content></Card>)}
    {tab === 'BOOKINGS' && bookings.map(item => <Card key={item.id} mode="outlined"><Card.Content style={{ gap: 4 }}><Text variant="titleMedium">{item.work_type}</Text><Text>{item.contractor_name} Â· {item.status.replaceAll('_', ' ')}</Text><Text variant="bodySmall">{item.start_date} to {item.end_date}{item.agreed_wage ? ` Â· â‚¹${item.agreed_wage}` : ''}</Text>{item.status === 'PENDING' && <View style={{ flexDirection: 'row', gap: 8 }}><Button mode="contained" disabled={!!busy} onPress={() => void respondToBooking(item, 'ACCEPT')}>Accept</Button><Button mode="outlined" disabled={!!busy} onPress={() => void respondToBooking(item, 'REJECT')}>Decline</Button></View>}</Card.Content></Card>)}
    {tab === 'ATTENDANCE' && <>
      <Text variant="titleMedium">Today on assigned work</Text>
      {!employment && <State title="Attendance unavailable" description="Self check-in is available for active in-house assignments. Freelance bookings and their approved earnings remain separate." />}
      {employment && assignments.filter(item => item.contractor_id === employment.contractor_id && ['ACCEPTED', 'IN_PROGRESS'].includes(item.status)).map(item => <Card key={item.id} mode="outlined"><Card.Content style={{ gap: 8 }}><Text variant="titleSmall">{item.property_name} Â· {item.start_date}</Text><Text variant="bodySmall">Submitted attendance remains pending until your contractor reviews it.</Text><Button mode="contained-tonal" disabled={busy === item.id || employment.membership_id !== selectedMembershipId} onPress={() => void markAttendance(item)}>Submit today&apos;s attendance</Button></Card.Content></Card>)}
      <Text variant="titleMedium">Attendance history</Text>
      {employment?.attendance?.map(row => <Card key={row.id} mode="outlined"><Card.Content style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}><Text>{row.date} Â· {row.status.replaceAll('_', ' ')}</Text><Text>{row.approval_status === 'APPROVED' ? 'Approved' : row.approval_status === 'REJECTED' ? 'Rejected' : 'Pending review'}</Text></Card.Content></Card>)}
      {!employment?.attendance?.length && <State title="No attendance history" description="Submitted attendance will appear here. Contractor approval is required before earnings post." />}
    </>}
    {tab === 'EARNINGS' && (earnings ? <Card mode="outlined"><Card.Content style={{ gap: 8 }}>
        <Text variant="titleMedium">{earnings.month} earnings</Text>
        {earnings.earning_type === 'IN_HOUSE' && (
          <>
            <Card style={{ backgroundColor: '#E3F2FD' }}><Card.Content style={{ gap: 4 }}>
              <Text variant="labelMedium" style={{ color: theme.colors.primary }}>Fixed Wage (Base)</Text>
              <Text variant="titleMedium">₹{earnings.attendance_earning}</Text>
              <Text variant="bodySmall">{earnings.payable_days} days × ₹{earnings.daily_rate}/day</Text>
            </Card.Content></Card>
            {earnings.overtime_pay && Number(earnings.overtime_pay) > 0 && (
              <Card style={{ backgroundColor: '#FFF3E0' }}><Card.Content style={{ gap: 4 }}>
                <Text variant="labelMedium" style={{ color: theme.colors.tertiary }}>Overtime Pay</Text>
                <Text variant="titleMedium">₹{earnings.overtime_pay}</Text>
                <Text variant="bodySmall">{earnings.overtime_hours} hrs × ₹{earnings.hourly_rate}/hr</Text>
              </Card.Content></Card>
            )}
            {earnings.bonus_total && Number(earnings.bonus_total) > 0 && (
              <Card style={{ backgroundColor: '#E8F5E9' }}><Card.Content style={{ gap: 4 }}>
                <Text variant="labelMedium" style={{ color: theme.colors.tertiary }}>Bonuses</Text>
                <Text variant="titleMedium">₹{earnings.bonus_total}</Text>
              </Card.Content></Card>
            )}
            <Card><Card.Content style={{ gap: 4 }}>
              <Text variant="labelMedium">Gross Total</Text>
              <Text variant="headlineSmall">₹{earnings.earned_amount}</Text>
            </Card.Content></Card>
          </>
        )}
        {earnings.earning_type === 'MARKETPLACE' && (
          <>
            <Text>Assignments Earnings: ₹{earnings.attendance_earning}</Text>
            {earnings.bonus_total && Number(earnings.bonus_total) > 0 && <Text>Bonuses: ₹{earnings.bonus_total}</Text>}
            <Text variant="titleMedium">Total: ₹{earnings.earned_amount}</Text>
          </>
        )}
        {earnings.attendance.map((row, index) => <View key={`${row.date}-${index}`} style={{ paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: theme.colors.outlineVariant }}>
          <Text variant="bodySmall">{row.date} Â· {row.status.replaceAll('_', ' ')}{row.approval_status ? ` Â· ${row.approval_status}` : ''}</Text>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 2 }}>
            <Text variant="bodySmall">Base: ₹{row.earning || '0'}</Text>
            {row.overtime_pay && Number(row.overtime_pay) > 0 && (
              <Text variant="bodySmall" style={{ color: theme.colors.tertiary }}>OT: {row.overtime_hours}h × ₹{earnings.hourly_rate || row.hourly_rate || '0'} = ₹{row.overtime_pay}</Text>
            )}
          </View>
        </View>)}
      </Card.Content></Card> : <State title="Earnings unavailable" description="In-house approved attendance or completed marketplace assignments appear here." />)}
    {tab === 'EARNINGS' && earnings?.earning_type === 'IN_HOUSE' && <Card mode="outlined"><Card.Content style={{ gap: 8 }}><Text variant="titleMedium">Recorded wages and payments</Text><Text>Payments: ₹{earnings.payments_total || '0.00'}</Text><Text>Advances: ₹{earnings.advances_total || '0.00'}</Text><Text variant="titleMedium">Outstanding balance: ₹{earnings.outstanding_balance || '0.00'}</Text>{earnings.ledger?.map(row => <View key={row.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, borderTopWidth: 1, borderTopColor: theme.colors.outlineVariant, paddingVertical: 8 }}><View style={{ flex: 1 }}><Text>{row.entry_type.replaceAll('_', ' ')}</Text><Text variant="bodySmall">{row.date}{row.note ? ` · ${row.note}` : ''}</Text>{!!row.reference && <Text variant="bodySmall">Reference: {row.reference}</Text>}</View><Text>₹{row.amount}</Text></View>)}</Card.Content></Card>}
    {tab === 'EARNINGS' && employment?.salary_history?.map(row => <Card key={`salary-${row.id}`} mode="outlined"><Card.Content style={{ gap: 4 }}><Text variant="titleSmall">Salary rate updated</Text><Text>₹{row.previous_salary_amount || '0'} / {row.previous_salary_basis.toLowerCase()} → ₹{row.salary_amount || '0'} / {row.salary_basis.toLowerCase()}</Text><Text variant="bodySmall">Effective {row.effective_from} · recorded by {row.changed_by}</Text></Card.Content></Card>)}
    {tab === 'EARNINGS' && employment?.profile_history?.flatMap(row => row.changes.map((change, index) => <Card key={`profile-${row.id}-${index}`} mode="outlined"><Card.Content style={{ gap: 4 }}><Text variant="titleSmall">{change.label} updated</Text><Text>{String(change.old_value ?? '—')} → {String(change.new_value ?? '—')}</Text><Text variant="bodySmall">{new Date(row.recorded_at).toLocaleString()} · {row.changed_by}</Text></Card.Content></Card>))}
  </ScrollView></Screen>;
}


