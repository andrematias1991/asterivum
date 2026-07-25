import React, { createContext, useContext, useMemo, useState } from 'react';
import { deviceLanguage, translate, type TranslationKey } from './i18n';
import type { Language } from './types';

type LanguageValue = { language: Language; toggle(): void; t(key: TranslationKey): string };
const LanguageContext = createContext<LanguageValue | null>(null);

export function LanguageProvider({ children }: React.PropsWithChildren) {
  const [language, setLanguage] = useState<Language>(deviceLanguage);
  const value = useMemo(() => ({
    language,
    toggle: () => setLanguage(current => current === 'en' ? 'pt-PT' : 'en'),
    t: (key: TranslationKey) => translate(language, key),
  }), [language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error('useLanguage must be used inside LanguageProvider');
  return value;
}

