import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Button, Card, Text, TextInput, useTheme } from 'react-native-paper';
import { router } from 'expo-router';
import { api } from '../providers/AppProvider';
import { Heading, Screen, State, styles } from '../components/ui';
import { buildManualQuotationPayload, validateManualQuotationDraft, type ManualQuotationDraft, type ManualQuotationLine } from '../core/manualQuotationDraft';
import { tokens } from '../theme';

type CustomerRow = { id: number; name: string; mobile?: string; connection_status?: string };
type PropertyRow = { id: number; customer: number | { id: number }; name?: string; property_name?: string; property_type?: string; city?: string };
const rows = <T,>(value: unknown): T[] => Array.isArray(value) ? value as T[] : value && typeof value === 'object' && Array.isArray((value as { results?: unknown }).results) ? (value as { results: T[] }).results : [];

export function ManualQuotationCreateScreen() {
  const theme = useTheme();
  const [step, setStep] = useState(0);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [draft, setDraft] = useState<ManualQuotationDraft>({
    customer: '', property: '', items: [{ description: '', quantity: '1', rate: '0', discountType: 'FIXED', discountValue: '0' }],
    discountMode: 'OVERALL', discountType: 'FIXED', discountValue: '0', gstMode: 'GST_EXTRA', gstPercentage: '18', notes: '',
  });
  const propertyRows = useMemo(() => properties.filter(row => String(typeof row.customer === 'object' ? row.customer.id : row.customer) === draft.customer), [properties, draft.customer]);

  useEffect(() => {
    let active = true;
    Promise.all([api.get<unknown>('/quotations/customers/', { include_saved: 1 }), api.get<unknown>('/quotations/properties/')])
      .then(([customerData, propertyData]) => { if (active) { setCustomers(rows<CustomerRow>(customerData).filter(customer => customer.connection_status === 'CONNECTED')); setProperties(rows<PropertyRow>(propertyData)); } })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Quotation options could not be loaded.'); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);

  const changeLine = (index: number, key: keyof ManualQuotationLine, value: string) => setDraft(current => ({ ...current, items: current.items.map((item, i) => i === index ? { ...item, [key]: value } : item) }));
  const create = async () => {
    const validation = validateManualQuotationDraft(draft);
    if (validation) { setError(validation); return; }
    setSaving(true); setError(''); setNotice('');
    try {
      const quotation = await api.request<{ id: number }>('/quotations/create/', buildManualQuotationPayload(draft));
      router.replace({ pathname: '/record/[module]/[id]', params: { module: 'quotations', id: String(quotation.id) } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Draft could not be saved. Your entries are still here; retry when connected.');
      setNotice('');
    } finally { setSaving(false); }
  };

  const selectCustomer = (id: number) => setDraft(current => ({ ...current, customer: String(id), property: '' }));
  const next = () => {
    const invalid = step === 0 ? !draft.customer ? 'Choose a connected customer.' : !draft.property ? 'Choose a property for this quotation.' : '' : draft.items.some(item => !item.description.trim() || Number(item.quantity) <= 0 || Number(item.rate) < 0 || !Number.isFinite(Number(item.quantity)) || !Number.isFinite(Number(item.rate))) ? 'Complete each description, quantity and rate before continuing.' : '';
    if (invalid) { setError(invalid); return; }
    setError(''); setStep(value => Math.min(value + 1, 2));
  };

  return <Screen scroll={false}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: tokens.space.xxl }]}>
    <Heading title="New quotation" subtitle="Create a manual quotation draft in three steps. Bharath Apps calculates and saves the totals." />
    <Text variant="labelLarge" style={{ color: theme.colors.primary }}>STEP {step + 1} OF 3 · {['Customer & property', 'Work details', 'Pricing & save'][step]}</Text>
    {!!error && <State title="Quotation needs attention" description={error} action="Retry" onAction={() => { setBusy(true); setError(''); void Promise.all([api.get<unknown>('/quotations/customers/', { include_saved: 1 }), api.get<unknown>('/quotations/properties/')]).then(([c, p]) => { setCustomers(rows<CustomerRow>(c).filter(customer => customer.connection_status === 'CONNECTED')); setProperties(rows<PropertyRow>(p)); }).catch(e => setError(e instanceof Error ? e.message : 'Quotation options could not be loaded.')).finally(() => setBusy(false)); }} />}
    {busy ? <State title="Loading quotation options" description="Fetching your connected customers and properties." /> : step === 0 ? <>
      <Text variant="titleSmall">Connected customer</Text>
      {!customers.length && <State title="No connected customers" description="Connect with a customer in Bharath Apps before creating a quotation." />}
      {customers.map(customer => <Card key={customer.id} mode={draft.customer === String(customer.id) ? 'contained' : 'outlined'} onPress={() => selectCustomer(customer.id)} accessibilityLabel={`Select ${customer.name}`}><Card.Content style={{ paddingVertical: 10 }}><Text variant="titleSmall">{customer.name}</Text><Text variant="bodySmall">{customer.mobile || 'Connected customer'}</Text></Card.Content></Card>)}
      {!!draft.customer && <><Text variant="titleSmall">Property</Text>{!propertyRows.length && <State title="No property for this customer" description="Create or connect a property before making a quotation." />}{propertyRows.map(property => <Card key={property.id} mode={draft.property === String(property.id) ? 'contained' : 'outlined'} onPress={() => setDraft(current => ({ ...current, property: current.property === String(property.id) ? '' : String(property.id) }))}><Card.Content style={{ paddingVertical: 8 }}><Text>{property.name || property.property_name || property.property_type || `Property ${property.id}`}</Text><Text variant="bodySmall">{property.city || ''}</Text></Card.Content></Card>)}</>}
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>This mobile flow creates a Manual / Lumpsum draft. Use the existing web builder for measurements, product specifications and grouped pricing.</Text>
    </> : step === 1 ? <>
      <Text variant="bodySmall">Add the work description, quantity and rate. The existing Django quotation API calculates line amounts.</Text>
      {draft.items.map((item, index) => <Card key={index} mode="outlined"><Card.Content style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text variant="titleSmall">Work line {index + 1}</Text>{draft.items.length > 1 && <Button compact onPress={() => setDraft(current => ({ ...current, items: current.items.filter((_, i) => i !== index) }))}>Remove</Button>}</View>
        <TextInput mode="outlined" label="Work description" value={item.description} onChangeText={value => changeLine(index, 'description', value)} accessibilityLabel={`Work description line ${index + 1}`} />
        <View style={{ flexDirection: 'row', gap: 8 }}><TextInput mode="outlined" label="Quantity" keyboardType="decimal-pad" value={item.quantity} onChangeText={value => changeLine(index, 'quantity', value)} style={{ flex: 1 }} accessibilityLabel={`Quantity line ${index + 1}`} /><TextInput mode="outlined" label="Rate (₹)" keyboardType="decimal-pad" value={item.rate} onChangeText={value => changeLine(index, 'rate', value)} style={{ flex: 1 }} accessibilityLabel={`Rate line ${index + 1}`} /></View>
        <Text variant="labelLarge">Line discount</Text><View style={{ flexDirection: 'row', gap: 8 }}><Button mode={(item.discountType || 'FIXED') === 'FIXED' ? 'contained-tonal' : 'outlined'} onPress={() => setDraft(current => ({ ...current, items: current.items.map((row, i) => i === index ? { ...row, discountType: 'FIXED' } : row) }))}>Fixed</Button><Button mode={item.discountType === 'PERCENTAGE' ? 'contained-tonal' : 'outlined'} onPress={() => setDraft(current => ({ ...current, items: current.items.map((row, i) => i === index ? { ...row, discountType: 'PERCENTAGE' } : row) }))}>Percentage</Button></View>
        <TextInput mode="outlined" label={(item.discountType || 'FIXED') === 'FIXED' ? 'Line discount amount (₹)' : 'Line discount percentage'} keyboardType="decimal-pad" value={item.discountValue || '0'} onChangeText={value => changeLine(index, 'discountValue', value)} accessibilityLabel={`Line discount line ${index + 1}`} />
      </Card.Content></Card>)}
      <Button mode="outlined" icon="plus" onPress={() => setDraft(current => ({ ...current, items: [...current.items, { description: '', quantity: '1', rate: '0', discountType: 'FIXED', discountValue: '0' }] }))} contentStyle={styles.control}>Add work line</Button>
    </> : <>
      <Text variant="bodySmall">Choose the existing discount and GST policies. Final totals are calculated and returned by the server when you save.</Text>
      <Text variant="titleSmall">Discount application</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{(['OVERALL', 'LINE', 'BOTH'] as const).map(value => <Button key={value} mode={draft.discountMode === value ? 'contained-tonal' : 'outlined'} onPress={() => setDraft(current => ({ ...current, discountMode: value }))}>{value === 'OVERALL' ? 'Overall' : value === 'LINE' ? 'Per line' : 'Line + overall'}</Button>)}</View>
      <Text variant="titleSmall">Discount type</Text><View style={{ flexDirection: 'row', gap: 8 }}><Button mode={draft.discountType === 'FIXED' ? 'contained-tonal' : 'outlined'} onPress={() => setDraft(current => ({ ...current, discountType: 'FIXED' }))}>Fixed amount</Button><Button mode={draft.discountType === 'PERCENTAGE' ? 'contained-tonal' : 'outlined'} onPress={() => setDraft(current => ({ ...current, discountType: 'PERCENTAGE' }))}>Percentage</Button></View>
      <TextInput mode="outlined" label={draft.discountType === 'FIXED' ? 'Discount amount (₹)' : 'Discount percentage'} keyboardType="decimal-pad" value={draft.discountValue} onChangeText={value => setDraft(current => ({ ...current, discountValue: value }))} accessibilityLabel="Discount value" />
      <Text variant="titleSmall">GST</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{(['GST_EXTRA', 'GST_INCLUDED', 'NO_GST'] as const).map(value => <Button key={value} mode={draft.gstMode === value ? 'contained-tonal' : 'outlined'} onPress={() => setDraft(current => ({ ...current, gstMode: value }))}>{value === 'GST_EXTRA' ? 'Extra' : value === 'GST_INCLUDED' ? 'Included' : 'No GST'}</Button>)}</View>
      {draft.gstMode !== 'NO_GST' && <TextInput mode="outlined" label="GST percentage" keyboardType="decimal-pad" value={draft.gstPercentage} onChangeText={value => setDraft(current => ({ ...current, gstPercentage: value }))} accessibilityLabel="GST percentage" />}
      <TextInput mode="outlined" label="Remarks (optional)" value={draft.notes} onChangeText={value => setDraft(current => ({ ...current, notes: value }))} multiline accessibilityLabel="Quotation remarks" />
      {!!notice && <Text accessibilityLiveRegion="polite">{notice}</Text>}
      <Button mode="contained" icon="content-save-outline" loading={saving} disabled={saving || !!validateManualQuotationDraft(draft)} onPress={() => void create()} contentStyle={styles.control}>Save draft</Button>
    </>}
    <View style={{ flexDirection: 'row', gap: 8 }}><Button mode="outlined" disabled={busy || saving || step === 0} onPress={() => { setError(''); setStep(value => Math.max(0, value - 1)); }} contentStyle={[styles.control, { flex: 1 }]}>Back</Button>{step < 2 && <Button mode="contained" disabled={busy || saving || (step === 0 && (!draft.customer || !draft.property))} onPress={next} contentStyle={[styles.control, { flex: 1 }]}>Continue</Button>}</View>
  </ScrollView></Screen>;
}
