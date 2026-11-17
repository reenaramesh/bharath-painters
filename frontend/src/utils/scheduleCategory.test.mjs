import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleCategory, scheduleCategories, filterScheduleItems } from './scheduleCategory.js';

const items = [{id:1,service_category_name:'Painting'}, {id:2,custom_service_category:'Cleaning'}, {id:3,service_category_name:'painting'}, {id:4}];
test('categories use quotation display values including custom and uncategorized lines', () => {
  assert.equal(scheduleCategory(items[1]), 'Cleaning');
  assert.equal(scheduleCategory(items[3]), 'Uncategorized');
  assert.deepEqual(scheduleCategories(items).map(row=>row[0]), ['cleaning','painting','uncategorized']);
});
test('category filtering preserves source line IDs, values and all-category reset', () => {
  assert.deepEqual(filterScheduleItems(items,'painting').map(row=>row.id),[1,3]);
  assert.equal(filterScheduleItems(items,'')[0],items[0]);
  assert.deepEqual(filterScheduleItems(items,'missing'),[]);
});
test('customer portal named category strings match the quotation display and filter', () => {
  const customerItems=[{id:9,service_category:'Painting',service:'Interior'},{id:10,service_category:'Cleaning',service:'Deep cleaning'}];
  assert.equal(scheduleCategory(customerItems[0]),'Painting');
  assert.deepEqual(filterScheduleItems(customerItems,'cleaning').map(row=>row.id),[10]);
});
