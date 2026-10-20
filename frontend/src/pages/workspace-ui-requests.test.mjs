import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

test('language selection appears once in the signed-in header and inside sign-in, never settings', () => {
  assert.equal((source('../components/Topbar.jsx').match(/<LanguageSelector\b/g) || []).length, 1);
  assert.equal((source('../pages/Login.jsx').match(/<LanguageSelector\b/g) || []).length, 1);
  assert.doesNotMatch(source('../App.jsx'), /publicLanguagePage = \["\/login"/);
  for (const path of [
    '../pages/Settings.jsx',
    '../pages/RecoveryEmailSettings.jsx',
  ]) {
    assert.doesNotMatch(source(path), /LanguageSelector/);
  }
});

test('employee quick actions do not include employee creation in the tabs', () => {
  assert.doesNotMatch(source('../components/EmployeeQuickActions.jsx'), /Create employee/);
  assert.match(source('../pages/InHouseApplicators.jsx'), /Create employee/);
});

test('attendance section keeps the employee tabs visible above its content', () => {
  const employees = source('../pages/InHouseApplicators.jsx');
  assert.match(employees, /if \(section === "attendance"\)[\s\S]*?<Header section=\{section\}\/?>[\s\S]*?<EmployeeQuickActions\s*\/>[\s\S]*?<InHouseAttendanceWorkspace/);
});

test('attendance employee search input has no decorative search icon', () => {
  const attendance = source('../components/InHouseAttendanceWorkspace.jsx');
  assert.match(attendance, /import \{ Check \} from "lucide-react"/);
  assert.doesNotMatch(attendance, /<Search\b/);
  assert.match(attendance, /placeholder="Name or ID"/);
});

test('employee form calls its trade field Service category in the interface', () => {
  const create = source('../pages/InHouseEmployeeCreate.jsx');
  assert.match(create, /label="Service category"/);
  assert.doesNotMatch(create, /label="Trade"|Select trade|Custom trade|Enter trade/);
  assert.match(create, /trade:\s*form\.trade\s*===\s*"Other"/);
});

test('customer follow-up cards use reduced square dimensions on narrow screens', () => {
  const styles = source('../pages/tasks.css');
  assert.match(styles, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.doesNotMatch(styles, /@media\s*\(max-width:\s*380px\)[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(styles, /min-height:\s*180px/);
});

test('opportunities workspace presents the existing CRM records as Leads', () => {
  const opportunities = source('../pages/Opportunities.jsx');
  assert.match(opportunities, /title="Leads"/);
  assert.match(opportunities, /New lead/);
  assert.doesNotMatch(opportunities, /Sales Opportunities|Opportunity records|No opportunities found/);
});
