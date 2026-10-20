import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, View } from 'react-native';
import { Button, Card, Text, TextInput, useTheme } from 'react-native-paper';
import { Stack, useFocusEffect, useLocalSearchParams, router } from 'expo-router';
import { DemoLabel, Heading, Screen, State, styles } from '../../../src/components/ui';
import { useApp, api } from '../../../src/providers/AppProvider';
import { demoRecords } from '../../../src/data/demo';
import { canOpenModule, formatINR, modules, type ModuleId } from '../../../src/core/navigation';
import { moduleDetailPath, mapRecord, parseModulePage, type NativeRecord } from '../../../src/core/moduleRecords';
import { ContactButtons, StatusPill, moduleStyles } from '../../../src/components/ModuleUI';
import { PropertyCreateScreen } from '../../../src/screens/PropertyCreateScreen';
import { ManualQuotationCreateScreen } from '../../../src/screens/ManualQuotationCreateScreen';
import { MeasurementQuotationCreateScreen } from '../../../src/screens/MeasurementQuotationCreateScreen';
import { tokens } from '../../../src/theme';

type Message = { id: number; sender: number; text: string; created_at: string; is_mine: boolean };
export default function RecordDetail() {
  const { module: moduleParam, id, customer } = useLocalSearchParams<{ module: string; id: string; customer?: string }>();
  const moduleId = moduleParam as ModuleId;
  const { user, demo, menuReady, disabledMenus } = useApp();
  const theme = useTheme();
  const entry = modules.find(item => item.id === moduleParam);
  const sample = entry && demo ? demoRecords[entry.id].find(item => item.id === id) : undefined;
  const [record, setRecord] = useState<NativeRecord | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerCity, setCustomerCity] = useState('');
  const [savingCustomer, setSavingCustomer] = useState(false);

  const load = useCallback(async () => {
    if (demo || !entry || !id || id === 'new' || !user) return;
    const path = moduleDetailPath(moduleId, id);
    if (!path) return;
    setBusy(true); setError(''); setRecord(null);
    if (moduleId === 'messages') setMessages([]);
    try {
      const data = await api.get<unknown>(path);
      if (moduleId === 'messages') {
        if (!Array.isArray(data)) throw new Error('Messages could not be loaded.');
        setMessages(data as Message[]);
      } else if (moduleId === 'measurements') {
        const parsed = parseModulePage(data, moduleId).rows;
        setRecord({ id, title: 'Measurements', subtitle: `${parsed.length} saved measurement record${parsed.length === 1 ? '' : 's'}`, status: parsed.length ? 'RECORDED' : 'EMPTY', location: '', reference: '', details: parsed.flatMap((item, index) => [{ label: `Measurement ${index + 1}`, value: item.title }, ...item.details]) });
      } else if ((moduleId === 'schedules' && !id.startsWith('visit-')) || moduleId === 'projects') {
        const schedule = parseModulePage(data, moduleId).rows.find(item => item.id === id);
        if (!schedule) throw new Error('This schedule is no longer available.');
        setRecord(schedule);
      } else setRecord(mapRecord(data, moduleId));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load this record.'); }
    finally { setBusy(false); }
  }, [demo, entry, id, moduleId, user]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const sendMessage = async () => {
    const text = draft.trim();
    if (!text || sending || demo || !id) return;
    setSending(true); setError('');
    try {
      const sent = await api.request<Message>(`/quotations/chat/conversations/${encodeURIComponent(id)}/messages/`, { text });
      setMessages(old => [...old, sent]); setDraft('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Message could not be sent.'); }
    finally { setSending(false); }
  };

  const createCustomer = async () => {
    const name = customerName.trim();
    const mobile = customerMobile.trim();
    if (!name || !mobile || savingCustomer) return;
    setSavingCustomer(true); setError('');
    try {
      await api.request('/quotations/customers/', { name, mobile, address: customerAddress.trim(), city: customerCity.trim() });
      router.back();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Customer could not be saved.'); }
    finally { setSavingCustomer(false); }
  };

  if (!entry || !user || !menuReady || !canOpenModule(user, moduleParam, disabledMenus)) return <Screen><State title="Access unavailable" description="Return to your workspace to choose an available tool." /></Screen>;
  if (moduleId === 'properties' && id === 'new') return <><Stack.Screen options={{ title: 'Add property' }} /><PropertyCreateScreen initialCustomer={customer} /></>;
  if (moduleId === 'quotations' && id === 'new' && user.role === 'CONTRACTOR' && !demo) return <><Stack.Screen options={{ title: 'New quotation' }} /><ManualQuotationCreateScreen /></>;
  if (moduleId === 'quotations' && id === 'measurement-new' && user.role === 'CONTRACTOR' && !demo) return <><Stack.Screen options={{ title: 'Measurement quotation' }} /><MeasurementQuotationCreateScreen /></>;
  if (moduleId === 'customers' && id === 'new') return <>
    <Stack.Screen options={{ title: 'Add customer' }} />
    <Screen>
      <Heading title="Add customer" subtitle="Create a connected customer using their name and mobile number." />
      <TextInput mode="outlined" label="Customer name" value={customerName} onChangeText={setCustomerName} autoCapitalize="words" accessibilityLabel="Customer name" />
      <TextInput mode="outlined" label="Mobile number" value={customerMobile} onChangeText={setCustomerMobile} keyboardType="phone-pad" accessibilityLabel="Mobile number" />
      <TextInput mode="outlined" label="Address (optional)" value={customerAddress} onChangeText={setCustomerAddress} multiline accessibilityLabel="Address" />
      <TextInput mode="outlined" label="City (optional)" value={customerCity} onChangeText={setCustomerCity} autoCapitalize="words" accessibilityLabel="City" />
      {error ? <State title="Customer not saved" description={error} /> : null}
      <Button mode="contained" icon="content-save-outline" disabled={!customerName.trim() || !customerMobile.trim() || savingCustomer} loading={savingCustomer} onPress={() => void createCustomer()} contentStyle={styles.control}>Save customer</Button>
    </Screen>
  </>;
  if (moduleId === 'messages') return <>
    <Stack.Screen options={{ title: 'Conversation' }} />
    <Screen scroll={false}>
      {demo && <DemoLabel />}
      {error ? <State title="Message update failed" description={error} action="Retry" onAction={() => void load()} /> : null}
      {!demo && busy && messages.length === 0 ? <ActivityIndicator accessibilityLabel="Loading conversation" style={{ marginTop: 32 }} /> : <FlatList
        data={messages}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={[styles.content, { flexGrow: 1, justifyContent: messages.length ? 'flex-end' : 'center' }]}
        ListEmptyComponent={<State title={demo ? sample?.title || 'Sample conversation' : 'No messages yet'} description={demo ? sample?.subtitle || 'This is an example conversation.' : 'Send a message to start the conversation.'} />}
        renderItem={({ item }) => <View style={{ alignSelf: item.is_mine ? 'flex-end' : 'flex-start', maxWidth: '86%' }}><Card mode="contained" style={{ backgroundColor: item.is_mine ? theme.colors.primaryContainer : theme.colors.surfaceVariant, borderRadius: 16 }}><Card.Content><Text>{item.text || 'Shared attachment'}</Text><Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 5 }}>{item.created_at ? new Date(item.created_at).toLocaleString() : ''}</Text></Card.Content></Card></View>}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      />}
      {!demo && <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={88} style={{ padding: 12, flexDirection: 'row', gap: 8, alignItems: 'center', borderTopWidth: 1, borderColor: theme.colors.outlineVariant }}><TextInput mode="outlined" dense accessibilityLabel="Message" placeholder="Write a message" value={draft} onChangeText={setDraft} multiline style={{ flex: 1, maxHeight: 110 }} /><Button mode="contained" accessibilityLabel="Send message" disabled={!draft.trim() || sending} loading={sending} onPress={() => void sendMessage()} contentStyle={{ minHeight: 48 }} icon="send">Send</Button></KeyboardAvoidingView>}
      {demo && <Button onPress={() => router.back()} contentStyle={styles.control}>Close conversation</Button>}
    </Screen>
  </>;

  const activeRecord = demo && sample ? { ...sample, location: sample.subtitle, reference: '', details: [{ label: 'Details', value: sample.note || sample.subtitle }] } as NativeRecord : record;
  if (!activeRecord && busy) return <Screen><Stack.Screen options={{ title: entry.label }} /><ActivityIndicator accessibilityLabel="Loading details" style={{ marginTop: 32 }} /></Screen>;
  if (!activeRecord) return <Screen><Stack.Screen options={{ title: entry.label }} /><State title={error ? 'Could not load details' : 'Record not found'} description={error || 'Return to the list and choose another record.'} action={error ? 'Retry' : undefined} onAction={() => void load()} /></Screen>;

  return <Screen>
    <Stack.Screen options={{ title: entry.label }} />
    <DemoLabel />
    <Heading title={activeRecord.title} subtitle={activeRecord.subtitle} />
    <Card mode="outlined" style={{ borderRadius: tokens.radius, borderColor: theme.colors.outlineVariant }}>
      <Card.Content style={{ gap: tokens.space.md }}>
        <View style={[moduleStyles.row, { justifyContent: 'space-between' }]}><StatusPill status={activeRecord.status} />{activeRecord.amount !== undefined && <Text variant="titleLarge" style={styles.bold}>{formatINR(activeRecord.amount)}</Text>}</View>
        {activeRecord.details.map((item, index) => <View key={`${item.label}-${index}`} style={{ gap: 3 }}><Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{item.label}</Text><Text variant="bodyMedium">{item.value}</Text></View>)}
        {activeRecord.progress !== undefined && <Text variant="bodyMedium">Progress: {activeRecord.progress}%</Text>}
        <ContactButtons phone={activeRecord.phone} />
      </Card.Content>
    </Card>
    {moduleId === 'properties' && <Button mode="outlined" icon="ruler-square" contentStyle={styles.control} onPress={() => router.push({ pathname: '/record/[module]/[id]', params: { module: 'measurements', id: activeRecord.id } })}>View measurements</Button>}
    {moduleId === 'quotations' && activeRecord.customerId && <Button mode="outlined" icon="account-outline" contentStyle={styles.control} onPress={() => router.push({ pathname: '/record/[module]/[id]', params: { module: 'customers', id: String(activeRecord.customerId) } })}>View customer</Button>}
    {moduleId === 'quotations' && activeRecord.propertyId && <Button mode="outlined" icon="home-outline" contentStyle={styles.control} onPress={() => router.push({ pathname: '/record/[module]/[id]', params: { module: 'properties', id: String(activeRecord.propertyId) } })}>View property</Button>}
    {moduleId === 'quotations' && activeRecord.propertyId && activeRecord.details.some(item => item.label === 'Measurement record') && <Button mode="outlined" icon="ruler-square" contentStyle={styles.control} onPress={() => router.push({ pathname: '/module/[module]', params: { module: 'measurements', propertyId: String(activeRecord.propertyId), measurementId: String(activeRecord.details.find(item => item.label === 'Measurement record')?.value || '') } })}>Open linked measurement</Button>}
    {moduleId === 'customers' && <Button mode="contained" icon="home-plus-outline" contentStyle={styles.control} onPress={() => router.push({ pathname: '/record/[module]/[id]', params: { module: 'properties', id: 'new', customer: activeRecord.id } })}>Add property for this customer</Button>}
    {moduleId === 'measurements' && activeRecord.details.length === 0 && <State title="No measurements saved" description="Measurement records for this property will appear here after they are created." />}
    {error && <State title="Refresh failed" description={error} action="Retry" onAction={() => void load()} />}
    {busy && <ActivityIndicator accessibilityLabel="Refreshing record" />}
  </Screen>;
}
