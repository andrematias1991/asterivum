import { getLocales } from 'expo-localization';
import type { Language } from './types';

const en = {
  home: 'Home', chart: 'Chart', ephemeris: 'Ephemeris', profiles: 'Profiles',
  welcome: 'Astrology, made legible', intro: 'Create an accurate natal chart without an account. Sign in only when you want to save profiles and open deeper analysis.',
  createChart: 'Create a chart', explore: 'Explore the sky', signIn: 'Sign in', signUp: 'Create account', signOut: 'Sign out',
  guest: 'Guest mode', accountBenefit: 'Save profiles, transits, compatibility and detailed reports.',
  name: 'Name', email: 'Email', password: 'Password', date: 'Birth date', time: 'Birth time', location: 'Birth location',
  locationHint: 'Start typing a city…', coordinates: 'Coordinates and time zone are filled automatically.',
  calculate: 'Calculate natal chart', calculating: 'Calculating…', saveProfile: 'Save profile', saved: 'Profile saved',
  tropical: 'Tropical', sidereal: 'Sidereal', placidus: 'Placidus', wholeSign: 'Whole sign', equal: 'Equal houses',
  natal: 'Natal', transits: 'Transits', today: 'Today', retry: 'Try again', loading: 'Loading…',
  noProfiles: 'No saved profiles yet.', advanced: 'Detailed analysis', locked: 'Create an account to unlock detailed reports, transit strength, compatibility and astrocartography.',
  invalidForm: 'Complete the birth details and select a location from the results.', invalidAuth: 'Enter a valid email and a password of at least 12 characters.',
  planets: 'Planet positions', aspects: 'Aspects', house: 'House', degree: 'Position', error: 'Something went wrong',
  language: 'PT', languageLabel: 'Mudar para Português', profileCreated: 'Your profile is ready.',
  chiron: 'Chiron', lilith: 'Mean Lilith', objectAspects: 'Object aspects',
  expandChart: 'Open detailed chart', closeChart: 'Close chart', zoomIn: 'Zoom in', zoomOut: 'Zoom out', fitChart: 'Fit chart',
};

const pt: typeof en = {
  home: 'Início', chart: 'Mapa', ephemeris: 'Efemérides', profiles: 'Perfis',
  welcome: 'Astrologia, fácil de ler', intro: 'Crie um mapa natal rigoroso sem conta. Inicie sessão apenas quando quiser guardar perfis e abrir análises mais detalhadas.',
  createChart: 'Criar um mapa', explore: 'Explorar o céu', signIn: 'Iniciar sessão', signUp: 'Criar conta', signOut: 'Terminar sessão',
  guest: 'Modo convidado', accountBenefit: 'Guarde perfis, trânsitos, compatibilidade e relatórios detalhados.',
  name: 'Nome', email: 'Email', password: 'Palavra-passe', date: 'Data de nascimento', time: 'Hora de nascimento', location: 'Local de nascimento',
  locationHint: 'Comece a escrever uma cidade…', coordinates: 'As coordenadas e o fuso horário são preenchidos automaticamente.',
  calculate: 'Calcular mapa natal', calculating: 'A calcular…', saveProfile: 'Guardar perfil', saved: 'Perfil guardado',
  tropical: 'Tropical', sidereal: 'Sideral', placidus: 'Placidus', wholeSign: 'Signos inteiros', equal: 'Casas iguais',
  natal: 'Natal', transits: 'Trânsitos', today: 'Hoje', retry: 'Tentar novamente', loading: 'A carregar…',
  noProfiles: 'Ainda não existem perfis guardados.', advanced: 'Análise detalhada', locked: 'Crie uma conta para desbloquear relatórios detalhados, força dos trânsitos, compatibilidade e astrocartografia.',
  invalidForm: 'Preencha os dados de nascimento e selecione um local nos resultados.', invalidAuth: 'Introduza um email válido e uma palavra-passe com pelo menos 12 caracteres.',
  planets: 'Posições planetárias', aspects: 'Aspetos', house: 'Casa', degree: 'Posição', error: 'Ocorreu um erro',
  language: 'EN', languageLabel: 'Switch to English', profileCreated: 'O seu perfil está pronto.',
  chiron: 'Quíron', lilith: 'Lilith média', objectAspects: 'Aspetos dos objetos',
  expandChart: 'Abrir mapa detalhado', closeChart: 'Fechar mapa', zoomIn: 'Ampliar', zoomOut: 'Reduzir', fitChart: 'Ajustar mapa',
};

export type TranslationKey = keyof typeof en;
export const deviceLanguage = (): Language => getLocales()[0]?.languageCode === 'pt' ? 'pt-PT' : 'en';
export const translate = (language: Language, key: TranslationKey) => (language === 'pt-PT' ? pt : en)[key];
