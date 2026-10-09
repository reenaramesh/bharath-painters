import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, Platform, useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { PaperProvider } from 'react-native-paper';
import { ApiClient, ApiError } from '../core/api';
import type { Session } from '../core/contracts';
import type { User } from '../core/navigation';
import { demoUser } from '../data/demo';
import { createTheme } from '../theme';
import { useFonts, Manrope_400Regular, Manrope_600SemiBold, Manrope_700Bold } from '@expo-google-fonts/manrope';

export const api = new ApiClient(process.env.EXPO_PUBLIC_API_URL || '');
const storageKey = 'bharath.mobile.session.v1';
type ThemeMode = 'system' | 'light' | 'dark';
type ContextValue = {
  user: User | null; demo: boolean; ready: boolean; bootError: string | null;
  disabledMenus: string[]; menuReady: boolean; menuError: string | null;
  themeMode: ThemeMode; setThemeMode: (mode: ThemeMode) => void; reducedMotion: boolean;
  login: (identifier: string, password: string) => Promise<void>; logout: () => Promise<void>;
  enterDemo: () => void; restore: () => Promise<void>; loadMenus: () => Promise<void>;
};
const AppContext = createContext<ContextValue | null>(null);
function validUser(value: unknown): value is User {
  if (!value || typeof value !== 'object') return false;
  const item = value as User;
  return typeof item.id === 'number' && ['CONTRACTOR', 'PAINTER', 'CUSTOMER', 'ADMIN', 'SUPPORT'].includes(item.role)
    && typeof item.is_verified === 'boolean' && typeof item.verification_status === 'string';
}
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [fontsLoaded, fontError] = useFonts({ Manrope_400Regular, Manrope_600SemiBold, Manrope_700Bold });
  const [user, setUser] = useState<User | null>(null), [demo, setDemo] = useState(false), [ready, setReady] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [disabledMenus, setDisabledMenus] = useState<string[]>([]), [menuReady, setMenuReady] = useState(false), [menuError, setMenuError] = useState<string | null>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>('system'), [reducedMotion, setReducedMotion] = useState(false);
  const scheme = useColorScheme();
  const currentUser = useRef<User | null>(null), writeQueue = useRef<Promise<void>>(Promise.resolve());
  const authVersion = useRef(0);
  const persist = useCallback((session: Session | null) => {
    const write = async () => {
      if (Platform.OS === 'web') return; // Browser previews deliberately keep credentials in memory.
      if (session) await SecureStore.setItemAsync(storageKey, JSON.stringify(session));
      else await SecureStore.deleteItemAsync(storageKey);
    };
    const next = writeQueue.current.catch(() => {}).then(write);
    writeQueue.current = next; return next;
  }, []);
  const logout = useCallback(async () => {
    authVersion.current++; api.setTokens(null); currentUser.current = null;
    setUser(null); setDemo(false); setMenuReady(false); setDisabledMenus([]);
    await persist(null);
  }, [persist]);
  useEffect(() => {
    api.onTokens = async tokens => { if (tokens && currentUser.current) await persist({ ...tokens, user: currentUser.current }); else await persist(null); };
    api.onExpired = () => { authVersion.current++; currentUser.current = null; setUser(null); setDemo(false); setMenuReady(false); };
    return () => { api.onTokens = async () => {}; api.onExpired = () => {}; };
  }, [persist]);
  const restore = useCallback(async () => {
    setReady(false); setBootError(null);
    try {
      if (Platform.OS === 'web') return;
      const raw = await SecureStore.getItemAsync(storageKey);
      if (!raw) return;
      let saved: Session;
      try { saved = JSON.parse(raw) as Session; } catch { await persist(null); return; }
      if (!validUser(saved.user) || typeof saved.access !== 'string' || typeof saved.refresh !== 'string') { await persist(null); return; }
      currentUser.current = saved.user; api.setTokens({ access: saved.access, refresh: saved.refresh });
      const fresh = await api.get<User>('/accounts/me/');
      if (!validUser(fresh)) throw new Error('Your account could not be loaded. Please try again.');
      currentUser.current = fresh; setUser(fresh);
      if (api.tokens) await persist({ ...api.tokens, user: fresh });
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) setBootError(error instanceof Error ? error.message : 'Could not restore your session.');
    } finally { setReady(true); }
  }, [persist]);
  useEffect(() => { void restore(); }, [restore]);
  const login = useCallback(async (identifier: string, password: string) => {
    const version = ++authVersion.current;
    const session = await api.request<Session>('/accounts/login/', { identifier: identifier.trim(), password }, false);
    if (version !== authVersion.current) return;
    if (!validUser(session.user) || !session.access || !session.refresh) throw new Error('Your account could not be loaded. Please try again.');
    await persist(session);
    if (version !== authVersion.current) return;
    api.setTokens({ access: session.access, refresh: session.refresh }); currentUser.current = session.user;
    setDemo(false); setUser(session.user);
  }, [persist]);
  const enterDemo = useCallback(() => {
    authVersion.current++; api.setTokens(null); currentUser.current = null;
    setDemo(true); setUser(demoUser); setDisabledMenus([]); setMenuReady(true); setMenuError(null);
  }, []);
  const loadMenus = useCallback(async () => {
    if (!user || demo) return;
    const version = authVersion.current;
    setMenuReady(false); setMenuError(null);
    try {
      const data = await api.get<Record<string, string[]>>('/accounts/menu-visibility/');
      if (version !== authVersion.current) return;
      const disabled = data[user.role] || [];
      if (!Array.isArray(disabled) || disabled.some(value => typeof value !== 'string')) throw new Error('Could not load your available tools.');
      setDisabledMenus(disabled); setMenuReady(true);
    } catch { if (version === authVersion.current) setMenuError('Could not load your available tools. Please retry.'); }
  }, [user, demo]);
  useEffect(() => { void loadMenus(); }, [loadMenus]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void loadMenus(); });
    return () => subscription.remove();
  }, [loadMenus]);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => subscription.remove();
  }, []);
  const theme = useMemo(() => createTheme(themeMode === 'dark' || (themeMode === 'system' && scheme === 'dark'), reducedMotion), [scheme, themeMode, reducedMotion]);
  const value = { user, demo, ready: ready && (fontsLoaded || !!fontError), bootError, disabledMenus, menuReady, menuError, themeMode, setThemeMode, reducedMotion, login, logout, enterDemo, restore, loadMenus };
  return <AppContext.Provider value={value}><PaperProvider theme={theme}>{children}</PaperProvider></AppContext.Provider>;
}
export function useApp() { const value = useContext(AppContext); if (!value) throw new Error('AppProvider is missing'); return value; }
