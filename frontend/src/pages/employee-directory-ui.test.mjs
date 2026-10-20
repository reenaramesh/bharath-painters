import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = path => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

test('employee directory keeps the requested identity columns in order and exposes row actions', () => {
  const page = source('./InHouseApplicators.jsx');
  const headings = ['Employee ID', 'Employee Name', 'Job title', 'Mobile Number', 'Status', 'Actions'];
  let position = -1;
  for (const heading of headings) {
    const next = page.indexOf(`>${heading}<`, position + 1);
    assert.ok(next > position, `${heading} should appear after the prior fixed column`);
    position = next;
  }
  for (const action of ['View', 'Edit']) assert.ok(page.includes(`>${action}</`), `${action} action is available`);
  assert.match(page, /\?['"]Restore['"]:['"]Remove['"]/);
});

test('custom employee fields can be defined, ordered, archived and selected as contractor table columns', () => {
  const page = source('./InHouseApplicators.jsx');
  assert.match(page, /Manage fields/);
  assert.match(page, /Display order/);
  assert.match(page, /Show .* in table/);
  assert.match(page, /Archive.*Restore/);
  for (const fieldType of ['TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'CHOICE']) assert.ok(page.includes(`"${fieldType}"`));
});

test('employee list remains horizontally scrollable on phone widths', () => {
  const page = source('./InHouseApplicators.jsx');
  const styles = source('../components/employee-workspace.css');
  assert.match(page, /employee-table-wrap/);
  assert.match(styles, /\.employee-table-wrap\s*\{\s*overflow-x:\s*auto/);
  assert.match(styles, /\.employee-directory-table\s*\{\s*min-width:\s*980px/);
});

test('payroll, bonus and leave sections render their own tables while keeping employee tabs', () => {
  const page = source('./InHouseApplicators.jsx');
  const payroll = source('../components/EmployeePayrollWorkspace.jsx');
  assert.match(page, /if \(payrollSection\)[\s\S]*?<EmployeeQuickActions\s*\/>[\s\S]*?<EmployeePayrollWorkspace/);
  assert.match(page, /bonus:"Extra bonus",leaves:"Leaves"/);
  const headings = ['Employee ID', 'Employee Name', 'Job title', 'Earn days', 'Day Wage', 'Total'];
  let position = -1;
  for (const heading of headings) {
    const next = payroll.indexOf(`>${heading}<`, position + 1);
    assert.ok(next > position, `${heading} should follow the previous payroll column`);
    position = next;
  }
  assert.match(payroll, /Bonus this month/);
  assert.match(payroll, /Leave days/);
});

test('employee edit and profile surfaces render custom values and dated change history', () => {
  const page = source('./InHouseEmployeeDetail.jsx');
  const create = source('./InHouseEmployeeCreate.jsx');
  assert.match(page, /custom_field_definitions/);
  assert.match(page, /effective_from/);
  assert.match(page, /Profile and salary history/);
  assert.match(create, /customFieldDefinitions/);
});
