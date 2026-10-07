import React, { useState } from 'react';
import AuthContext from '../context/auth-context';
import { LanguageProvider, useLanguage } from '../i18n/LanguageContext';

let controller;
let errorValue;
function Controls() { controller = useLanguage(); return null; }
function Form({ customer }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  errorValue = error;
  return <form><label>Name<input value={name} placeholder="Customer name" onChange={(event) => setName(event.target.value)} /></label>
    <p data-kind="customer">{customer}</p><p data-kind="entry">{name}</p><button type="button" onClick={() => setError(`Customer ${customer} could not be saved.`)}>Save</button>
    <p data-kind="error">{error}</p>
    <p data-kind="interpolation">{`Customer ${customer} amount ${42}`}</p>
  </form>;
}
export function Fixture({ user, customer = 'Save Painting' }) {
  return <AuthContext.Provider value={{ user }}><LanguageProvider><Controls /><Form customer={customer} /></LanguageProvider></AuthContext.Provider>;
}
export function changeScript(script) { controller.setLanguage(script); }
export function currentScript() { return controller.language; }
export function currentError() { return errorValue; }
