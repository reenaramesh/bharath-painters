import test from 'node:test';
import assert from 'node:assert/strict';
import { overtimeSettingsDraft, overtimeSettingsPayload, overtimeSettingsPreview } from './employeeOvertimeSettings.js';

test('hourly draft preserves zero and has no day fields', () => {
  assert.deepEqual(overtimeSettingsDraft({overtime_rate_per_hour:'0.00'},'2026-10-19'), {overtime_rate_per_hour:'0.00',effective_from:'2026-10-19'});
});
test('hourly payload sends direct rate, blank fallback and zero', () => {
  for (const [input, expected] of [['100','100'],['',null],['0','0'],['125.001250','125.001250']]) {
    assert.deepEqual(overtimeSettingsPayload({overtime_rate_per_hour:input,effective_from:'2026-10-19'},'2026-10-19'),{overtime_rate_per_hour:expected,effective_from:'2026-10-19'});
  }
});
test('hourly validation rejects invalid rates and dates', () => {
 const valid={overtime_rate_per_hour:'100',effective_from:'2026-10-19'};
 for(const override of [{overtime_rate_per_hour:'-1'},{overtime_rate_per_hour:'NaN'},{overtime_rate_per_hour:'0.000001'},{overtime_rate_per_hour:'99999999999999999'},{effective_from:'2026-10-20'},{effective_from:'2026-02-30'}]) assert.throws(()=>overtimeSettingsPayload({...valid,...override},'2026-10-19'));
});
test('four hour preview multiplies hourly rate directly with exact rounding', () => {
 assert.deepEqual(overtimeSettingsPreview({overtime_rate_per_hour:'100'},{}),{hourly:'100.00',fourHours:'400.00',fallback:false});
 assert.equal(overtimeSettingsPreview({overtime_rate_per_hour:'125.001250'},{}).fourHours,'500.01');
 assert.equal(overtimeSettingsPreview({overtime_rate_per_hour:'0'},{}).fourHours,'0.00');
});
test('blank preview uses fallback, not configured rate', () => {
 assert.deepEqual(overtimeSettingsPreview({overtime_rate_per_hour:''},{overtime_fallback_hourly_rate:'12.500000'}),{hourly:'12.50',fourHours:'50.00',fallback:true});
 assert.equal(overtimeSettingsPreview({overtime_rate_per_hour:''},{overtime_rate_source:'DAY_WAGE',overtime_hourly_rate:'100'}),null);
});
