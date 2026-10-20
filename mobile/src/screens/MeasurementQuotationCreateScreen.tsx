import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Button, Card, Text, TextInput, useTheme } from 'react-native-paper';
import { router } from 'expo-router';
import { api } from '../providers/AppProvider';
import { Heading, Screen, State, styles } from '../components/ui';
import { tokens } from '../theme';
import {
  buildMeasurementQuotationPayload,
  validateMeasurementQuotationDraft,
  type MeasurementQuotationDraft,
  type MeasurementQuotationRoom,
  type MeasurementQuotationScope,
  type MeasurementQuotationSurface,
} from '../core/measurementQuotationDraft';

type Row = { id: number; name?: string; mobile?: string; connection_status?: string; customer?: number | { id: number }; property_name?: string; property_type?: string; city?: string; reference_no?: string; measured_on?: string; status?: string; version?: number; surface_count?: number; total_sqft?: string };
type Master = { id: number; name: string; service_category?: number | null };
type RecordRow = Row & { id: number; version: number };
const rows = <T,>(value: unknown): T[] => Array.isArray(value) ? value as T[] : value && typeof value === 'object' && Array.isArray((value as { results?: unknown }).results) ? (value as { results: T[] }).results : [];
const baseScope = (workArea: 'INTERIOR' | 'EXTERIOR', surfaceType: 'WALL' | 'CEILING'): MeasurementQuotationScope => ({ workArea, surfaceType, serviceCategory: '', paintType: '', paintBrand: '', rate: '' });
const initial: MeasurementQuotationDraft = { customer: '', property: '', measurement: '', scopes: [], discountMode: 'OVERALL', discountType: 'FIXED', discountValue: '0', gstMode: 'GST_EXTRA', gstPercentage: '18', notes: '' };

export function MeasurementQuotationCreateScreen() {
  const theme = useTheme();
  const [step, setStep] = useState(0);
  const [customers, setCustomers] = useState<Row[]>([]);
  const [properties, setProperties] = useState<Row[]>([]);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [rooms, setRooms] = useState<MeasurementQuotationRoom[]>([]);
  const [surfaces, setSurfaces] = useState<MeasurementQuotationSurface[]>([]);
  const [categories, setCategories] = useState<Master[]>([]);
  const [products, setProducts] = useState<Master[]>([]);
  const [brands, setBrands] = useState<Master[]>([]);
  const [draft, setDraft] = useState<MeasurementQuotationDraft>(initial);
  const [busy, setBusy] = useState(true);
  const [loadingRecord, setLoadingRecord] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const customerProperties = useMemo(() => properties.filter(row => String(typeof row.customer === 'object' ? row.customer.id : row.customer) === draft.customer), [properties, draft.customer]);
  const record = records.find(row => String(row.id) === draft.measurement);
  const availableScopes = useMemo(() => {
    const options: MeasurementQuotationScope[] = [];
    (['INTERIOR', 'EXTERIOR'] as const).forEach(workArea => (['WALL', 'CEILING'] as const).forEach(surfaceType => {
      if (surfaces.some(surface => surface.work_area === workArea && surface.surface_type === surfaceType && Number(surface.net_area) > 0)) options.push(baseScope(workArea, surfaceType));
    }));
    return options;
  }, [surfaces]);
  const validation = validateMeasurementQuotationDraft(draft, categories, products);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.get<unknown>('/quotations/customers/', { include_saved: 1 }), api.get<unknown>('/quotations/properties/'),
      api.get<unknown>('/quotations/service-categories/'), api.get<unknown>('/quotations/paint-types/'), api.get<unknown>('/quotations/brands/'),
    ]).then(([customerData, propertyData, categoryData, productData, brandData]) => {
      if (!active) return;
      setCustomers(rows<Row>(customerData).filter(customer => customer.connection_status === 'CONNECTED'));
      setProperties(rows<Row>(propertyData)); setCategories(rows<Master>(categoryData)); setProducts(rows<Master>(productData)); setBrands(rows<Master>(brandData));
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Quotation options could not be loaded.'); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);

  const loadRecords = async (propertyId: string) => {
    setDraft(current => ({ ...current, property: propertyId, measurement: '', scopes: [] }));
    setRecords([]); setRooms([]); setSurfaces([]);
    if (!propertyId) return;
    setLoadingRecord(true); setError('');
    try { setRecords(rows<RecordRow>(await api.get(`/quotations/properties/${propertyId}/measurement-records/`))); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Saved Area Calculations could not be loaded.'); }
    finally { setLoadingRecord(false); }
  };

  const selectRecord = async (measurementId: string) => {
    setDraft(current => ({ ...current, measurement: measurementId, scopes: [] })); setRooms([]); setSurfaces([]); setError('');
    if (!measurementId || !draft.property) return;
    setLoadingRecord(true);
    try {
      const [roomData, surfaceData] = await Promise.all([
        api.get<unknown>(`/quotations/properties/${draft.property}/rooms/`, { measurement: measurementId }),
        api.get<unknown>(`/quotations/properties/${draft.property}/measurements/`, { measurement: measurementId }),
      ]);
      setRooms(rows<MeasurementQuotationRoom>(roomData)); setSurfaces(rows<MeasurementQuotationSurface>(surfaceData));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Measurement details could not be loaded.'); }
    finally { setLoadingRecord(false); }
  };

  const toggleScope = (option: MeasurementQuotationScope) => setDraft(current => {
    const key = (scope: MeasurementQuotationScope) => `${scope.workArea}:${scope.surfaceType}`;
    const existing = current.scopes.find(scope => key(scope) === key(option));
    return { ...current, scopes: existing ? current.scopes.filter(scope => key(scope) !== key(option)) : [...current.scopes, option] };
  });
  const updateScope = (index: number, key: keyof MeasurementQuotationScope, value: string) => setDraft(current => ({ ...current, scopes: current.scopes.map((scope, rowIndex) => rowIndex === index ? { ...scope, [key]: value, ...(key === 'serviceCategory' ? { paintType: '', paintBrand: '' } : {}) } : scope) }));

  const save = async () => {
    const invalid = validateMeasurementQuotationDraft(draft, categories, products);
    if (invalid) { setError(invalid); return; }
    if (!record) { setError('Reload the saved Area Calculation and try again.'); return; }
    setSaving(true); setError(''); setNotice('');
    try {
      const payload = buildMeasurementQuotationPayload(draft, record, rooms, surfaces);
      if (!payload.items.length) throw new Error('The selected work has no saved measured area.');
      const quotation = await api.request<{ id: number }>('/quotations/create/', payload);
      router.replace({ pathname: '/record/[module]/[id]', params: { module: 'quotations', id: String(quotation.id) } });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Draft could not be saved. Your entries remain here; retry when connected.'); setNotice(''); }
    finally { setSaving(false); }
  };

  const next = () => {
    const invalid = step === 0 ? !draft.customer ? 'Choose a connected customer.' : !draft.property ? 'Choose a property.' : !draft.measurement ? 'Choose a saved Area Calculation.' : !rooms.length || !surfaces.length ? 'This Area Calculation has no saved rooms and measured surfaces.' : '' : step === 1 ? !draft.scopes.length ? 'Select at least one measured work area.' : draft.scopes.some(scope => !scope.serviceCategory || (categories.find(item => String(item.id) === scope.serviceCategory)?.name.toLowerCase().includes('paint') && !scope.paintType)) ? 'Choose a category and required paint product for each work area.' : '' : '';
    if (invalid) { setError(invalid); return; }
    setError(''); setStep(value => Math.min(value + 1, 2));
  };

  const fieldLabel = (scope: MeasurementQuotationScope) => `${scope.workArea === 'INTERIOR' ? 'Interior' : 'Exterior'} ${scope.surfaceType === 'WALL' ? 'Walls' : 'Ceiling'}`;

  return <Screen scroll={false}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: tokens.space.xxl }]}>
    <Heading title="Measurement quotation" subtitle="Price grouped work from an existing Area Calculation. Bharath Apps validates sources and calculates totals." />
    <Text variant="labelLarge" style={{ color: theme.colors.primary }}>STEP {step + 1} OF 3 · {['Customer & measurement', 'Grouped work & materials', 'Pricing & save'][step]}</Text>
    {!!error && <State title="Quotation needs attention" description={error} action={busy ? undefined : 'Dismiss'} onAction={() => setError('')} />}
    {busy ? <State title="Loading quotation options" description="Fetching connected customers, properties and work categories." /> : step === 0 ? <>
      <Text variant="titleSmall">Connected customer</Text>
      {!customers.length && <State title="No connected customers" description="Connect with a customer before creating a quotation." />}
      {customers.map(customer => <Card key={customer.id} mode={draft.customer === String(customer.id) ? 'contained' : 'outlined'} onPress={() => { setDraft(current => ({ ...current, customer: String(customer.id), property: '', measurement: '', scopes: [] })); setRecords([]); setRooms([]); setSurfaces([]); }} accessibilityLabel={`Select ${customer.name}`}><Card.Content style={{ paddingVertical: 9 }}><Text variant="titleSmall">{customer.name}</Text><Text variant="bodySmall">{customer.mobile || 'Connected customer'}</Text></Card.Content></Card>)}
      {!!draft.customer && <><Text variant="titleSmall">Property</Text>{!customerProperties.length && <State title="No property for this customer" description="Create or connect a property before quoting measured work." />}{customerProperties.map(property => <Card key={property.id} mode={draft.property === String(property.id) ? 'contained' : 'outlined'} onPress={() => void loadRecords(String(property.id))}><Card.Content style={{ paddingVertical: 8 }}><Text>{property.name || property.property_name || property.property_type || `Property ${property.id}`}</Text><Text variant="bodySmall">{property.city || ''}</Text></Card.Content></Card>)}</>}
      {!!draft.property && <><Text variant="titleSmall">Saved Area Calculation</Text>{loadingRecord && <Text>Loading saved measurements…</Text>}{!loadingRecord && !records.length && <State title="No saved calculations" description="Save rooms and measured surfaces in Measurements first." />}{records.map(row => <Card key={row.id} mode={draft.measurement === String(row.id) ? 'contained' : 'outlined'} onPress={() => void selectRecord(String(row.id))}><Card.Content style={{ paddingVertical: 8 }}><Text variant="titleSmall">{row.reference_no || `Area Calculation ${row.id}`}</Text><Text variant="bodySmall">{row.measured_on || ''} · {row.surface_count ?? '—'} surfaces · {row.total_sqft ?? '—'} sq ft · {row.status || 'Saved'}</Text></Card.Content></Card>)}</>}
      {!!draft.measurement && <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>This quotation uses the saved measurement version. This form does not change the source Area Calculation.</Text>}
    </> : step === 1 ? <>
      <Text variant="bodySmall">Select complete measured groups. Materials apply to the whole selected group, never to individual walls.</Text>
      {!availableScopes.length && <State title="No grouped surfaces available" description="This saved calculation needs positive interior or exterior wall or ceiling areas." />}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{availableScopes.map(option => { const selected = draft.scopes.some(scope => scope.workArea === option.workArea && scope.surfaceType === option.surfaceType); return <Button key={`${option.workArea}:${option.surfaceType}`} mode={selected ? 'contained-tonal' : 'outlined'} onPress={() => toggleScope(option)} contentStyle={{ minHeight: 46 }}>{fieldLabel(option)}</Button>; })}</View>
      {draft.scopes.map((scope, index) => {
        const selectedCategory = categories.find(category => String(category.id) === scope.serviceCategory);
        const compatibleProducts = products.filter(product => !product.service_category || String(product.service_category) === scope.serviceCategory);
        const quantity = surfaces.filter(surface => surface.work_area === scope.workArea && surface.surface_type === scope.surfaceType).reduce((sum, surface) => sum + Number(surface.net_area || 0), 0);
        return <Card key={`${scope.workArea}:${scope.surfaceType}`} mode="outlined"><Card.Content style={{ gap: 8 }}>
          <Text variant="titleSmall">{fieldLabel(scope)} · {quantity.toFixed(2)} sq ft</Text>
          <Text variant="labelLarge">Work category</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{categories.map(category => <Button key={category.id} compact mode={scope.serviceCategory === String(category.id) ? 'contained-tonal' : 'outlined'} onPress={() => updateScope(index, 'serviceCategory', String(category.id))}>{category.name}</Button>)}</View>
          {!!scope.serviceCategory && <><Text variant="labelLarge">Product {selectedCategory?.name.toLowerCase().includes('paint') ? '(required)' : '(optional)'}</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{compatibleProducts.map(product => <Button key={product.id} compact mode={scope.paintType === String(product.id) ? 'contained-tonal' : 'outlined'} onPress={() => updateScope(index, 'paintType', scope.paintType === String(product.id) ? '' : String(product.id))}>{product.name}</Button>)}</View>
            <Text variant="labelLarge">Brand (optional)</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{brands.map(brand => <Button key={brand.id} compact mode={scope.paintBrand === String(brand.id) ? 'contained-tonal' : 'outlined'} onPress={() => updateScope(index, 'paintBrand', scope.paintBrand === String(brand.id) ? '' : String(brand.id))}>{brand.name}</Button>)}</View></>}
          <TextInput mode="outlined" label="Contractor rate (₹ / sq ft)" keyboardType="decimal-pad" value={scope.rate} onChangeText={value => updateScope(index, 'rate', value)} accessibilityLabel={`${fieldLabel(scope)} contractor rate in rupees per square foot`} />
        </Card.Content></Card>;
      })}
    </> : <>
      <Text variant="bodySmall">Rates are attached to saved measured areas. The existing Django API calculates line amounts, discounts, tax and final totals.</Text>
      {draft.scopes.map(scope => {
        const total = surfaces.filter(surface => surface.work_area === scope.workArea && surface.surface_type === scope.surfaceType).reduce((sum, surface) => sum + Number(surface.net_area || 0), 0);
        const category = categories.find(item => String(item.id) === scope.serviceCategory)?.name || 'Category not selected';
        const product = products.find(item => String(item.id) === scope.paintType)?.name;
        const brand = brands.find(item => String(item.id) === scope.paintBrand)?.name;
        return <Card key={`review-${scope.workArea}-${scope.surfaceType}`} mode="outlined"><Card.Content style={{ gap: 3 }}>
          <Text variant="titleSmall">{fieldLabel(scope)}</Text>
          <Text variant="bodySmall">{total.toFixed(2)} sq ft · {category}{product ? ` · ${product}` : ''}{brand ? ` · ${brand}` : ''}</Text>
          <Text variant="bodySmall">Contractor rate: ₹{scope.rate || '0'} / sq ft</Text>
        </Card.Content></Card>;
      })}
      <Text variant="titleSmall">Discount application</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{(['OVERALL', 'LINE', 'BOTH'] as const).map(value => <Button key={value} mode={draft.discountMode === value ? 'contained-tonal' : 'outlined'} onPress={() => setDraft(current => ({ ...current, discountMode: value }))}>{value === 'OVERALL' ? 'Overall' : value === 'LINE' ? 'Per line' : 'Line + overall'}</Button>)}</View>
      <Text variant="titleSmall">Discount type</Text><View style={{ flexDirection: 'row', gap: 8 }}><Button mode={draft.discountType === 'FIXED' ? 'contained-tonal' : 'outlined'} onPress={() => setDraft(current => ({ ...current, discountType: 'FIXED' }))}>Fixed amount</Button><Button mode={draft.discountType === 'PERCENTAGE' ? 'contained-tonal' : 'outlined'} onPress={() => setDraft(current => ({ ...current, discountType: 'PERCENTAGE' }))}>Percentage</Button></View>
      <TextInput mode="outlined" label={draft.discountType === 'FIXED' ? 'Discount amount (₹)' : 'Discount percentage'} keyboardType="decimal-pad" value={draft.discountValue} onChangeText={value => setDraft(current => ({ ...current, discountValue: value }))} accessibilityLabel="Discount value" />
      <Text variant="titleSmall">GST</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{(['GST_EXTRA', 'GST_INCLUDED', 'NO_GST'] as const).map(value => <Button key={value} mode={draft.gstMode === value ? 'contained-tonal' : 'outlined'} onPress={() => setDraft(current => ({ ...current, gstMode: value }))}>{value === 'GST_EXTRA' ? 'Extra' : value === 'GST_INCLUDED' ? 'Included' : 'No GST'}</Button>)}</View>
      {draft.gstMode !== 'NO_GST' && <TextInput mode="outlined" label="GST percentage" keyboardType="decimal-pad" value={draft.gstPercentage} onChangeText={value => setDraft(current => ({ ...current, gstPercentage: value }))} accessibilityLabel="GST percentage" />}
      <TextInput mode="outlined" label="Remarks (optional)" value={draft.notes} onChangeText={value => setDraft(current => ({ ...current, notes: value }))} multiline accessibilityLabel="Quotation remarks" />
      {!!notice && <Text accessibilityLiveRegion="polite">{notice}</Text>}
      <Button mode="contained" icon="content-save-outline" loading={saving} disabled={saving || !!validation || !draft.scopes.some(scope => surfaces.some(surface => surface.work_area === scope.workArea && surface.surface_type === scope.surfaceType))} onPress={() => void save()} contentStyle={styles.control}>Save measurement draft</Button>
    </>}
    <View style={{ flexDirection: 'row', gap: 8 }}><Button mode="outlined" disabled={busy || saving || step === 0} onPress={() => { setError(''); setStep(value => Math.max(0, value - 1)); }} contentStyle={[styles.control, { flex: 1 }]}>Back</Button>{step < 2 && <Button mode="contained" disabled={busy || saving || loadingRecord || (step === 0 && (!draft.customer || !draft.property || !draft.measurement))} onPress={next} contentStyle={[styles.control, { flex: 1 }]}>Continue</Button>}</View>
  </ScrollView></Screen>;
}
