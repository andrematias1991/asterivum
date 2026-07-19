const BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
const errorsPt:Record<string,string> = {
  'Authentication required':'É necessário iniciar sessão', 'Invalid or expired session':'Sessão inválida ou expirada', 'Email or password is incorrect':'O e-mail ou a palavra-passe estão incorretos',
  'Enter a valid email and password':'Introduza um e-mail e uma palavra-passe válidos', 'Enter a valid name, email and password (12+ characters)':'Introduza um nome, e-mail e palavra-passe válidos (12 ou mais caracteres)',
  'An account already exists for this email':'Já existe uma conta com este e-mail', 'New account registration is currently closed':'O registo de novas contas está atualmente fechado',
  'Birth profile is incomplete or invalid':'O perfil natal está incompleto ou é inválido', 'Profile not found':'Perfil não encontrado', 'Something went wrong':'Ocorreu um erro',
  'Too many attempts; try again later':'Demasiadas tentativas; tente novamente mais tarde', 'Too many requests; slow down':'Demasiados pedidos; aguarde um momento',
  'Invalid security token; refresh and try again':'Token de segurança inválido; atualize a página e tente novamente', 'Location search is temporarily unavailable':'A pesquisa de locais está temporariamente indisponível',
};

function cookie(name:string) {
  const prefix = `${encodeURIComponent(name)}=`;
  const item = document.cookie.split('; ').find(value => value.startsWith(prefix));
  return item ? decodeURIComponent(item.slice(prefix.length)) : undefined;
}

export async function api<T>(path:string, options:RequestInit = {}):Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const csrf = !['GET','HEAD','OPTIONS'].includes(method) ? cookie('astralis_csrf') : undefined;
  const language = localStorage.getItem('asterivum_language') === 'pt-PT' ? 'pt-PT' : 'en';
  const res = await fetch(BASE+path, {
    ...options,
    credentials:'include',
    headers:{ 'X-App-Language':language, ...(options.body ? {'Content-Type':'application/json'} : {}), ...(csrf ? {'X-CSRF-Token':csrf} : {}), ...options.headers },
  });
  const data = await res.json().catch(()=>({}));
  if (!res.ok) {
    const message = data.error || `Request failed (${res.status})`;
    throw new Error(language === 'pt-PT' ? errorsPt[message] || message : message);
  }
  return data;
}
