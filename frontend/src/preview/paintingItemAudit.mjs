import AuthContext from "../context/auth-context.js";
import { LanguageProvider } from "../i18n/LanguageContext.jsx";
// Isolated dev-only component harness. Not linked from production routes.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import GroupedQuotationWorkspace from '../components/GroupedQuotationWorkspace.jsx';
import MeasurementCalculator from '../pages/MeasurementCalculator.jsx';
import MasterServices from '../pages/MasterServices.jsx';
import { masters } from './quotationGrouping/fixtures.js';
import api from '../api/client.js';
import '../index.css';
import '../styles/mobile-responsive.css';

export const measured = { id: 7, version: 2, rooms: [{ id: 1, name: 'Bedroom 1', measurement_record: 7 }], surfaces: [
  { id: 11, room: 1, work_area: 'INTERIOR', surface_type: 'WALL', name: 'Normal Walls', length: 33, breadth: 10, quantity: 1, gross_area: 330, net_area: 330, measurement_record: 7, openings: [] },
  { id: 12, room: 1, work_area: 'EXTERIOR', surface_type: 'WALL', name: 'Exterior Walls', length: 4, breadth: 10, quantity: 1, gross_area: 40, net_area: 40, measurement_record: 7, openings: [] },
  { id: 13, room: 1, work_area: 'INTERIOR', surface_type: 'OTHER', area_group_name: 'Texture Walls', name: 'Texture Wall', length: 11, breadth: 10, quantity: 1, gross_area: 110, net_area: 110, measurement_record: 7, openings: [] },
  { id: 14, room: 1, work_area: 'INTERIOR', surface_type: 'CEILING', name: 'Ceiling', length: 12, breadth: 10, quantity: 1, gross_area: 120, net_area: 120, measurement_record: 7, openings: [] },
] };
function Workspace() {
  const [state, setState] = useState({ groups: [], specials: [], services: [], rates: {} });
  window.__paintingState = state;
  return React.createElement(GroupedQuotationWorkspace, { measurement: measured, masters, state, showMeasurements: false, onChange: setState });
}
export function mountPaintingAudit(calculator = false, roomCheck = false) {
  window.__roomRecords = [...measured.rooms]; window.__roomCalls = []; window.__roomMasterCalls = [];
  const roomMasters = [{id:20,name:"Utility",painting_area:"INTERIOR",created_by:999999},{id:21,name:"Terrace",painting_area:"EXTERIOR",created_by:999999},{id:22,name:"Other Area",painting_area:"OTHER",created_by:999999}];
  api.get = async path => ({ data: path.includes('/measurement-records/') ? { id: 7, version: 2, reference_no: 'AREA-QA' } : path.endsWith('/areas/') ? roomMasters : path.endsWith('/rooms/') ? [...window.__roomRecords] : path.endsWith('/measurements/') ? measured.surfaces : path.includes('/properties/') ? { id: 2, customer: 1, name: 'Bharath QA Property', measurement_type: 'INTERIOR' } : [] });
  api.post = api.patch = api.delete = async () => { throw new Error('Fixture blocks live writes'); };
  if (roomCheck) api.post = async (path,payload) => { if (path.endsWith('/areas/')) { const saved={...payload,id:23}; roomMasters.push(saved); window.__roomMasterCalls.push(saved); return {data:saved}; } if (!path.endsWith('/rooms/')) throw new Error('No live writes'); window.__roomCalls.push({path,payload}); const saved = {...payload,id:2,measurement_record:7}; window.__roomRecords.push(saved); return {data:saved}; };
  if (roomCheck) api.patch = async (path,payload) => {
    const id = Number(path.split('/').filter(Boolean).at(-1));
    const item = roomMasters.find(entry => entry.id === id);
    if (!item || item.created_by !== 999999) throw new Error('Fixture permission denied');
    const change = window.__ignoreRoomSection ? {...payload,painting_area:item.painting_area} : payload; Object.assign(item,change); window.__roomMasterCalls.push({path,payload}); return {data:{...item}};
  };
  if (calculator === 'masters') roomMasters.push({id:24,name:'Shared Room',painting_area:'OTHER',created_by:null});
  const hostStyle = document.createElement('style'); hostStyle.textContent = '.painting-audit-host{padding:16px}@media(min-width:640px){.painting-audit-host{padding:24px}}@media(min-width:1024px){.painting-audit-host{padding:32px}}'; document.head.append(hostStyle);
  const route = '/properties/2/measurements';
  const content = calculator ? React.createElement(MemoryRouter, { initialEntries: [route + '?measurement=7'] }, React.createElement(Routes, null, React.createElement(Route, { path: '/properties/:id/measurements', element: React.createElement(calculator === 'masters' ? MasterServices : MeasurementCalculator) }))) : React.createElement(Workspace);
  createRoot(document.getElementById('check')).render(React.createElement(AuthContext.Provider, {value:{user:{id:999999,role:"CONTRACTOR"}}}, React.createElement(LanguageProvider, null, React.createElement('div', { className: 'minimia-shell contractor-shell' }, React.createElement('main', { className:'painting-audit-host', style: { maxWidth: 1440, margin: 'auto' } }, content)))));
}
