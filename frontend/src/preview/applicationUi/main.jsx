import React from 'react';
import {createRoot} from 'react-dom/client';
import AuthContext from '../../context/auth-context.js';
import {LanguageProvider} from '../../i18n/LanguageContext.jsx';
import ApplicationUiPreview from './ApplicationUiPreview.jsx';
import '../../index.css';
import '../../i18n/fonts.css';
import '../../styles/application-ui.css';
import './preview.css';

// No AuthProvider, API client, live storage writes or application routing in this preview.
createRoot(document.getElementById('root')).render(<AuthContext.Provider value={{user:null}}><LanguageProvider><ApplicationUiPreview /></LanguageProvider></AuthContext.Provider>);
