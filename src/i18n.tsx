import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Language = 'en' | 'pt-PT';

const pt:Record<string,string> = {
  "Sun":"Sol", "Moon":"Lua", "Mercury":"Mercúrio", "Venus":"Vénus", "Mars":"Marte", "Jupiter":"Júpiter", "Saturn":"Saturno", "Uranus":"Urano", "Neptune":"Neptuno", "Pluto":"Plutão",
  "Aries":"Carneiro", "Taurus":"Touro", "Gemini":"Gémeos", "Cancer":"Caranguejo", "Leo":"Leão", "Virgo":"Virgem", "Libra":"Balança", "Scorpio":"Escorpião", "Sagittarius":"Sagitário", "Capricorn":"Capricórnio", "Aquarius":"Aquário", "Pisces":"Peixes",
  "The astrologer's studio":"O estúdio do astrólogo", "Map the sky.":"Mapeie o céu.", "Read the moment.":"Leia o momento.",
  "The chart is a map of potential—not a sentence.":"O mapa é um retrato do potencial — não uma sentença.", "By continuing you agree to keep client birth data secure and use interpretations responsibly.":"Ao continuar, concorda em manter seguros os dados de nascimento dos clientes e em utilizar as interpretações de forma responsável.",
  "A considered workspace for natal practice, forecasting, and client archives.":"Um espaço cuidado para astrologia natal, previsões e arquivo de clientes.",
  "Welcome back":"Bem-vindo de volta", "Begin your practice":"Comece a sua prática", "Enter the studio":"Entrar no estúdio", "Create your account":"Criar a sua conta",
  "Your charts, ephemerides, and readings await.":"Os seus mapas, efemérides e leituras esperam por si.", "Save charts and build a private client library.":"Guarde mapas e crie uma biblioteca privada de clientes.",
  "Full name":"Nome completo", "Your name":"O seu nome", "Email address":"Endereço de e-mail", "Password":"Palavra-passe", "12 characters minimum":"Mínimo de 12 caracteres",
  "Sign in":"Iniciar sessão", "Create account":"Criar conta", "Opening…":"A abrir…", "Already have an account? Sign in":"Já tem conta? Inicie sessão", "New to Asterivum? Create an account":"Novo no Asterivum? Crie uma conta",
  "Overview":"Visão geral", "Birth profiles":"Perfis natais", "Chart studio":"Estúdio de mapas", "Ephemeris":"Efemérides", "Forecasts":"Previsões", "Synastry":"Sinastria", "Astro map":"Mapa astral", "Administration":"Administração", "Management":"GESTÃO",
  "Astrology Studio":"Estúdio de Astrologia", "English":"English", "Português":"Português", "Language":"Idioma",
  "Birth data":"Dados de nascimento", "Create birth profile":"Criar perfil natal", "Edit birth profile":"Editar perfil natal", "Name":"Nome", "Date":"Data", "Time":"Hora", "Location":"Localização",
  "Edit profile":"Editar perfil", "New client chart":"Novo mapa de cliente", "Client or chart name":"Nome do cliente ou mapa", "Date of birth":"Data de nascimento", "Local birth time":"Hora local de nascimento", "Birth place":"Local de nascimento", "Latitude":"Latitude", "Longitude":"Longitude", "UTC offset at birth":"Desvio UTC no nascimento", "Private notes":"Notas privadas",
  "Select a birth place from the search results.":"Selecione um local de nascimento nos resultados da pesquisa.", "Detected from":"Detetado através de", "Whole Sign":"Signo Inteiro", "Equal House":"Casas Iguais", "Tropical":"Tropical", "Sidereal (Lahiri approx.)":"Sideral (Lahiri aprox.)",
  "Placidus uses exact semi-arc cusps. At polar latitudes, where Placidus is undefined, the chart uses an equal-house fallback.":"Placidus utiliza cúspides de semi-arco exatas. Em latitudes polares, onde Placidus não está definido, o mapa utiliza casas iguais como alternativa.",
  "Start typing a city or postal code":"Comece a escrever uma cidade ou código postal", "Searching places…":"A procurar locais…", "No matching places":"Nenhum local encontrado", "Coordinates":"Coordenadas", "Filled from place":"Preenchido a partir do local",
  "House system":"Sistema de casas", "Zodiac":"Zodíaco", "Notes":"Notas", "Primary profile":"Perfil principal", "Cancel":"Cancelar", "Save profile":"Guardar perfil", "Saving…":"A guardar…",
  "Celestial overview":"Visão celeste", "Your practice, at a glance":"A sua prática, num relance", "Client profiles":"Perfis de clientes", "Chart methods":"Métodos de mapa", "Forecast range":"Período de previsão", "Recent charts":"Mapas recentes",
  "New chart":"Novo mapa", "Current sky":"Céu atual", "Keep the symbol":"Mantenha o símbolo", "close to the sky.":"perto do céu.", "Open today’s transits against your primary chart, or begin with a new client profile.":"Abra os trânsitos de hoje sobre o seu mapa principal ou comece com um novo perfil de cliente.", "View transits":"Ver trânsitos", "View all":"Ver todos", "3 yrs":"3 anos", "Create profile":"Criar perfil",
  "profile":"perfil", "profiles":"perfis", "at":"às", "Natal chart":"Mapa natal", "Transit chart":"Mapa de trânsitos", "Progression chart":"Mapa de progressões",
  "Your first chart begins here":"O seu primeiro mapa começa aqui", "Add birth data to calculate a natal wheel and placements.":"Adicione os dados de nascimento para calcular a roda natal e as posições.", "Add profile":"Adicionar perfil", "New profile":"Novo perfil",
  "Client archive":"Arquivo de clientes", "Search profiles…":"Pesquisar perfis…", "Primary":"Principal", "Edit":"Editar", "Delete":"Eliminar", "Open chart":"Abrir mapa",
  "Accurate source data, private notes, and preferred calculation settings.":"Dados de origem rigorosos, notas privadas e definições de cálculo preferidas.", "Delete this profile and its chart data?":"Eliminar este perfil e os respetivos dados do mapa?", "Select a profile":"Selecionar perfil", "Target date":"Data de referência", "Placements":"Posições", "Conjunction":"Conjunção", "Sextile":"Sextil", "Square":"Quadratura", "Trine":"Trígono", "Opposition":"Oposição", "orb":"orbe",
  "Exact":"Exato", "Equal-house fallback: Placidus is undefined inside the polar circles":"Alternativa de casas iguais: Placidus não está definido dentro dos círculos polares",
  "Natal":"Natal", "Transit":"Trânsito", "Progression":"Progressão", "Transit positions":"Posições dos trânsitos", "Progression positions":"Posições das progressões",
  "Add a birth profile first":"Adicione primeiro um perfil natal", "Calculating the sky…":"A calcular o céu…", "Celestial positions":"Posições celestes", "Aspect matrix":"Matriz de aspetos", "Strongest aspects":"Aspetos mais fortes", "Ascendant":"Ascendente", "Midheaven":"Meio do Céu",
  "Reference tables":"Tabelas de referência", "Astrology ephemeris":"Efemérides astrológicas", "Daily":"Diário", "Weekly":"Semanal", "Monthly":"Mensal", "Generate":"Gerar", "Loading…":"A carregar…",
  "Compare geocentric tropical longitudes and retrograde motion across any period.":"Compare longitudes tropicais geocêntricas e movimento retrógrado em qualquer período.", "From":"De", "To":"Até", "Interval":"Intervalo", "Calculate":"Calcular", "Calculating…":"A calcular…",
  "Timing & movement":"Tempo e movimento", "Transit forecast":"Previsão de trânsitos", "Slow planets":"Planetas lentos", "All planets":"Todos os planetas", "Print":"Imprimir", "Export PDF":"Exportar PDF",
  "A high-signal timeline of exact outer-planet contacts to natal placements.":"Uma cronologia clara dos contactos exatos dos planetas exteriores com as posições natais.", "Transit report":"Relatório de trânsitos", "Planets":"Planetas", "Range":"Período", "Working orb":"Orbe de trabalho", "6 months":"6 meses", "1 year":"1 ano", "2 years":"2 anos", "3 years":"3 anos", "Generate forecast":"Gerar previsão", "Reading…":"A interpretar…", "active periods":"períodos ativos", "exact passes":"passagens exatas", "retrograde passes":"passagens retrógradas", "very strong":"muito fortes", "with retrograde motion":"com movimento retrógrado", "natal house":"casa natal", "Pass":"Passagem", "Retrograde":"Retrógrado", "Direct":"Direto",
  "Strength uses the closest orb reached inside the selected window.":"A intensidade utiliza a orbe mais próxima atingida dentro da janela selecionada.",
  "Each period runs from orb entry to orb exit and groups repeated direct or retrograde passes.":"Cada período decorre da entrada à saída da orbe e agrupa passagens diretas ou retrógradas repetidas.",
  "No contacts in this range":"Sem contactos neste período", "Try a broader orb, a longer range, or all planets.":"Experimente uma orbe maior, um período mais longo ou todos os planetas.",
  "Practice control room":"Centro de controlo da prática", "Total users":"Total de utilizadores", "Saved reports":"Relatórios guardados", "New in 30 days":"Novos em 30 dias", "Access control":"Controlo de acesso", "Users":"Utilizadores", "User":"Utilizador", "Role":"Função", "Profiles":"Perfis", "Joined":"Registo", "Status":"Estado",
  "Manage access, monitor adoption, and protect client records.":"Gira o acesso, acompanhe a utilização e proteja os registos dos clientes.", "Administrator":"Administrador", "Restore":"Reativar", "Suspend":"Suspender",
  "Relationship astrology":"Astrologia relacional", "Synastry studio":"Estúdio de sinastria", "Compare two natal charts, their strongest contacts, and the balance of ease and developmental tension.":"Compare dois mapas natais, os contactos mais fortes e o equilíbrio entre harmonia e tensão evolutiva.",
  "Two birth profiles are required":"São necessários dois perfis natais", "Add another person before calculating relationship dynamics.":"Adicione outra pessoa antes de calcular a dinâmica da relação.", "Person A":"Pessoa A", "Person B":"Pessoa B", "Compare charts":"Comparar mapas", "Comparing…":"A comparar…", "Comparing both natal skies…":"A comparar os dois céus natais…",
  "Relationship pattern":"Padrão da relação", "Inter-chart aspects":"Aspetos entre mapas", "Strongest contacts":"Contactos mais fortes", "found":"encontrados", "supportive":"favoráveis", "developmental":"evolutivos", "intensifying":"intensificadores",
  "Paired natal chart and inter-chart aspects":"Mapa natal combinado e aspetos entre mapas",
  "This is an aspect balance, not a verdict. Strong relationships can contain both harmony and demanding contacts.":"Este é um equilíbrio de aspetos, não um veredicto. Relações fortes podem conter harmonia e contactos exigentes.",
  "Locational astrology":"Astrologia locacional", "Astrocartography":"Astrocartografia", "See where each natal planet was angular - rising, setting, culminating, or at the lower meridian.":"Veja onde cada planeta natal estava angular — a ascender, a pôr-se, a culminar ou no meridiano inferior.",
  "Profile":"Perfil", "Planet":"Planeta", "Angle":"Ângulo", "All angles":"Todos os ângulos", "Descendant":"Descendente", "Lower meridian":"Meridiano inferior", "Projecting planetary lines…":"A projetar linhas planetárias…", "Hover a planetary line for its angular emphasis.":"Passe sobre uma linha planetária para ver a sua ênfase angular.",
  "public direction and visibility":"direção pública e visibilidade", "roots, home and inner foundations":"raízes, lar e bases interiores", "identity, embodiment and new beginnings":"identidade, presença e novos começos", "partnerships and significant encounters":"parcerias e encontros significativos",
};

type I18nValue = { language:Language; locale:string; setLanguage:(language:Language)=>void; t:(english:string)=>string };
const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({children}:{children:ReactNode}) {
  const [language,setLanguage] = useState<Language>(() => localStorage.getItem('asterivum_language') === 'pt-PT' ? 'pt-PT' : 'en');
  useEffect(() => {
    localStorage.setItem('asterivum_language', language);
    document.documentElement.lang = language;
    document.title = language === 'pt-PT' ? 'Asterivum · Astrologia Profissional' : 'Asterivum · Professional Astrology';
    document.querySelector('meta[name="description"]')?.setAttribute('content', language === 'pt-PT' ? 'Espaço profissional de astrologia Asterivum' : 'Asterivum professional astrology workspace');
  }, [language]);
  const value = useMemo<I18nValue>(() => ({ language, locale:language === 'pt-PT' ? 'pt-PT':'en-GB', setLanguage, t:(english:string) => language === 'pt-PT' ? pt[english] || english : english }), [language]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}

export function LanguageSwitch({compact=false}:{compact?:boolean}) {
  const {language,setLanguage,t}=useI18n();
  return <label className={`language-switch ${compact?'compact':''}`}><span>{compact?'':t('Language')}</span><select aria-label={t('Language')} value={language} onChange={event=>setLanguage(event.target.value as Language)}><option value="en">EN · English</option><option value="pt-PT">PT · Português</option></select></label>;
}
