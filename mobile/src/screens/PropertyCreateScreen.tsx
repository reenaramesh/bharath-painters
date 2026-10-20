import { useCallback, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { ActivityIndicator, Button, Dialog, HelperText, Menu, Portal, Searchbar, SegmentedButtons, Text, TextInput, useTheme } from 'react-native-paper';
import { router, useFocusEffect } from 'expo-router';
import { DemoLabel, Heading, Screen, State, styles } from '../components/ui';
import { api, useApp } from '../providers/AppProvider';
import { buildPropertyPayload, type PropertyDraft, validatePropertyDraft } from '../core/propertyDraft';
import { tokens } from '../theme';

type CustomerOption = { id: string; name: string; mobile: string; status: string };
const emptyDraft: PropertyDraft = {
  customer: '', property_type: 'OTHER', measurement_type: 'INTERIOR', measurement_unit: 'FEET',
  name: '', flat_number: '', block_name: '', address: '', city: '', pincode: '',
  approximate_area: '', google_maps_url: '',
};
const propertyTypes = [
  { value: '1RK', label: '1 RK' }, { value: '1BHK', label: '1 BHK' }, { value: '2BHK', label: '2 BHK' },
  { value: '3BHK', label: '3 BHK' }, { value: '4BHK', label: '4 BHK' }, { value: 'VILLA', label: 'Villa' },
  { value: 'OFFICE', label: 'Office' }, { value: 'COMMERCIAL', label: 'Commercial' }, { value: 'INTERIOR', label: 'Interior' },
  { value: 'EXTERIOR', label: 'Exterior' }, { value: 'OTHER', label: 'Other' },
];

export function PropertyCreateScreen({ initialCustomer }: { initialCustomer?: string }) {
  const { demo } = useApp();
  const theme = useTheme();
  const [draft, setDraft] = useState<PropertyDraft>({ ...emptyDraft, customer: initialCustomer || '' });
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [customerError, setCustomerError] = useState('');
  const [customerDialog, setCustomerDialog] = useState(false);
  const [customerQuery, setCustomerQuery] = useState('');
  const [menu, setMenu] = useState<'type' | 'unit' | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [validation, setValidation] = useState('');

  const loadCustomers = useCallback(async () => {
    if (demo) return;
    setLoadingCustomers(true);
    setCustomerError('');
    try {
      const response = await api.get<unknown>('/quotations/customers/', { include_saved: 1 });
      const page = response as { results?: unknown } | null;
      const rows = Array.isArray(response) ? response : Array.isArray(page?.results) ? page.results : null;
      if (!rows) throw new Error('Connected customers could not be loaded.');
      const options = rows.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
        .filter(row => row.connection_status === 'CONNECTED' && (typeof row.id === 'number' || typeof row.id === 'string'))
        .map(row => ({ id: String(row.id), name: String(row.name || 'Customer'), mobile: String(row.mobile || ''), status: String(row.status || 'CONNECTED') }));
      setCustomers(options);
      if (initialCustomer && options.some(item => item.id === initialCustomer)) {
        setDraft(current => ({ ...current, customer: initialCustomer }));
      } else if (initialCustomer && !options.length) {
        setDraft(current => ({ ...current, customer: '' }));
      }
    } catch (cause) {
      setCustomerError(cause instanceof Error ? cause.message : 'Connected customers could not be loaded.');
    } finally { setLoadingCustomers(false); }
  }, [demo, initialCustomer]);

  useFocusEffect(useCallback(() => { void loadCustomers(); }, [loadCustomers]));

  const filteredCustomers = useMemo(() => {
    const query = customerQuery.trim().toLocaleLowerCase('en-IN');
    return customers.filter(item => !query || `${item.name} ${item.mobile}`.toLocaleLowerCase('en-IN').includes(query)).slice(0, 50);
  }, [customers, customerQuery]);
  const selectedCustomer = customers.find(item => item.id === draft.customer);

  const update = <K extends keyof PropertyDraft>(key: K, value: PropertyDraft[K]) => setDraft(current => ({ ...current, [key]: value }));

  const submit = async () => {
    const issue = validatePropertyDraft(draft);
    if (issue) { setValidation(issue); return; }
    if (demo || saving) return;
    setValidation(''); setSaving(true); setError('');
    try {
      await api.request('/quotations/properties/', buildPropertyPayload(draft));
      router.back();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Property could not be saved. Check the customer connection and try again.'); }
    finally { setSaving(false); }
  };

  if (demo) return <Screen><DemoLabel /><Heading title="Add property" subtitle="Property records are read-only in the sample workspace." /><State title="Sample workspace" description="Sign in to a connected contractor account to add a property." action="Go back" onAction={() => router.back()} /></Screen>;

  return <>
    <Screen>
      <DemoLabel />
      <Heading title="Add property" subtitle="Add a site to a connected customer. Area calculations can be added afterward." />
      <View style={{ gap: tokens.space.md }}>
        <Text variant="labelLarge">Customer *</Text>
        <Button mode="outlined" icon="account-search-outline" contentStyle={styles.control} disabled={!!initialCustomer && !!selectedCustomer} onPress={() => setCustomerDialog(true)}>
          {selectedCustomer ? `${selectedCustomer.name}${selectedCustomer.mobile ? ` · ${selectedCustomer.mobile}` : ''}` : 'Choose connected customer'}
        </Button>
        <HelperText type="info">Only customers with an approved connection can own a property.</HelperText>
        {loadingCustomers && <ActivityIndicator accessibilityLabel="Loading connected customers" />}
        {customerError && <State title="Customer list unavailable" description={customerError} action="Retry" onAction={() => void loadCustomers()} />}

        <TextInput mode="outlined" label="Property / project name *" value={draft.name} onChangeText={value => update('name', value)} autoCapitalize="words" accessibilityLabel="Property name" />
        <Text variant="labelLarge">Property type</Text>
        <Menu visible={menu === 'type'} onDismiss={() => setMenu(null)} anchor={<Button mode="outlined" icon="home-city-outline" contentStyle={styles.control} onPress={() => setMenu('type')}>{propertyTypes.find(item => item.value === draft.property_type)?.label}</Button>}>
          {propertyTypes.map(item => <Menu.Item key={item.value} title={item.label} onPress={() => { update('property_type', item.value); if (item.value === 'INTERIOR' || item.value === 'EXTERIOR') update('measurement_type', item.value); setMenu(null); }} />)}
        </Menu>
        <Text variant="labelLarge">Area calculation</Text>
        <SegmentedButtons value={draft.measurement_type} onValueChange={value => update('measurement_type', value)} buttons={[{ value: 'INTERIOR', label: 'Interior' }, { value: 'EXTERIOR', label: 'Exterior' }]} />
        <Text variant="labelLarge">Area input unit</Text>
        <Menu visible={menu === 'unit'} onDismiss={() => setMenu(null)} anchor={<Button mode="outlined" contentStyle={styles.control} onPress={() => setMenu('unit')}>{draft.measurement_unit === 'FEET' ? 'Feet (ft)' : 'Metres (m)'}</Button>}>
          <Menu.Item title="Feet (ft)" onPress={() => { update('measurement_unit', 'FEET'); setMenu(null); }} />
          <Menu.Item title="Metres (m)" onPress={() => { update('measurement_unit', 'METRES'); setMenu(null); }} />
        </Menu>
        <TextInput mode="outlined" label="Project address *" value={draft.address} onChangeText={value => update('address', value)} multiline numberOfLines={3} accessibilityLabel="Project address" />
        <View style={{ flexDirection: 'row', gap: tokens.space.sm }}>
          <TextInput mode="outlined" label="City" value={draft.city} onChangeText={value => update('city', value)} autoCapitalize="words" style={{ flex: 1 }} />
          <TextInput mode="outlined" label="PIN code" value={draft.pincode} onChangeText={value => update('pincode', value)} keyboardType="number-pad" maxLength={10} style={{ flex: 1 }} />
        </View>
        <View style={{ flexDirection: 'row', gap: tokens.space.sm }}>
          <TextInput mode="outlined" label="Flat / unit" value={draft.flat_number} onChangeText={value => update('flat_number', value)} style={{ flex: 1 }} />
          <TextInput mode="outlined" label="Block / tower" value={draft.block_name} onChangeText={value => update('block_name', value)} style={{ flex: 1 }} />
        </View>
        <TextInput mode="outlined" label="Approximate area (optional)" value={draft.approximate_area} onChangeText={value => update('approximate_area', value)} keyboardType="decimal-pad" accessibilityLabel="Approximate area" />
        <TextInput mode="outlined" label="Google Maps link (optional)" value={draft.google_maps_url} onChangeText={value => update('google_maps_url', value)} autoCapitalize="none" keyboardType="url" accessibilityLabel="Google Maps link" />
        {validation && <HelperText type="error" visible>{validation}</HelperText>}
        {error && <State title="Property not saved" description={error} />}
        <Button mode="contained" icon="content-save-outline" disabled={saving || loadingCustomers || !draft.customer} loading={saving} onPress={() => void submit()} contentStyle={styles.control}>Save property</Button>
      </View>
    </Screen>
    <Portal>
      <Dialog visible={customerDialog} onDismiss={() => setCustomerDialog(false)} style={{ maxHeight: '80%' }}>
        <Dialog.Title>Choose connected customer</Dialog.Title>
        <Dialog.Content>
          <Searchbar placeholder="Search name or mobile" value={customerQuery} onChangeText={setCustomerQuery} accessibilityLabel="Search connected customers" />
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 360, marginTop: tokens.space.sm }}>
            {filteredCustomers.map(item => <Button key={item.id} mode={item.id === draft.customer ? 'contained-tonal' : 'text'} icon="account-outline" contentStyle={{ minHeight: tokens.control, justifyContent: 'flex-start' }} onPress={() => { update('customer', item.id); setCustomerDialog(false); setCustomerQuery(''); }}>{item.name}{item.mobile ? ` · ${item.mobile}` : ''}</Button>)}
            {!loadingCustomers && filteredCustomers.length === 0 && <Text style={{ color: theme.colors.onSurfaceVariant, padding: tokens.space.md }}>{customerError ? 'Retry loading customers first.' : 'No matching connected customers.'}</Text>}
          </ScrollView>
        </Dialog.Content>
        <Dialog.Actions><Button onPress={() => setCustomerDialog(false)}>Close</Button></Dialog.Actions>
      </Dialog>
    </Portal>
  </>;
}
