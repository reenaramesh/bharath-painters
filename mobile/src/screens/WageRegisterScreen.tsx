import { useEffect, useState } from 'react';
import { ScrollView, View, StyleSheet } from 'react-native';
import { Button, Card, IconButton, Text, useTheme } from 'react-native-paper';
import { api } from '../providers/AppProvider';
import { useApp } from '../providers/AppProvider';
import { Heading, Screen, State, styles } from '../components/ui';
import { tokens } from '../theme';
import { formatINR } from '../core/navigation';

type Employee = {
  membership_id: number;
  employee_name: string;
  employee_code: string;
  salary_basis: string;
  salary_amount: string;
  hourly_rate: string;
  earned_days: string;
  base_wage: string;
  overtime_hours: string;
  overtime_pay: string;
  bonus_total: string;
  gross_earnings: string;
  advances_total: string;
  payments_total: string;
  net_payable: string;
};

type WageRegisterResponse = {
  month: string;
  employees: Employee[];
  totals: {
    total_earned_days: string;
    total_base_wage: string;
    total_overtime_hours: string;
    total_overtime_pay: string;
    total_bonus: string;
    total_gross: string;
    total_advances: string;
    total_payments: string;
    total_net_payable: string;
  };
};

export function WageRegisterScreen() {
  const { user } = useApp();
  const theme = useTheme();
  const [month, setMonth] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  });
  const [data, setData] = useState<WageRegisterResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setBusy(true);
    setError('');
    setData(null);
    void api.get<WageRegisterResponse>('/jobs/wage-register/', { month }).then(res => {
      if (active) setData(res);
    }).catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : 'Could not load wage register.');
    }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [user?.id, month, retry]);

  const prevMonth = () => {
    const [y = today.getFullYear(), m = 1] = month.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const nextMonth = () => {
    const [y = today.getFullYear(), m = 1] = month.split('-').map(Number);
    const d = new Date(y, m, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const isCurrentMonth = month === currentMonth;

  return <Screen scroll={false}>
    <ScrollView contentContainerStyle={[styles.content, s.content, { paddingBottom: tokens.space.xxl }]}>
      <Heading title="Monthly Wage Register" subtitle="In-house employees — base wage, overtime & bonuses" />
      <View style={s.monthNav}>
        <IconButton accessibilityLabel="Previous month" icon="chevron-left" onPress={prevMonth} disabled={busy} style={s.monthButton} />
        <Text variant="titleMedium" style={{ marginHorizontal: 12 }}>{month}</Text>
        <IconButton accessibilityLabel="Next month" icon="chevron-right" onPress={nextMonth} disabled={busy || isCurrentMonth} style={s.monthButton} />
      </View>
      {!isCurrentMonth && <Button mode="text" icon="calendar-today" onPress={() => setMonth(currentMonth)} style={{ alignSelf: 'flex-end', marginBottom: 8 }}>This Month</Button>}
      {!!error && <State title="Could not load" description={error} action="Retry" onAction={() => setRetry(value => value + 1)} />}
      {!data && busy && <State title="Loading wage register…" description="Loading approved attendance, overtime and payment totals for this month." />}
      {data && <View style={{ gap: tokens.space.md }}>
        <Card style={s.totalsCard}><Card.Content style={{ gap: 8 }}>
          <Text variant="titleSmall" style={styles.bold}>Totals for {data.month}</Text>
          <View style={s.totalsGrid}>
            <View style={s.totalsCell}><Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Employees</Text><Text variant="titleMedium">{data.employees.length}</Text></View>
            <View style={s.totalsCell}><Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Earned Days</Text><Text variant="titleMedium">{Number(data.totals.total_earned_days).toFixed(1)}</Text></View>
            <View style={s.totalsCell}><Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Base Wage</Text><Text variant="titleMedium">{formatINR(data.totals.total_base_wage)}</Text></View>
            <View style={s.totalsCell}><Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>OT Hours</Text><Text variant="titleMedium">{Number(data.totals.total_overtime_hours).toFixed(1)}</Text></View>
            <View style={s.totalsCell}><Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>OT Pay</Text><Text variant="titleMedium">{formatINR(data.totals.total_overtime_pay)}</Text></View>
            <View style={s.totalsCell}><Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Bonus</Text><Text variant="titleMedium">{formatINR(data.totals.total_bonus)}</Text></View>
            <View style={s.totalsCell}><Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Gross</Text><Text variant="titleMedium">{formatINR(data.totals.total_gross)}</Text></View>
            <View style={s.totalsCell}><Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Advances</Text><Text variant="titleMedium">{formatINR(data.totals.total_advances)}</Text></View>
            <View style={s.totalsCell}><Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Payments</Text><Text variant="titleMedium">{formatINR(data.totals.total_payments)}</Text></View>
            <View style={s.totalsCell}><Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Net Payable</Text><Text variant="titleMedium" style={{ color: theme.colors.primary }}>{formatINR(data.totals.total_net_payable)}</Text></View>
          </View>
        </Card.Content></Card>
        <Card><Card.Content style={{ gap: 8 }}>
          <Text variant="titleSmall">Employee Breakdown</Text>
          {data.employees.length === 0 && <State title="No employees" description="No active in-house employees for this month." />}
          {data.employees.map((emp, idx) => <View key={`${emp.membership_id}-${idx}`} style={s.empRow}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="titleSmall">{emp.employee_name} <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>({emp.employee_code})</Text></Text>
              <Text variant="bodySmall">{emp.salary_basis} · ₹{emp.salary_amount}/{emp.salary_basis === 'MONTHLY' ? 'month' : emp.salary_basis === 'WEEKLY' ? 'week' : 'day'} · OT: ₹{emp.hourly_rate}/hr</Text>
              <View style={s.empMetrics}>
                <Text variant="bodySmall">Days: {Number(emp.earned_days).toFixed(1)}</Text>
                <Text variant="bodySmall">Base: {formatINR(emp.base_wage)}</Text>
                <Text variant="bodySmall" style={{ color: theme.colors.primary }}>OT: {Number(emp.overtime_hours).toFixed(1)}h = {formatINR(emp.overtime_pay)}</Text>
                <Text variant="bodySmall">Bonus: {formatINR(emp.bonus_total)}</Text>
                <Text variant="titleSmall" style={{ color: theme.colors.primary }}>Gross: {formatINR(emp.gross_earnings)}</Text>
                <Text variant="bodySmall">Adv: {formatINR(emp.advances_total)} · Paid: {formatINR(emp.payments_total)}</Text>
                <Text variant="titleSmall" style={{ color: theme.colors.tertiary }}>Net: {formatINR(emp.net_payable)}</Text>
              </View>
            </View>
          </View>)}
        </Card.Content></Card>
      </View>}
    </ScrollView>
  </Screen>;
}

const s = StyleSheet.create({
  content: { padding: 14, paddingBottom: 20, gap: 8 },
  monthButton: { width: 48, height: 48 },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 },
  totalsCard: { backgroundColor: '#E8F5E9' },
  totalsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  totalsCell: { width: '33.33%', padding: 8, alignItems: 'center' },
  empRow: { borderBottomWidth: 1, borderBottomColor: '#E0E0E0', paddingVertical: 8 },
  empMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 },
});
