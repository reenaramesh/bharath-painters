import { MD3DarkTheme, MD3LightTheme } from 'react-native-paper';
export const tokens = {
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius: 20, control: 48, motion: { fast: 120, normal: 220, slow: 420 },
  brand: { navy: '#14243A', navySoft: '#233B58', heroInk: '#FFFFFF', heroMuted: '#C6D1DF', orange: '#C44F27', peach: '#FFBB98', line: '#3C4D63' },
  type: { display: 'Manrope_700Bold', body: 'Manrope_400Regular', medium: 'Manrope_600SemiBold' },
};
export function createTheme(dark: boolean, reducedMotion: boolean) {
  const base = dark ? MD3DarkTheme : MD3LightTheme;
  const fonts = Object.fromEntries(Object.entries(base.fonts).map(([key, value]) => [key, { ...value, fontFamily: value.fontWeight === '500' ? tokens.type.medium : tokens.type.body }])) as typeof base.fonts;
  return { ...base, fonts, roundness: 5, animation: { scale: reducedMotion ? 0 : 1 }, colors: { ...base.colors,
    primary: dark ? '#FFAD86' : '#AA3E19', onPrimary: dark ? '#47210E' : '#FFFFFF',
    primaryContainer: dark ? '#543122' : '#FBE8DD', onPrimaryContainer: dark ? '#FFDBC9' : '#852E13',
    secondary: dark ? '#B8C6DB' : '#4A5C74',
    secondaryContainer: dark ? '#2D405B' : '#E7ECF3', onSecondaryContainer: dark ? '#E0E8F5' : '#213650',
    background: dark ? '#111C2B' : '#F8F6F2', surface: dark ? '#19283C' : '#FFFFFF',
    surfaceVariant: dark ? '#25354B' : '#F0EDE7', onSurface: dark ? '#EBEEF4' : '#17273E',
    onSurfaceVariant: dark ? '#B9C5D6' : '#5B6472', outline: dark ? '#8799B0' : '#7C8490',
    outlineVariant: dark ? '#35465F' : '#E5E2DB',
    elevation: { ...base.colors.elevation, level0: 'transparent', level1: dark ? '#1C2C42' : '#FFFFFF', level2: dark ? '#25354B' : '#FAF1E9' },
  } };
}
