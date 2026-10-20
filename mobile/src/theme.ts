import { MD3DarkTheme, MD3LightTheme } from 'react-native-paper';
import { colors } from './theme/tokens';
export const tokens = {
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius: 20, control: 48, motion: { fast: 120, normal: 220, slow: 420 },
  brand: { navy: colors.navy, navySoft: '#233F6B', heroInk: '#FFFFFF', heroMuted: '#DCE8FF', peach: '#B8D2FF', line: '#3C547A' },
  type: { display: 'Manrope_700Bold', body: 'Manrope_400Regular', medium: 'Manrope_600SemiBold' },
};
export function createTheme(dark: boolean, reducedMotion: boolean) {
  const base = dark ? MD3DarkTheme : MD3LightTheme;
  const fonts = Object.fromEntries(Object.entries(base.fonts).map(([key, value]) => [key, { ...value, fontFamily: value.fontWeight === '500' ? tokens.type.medium : tokens.type.body }])) as typeof base.fonts;
  return { ...base, fonts, roundness: 5, animation: { scale: reducedMotion ? 0 : 1 }, colors: { ...base.colors,
    primary: dark ? '#B8D2FF' : colors.primary, onPrimary: dark ? '#102B55' : '#FFFFFF',
    primaryContainer: dark ? '#233F6B' : colors.softBlue, onPrimaryContainer: dark ? '#DCE8FF' : colors.navy,
    secondary: dark ? '#B8C6DB' : '#4A5C74',
    secondaryContainer: dark ? '#2D405B' : '#E7ECF3', onSecondaryContainer: dark ? '#E0E8F5' : '#213650',
    background: dark ? '#111C2B' : colors.page, surface: dark ? '#19283C' : colors.white,
    surfaceVariant: dark ? '#25354B' : '#EDF2FA', onSurface: dark ? '#EBEEF4' : colors.text,
    onSurfaceVariant: dark ? '#B9C5D6' : '#5B6472', outline: dark ? '#8799B0' : '#7C8490',
    outlineVariant: dark ? '#35465F' : colors.border,
    elevation: { ...base.colors.elevation, level0: 'transparent', level1: dark ? '#1C2C42' : '#FFFFFF', level2: dark ? '#25354B' : '#E8F0FF' },
  } };
}
