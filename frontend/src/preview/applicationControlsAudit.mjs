// Isolated read-only fixture for the shared controls and dashboard shortcuts.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import AuthContext from '../context/auth-context.js';
import {LanguageProvider} from '../i18n/LanguageContext.jsx';
import MobileDashboardShortcuts from '../components/MobileDashboardShortcuts.jsx';
import {FormField} from '../components/ui.jsx';
import {Input,Select,Textarea} from '../components/ui/Input.jsx';
import '../index.css';
import '../styles/mobile-responsive.css';
import '../styles/application-ui.css';

export function mountApplicationControlsAudit(role='CONTRACTOR') {
  const fields=React.createElement('section',{style:{display:'grid',gap:12,padding:16}},
    React.createElement(FormField,{label:'Customer name',helpText:'Use the saved customer name.',error:'Name is required'}),
    React.createElement(Input,{label:'Phone',helpText:'Enter a mobile number.'}),
    React.createElement(Select,{label:'Category',helpText:'Select a category.',options:[{id:1,name:'Painting'}]}),
    React.createElement(Textarea,{label:'Notes',helpText:'Add notes for this job.'}));
  createRoot(document.getElementById('check')).render(React.createElement(AuthContext.Provider,{value:{user:{id:999999,role},menuVisibility:null}},React.createElement(LanguageProvider,null,React.createElement(MemoryRouter,null,React.createElement('main',{className:'minimia-shell contractor-shell',style:{padding:16}},React.createElement(MobileDashboardShortcuts,{mobileOnly:false}),fields)))));
}
