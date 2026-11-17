import test from 'node:test';
import assert from 'node:assert/strict';

import {validateProductionEnvironment as validate} from './productionEnvironment.js';

test('production requires an explicit public HTTPS API base ending in /api',()=>{
 for(const VITE_API_URL of [undefined,'http://localhost:8000/api','https://user:pass@api.example.com/api',
   'https://api.example.com/api?token=secret','https://api.example.com','https://127.1/api']) {
   assert.throws(()=>validate({VITE_API_URL}),undefined,'unsafe or missing API origin must stop the build');
 }
 assert.doesNotThrow(()=>validate({VITE_API_URL:'https://bharath-painters-api.onrender.com/api'}));
});

test('server-only credentials cannot be exposed through VITE variables or error messages',()=>{
 for(const name of ['VITE_BREVO_API_KEY','VITE_DATABASE_URL','VITE_REDIS_URL','VITE_DJANGO_SECRET_KEY','VITE_EMAIL_HOST_PASSWORD']) {
   assert.throws(()=>validate({VITE_API_URL:'https://api.example.com/api',[name]:'PRIVATE-CANARY'}), error=>!String(error).includes('PRIVATE-CANARY'));
 }
 assert.doesNotThrow(()=>validate({VITE_API_URL:'https://api.example.com/api',BREVO_API_KEY:'PRIVATE-CANARY',VITE_GOOGLE_CLIENT_ID:'public-client-id'}));
});
