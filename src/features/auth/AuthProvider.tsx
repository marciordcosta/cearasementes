import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { RealtimeChannel, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { emailAutorizado } from './allowedEmails';

export interface UsuarioOnline {
  id: string;
  email: string;
  avatarUrl: string | null;
}

interface AuthContextValue {
  session: Session | null;
  carregando: boolean;
  /** Login com Google concluído, mas o e-mail não está na lista autorizada (ver allowedEmails.ts) — a sessão já foi encerrada sozinha. */
  naoAutorizado: boolean;
  sair: () => void;
  /** Quem está com o app aberto agora (Realtime Presence — não é histórico, some assim que fecha a aba). */
  usuariosOnline: UsuarioOnline[];
}

const AuthContext = createContext<AuthContextValue>({ session: null, carregando: true, naoAutorizado: false, sair: () => {}, usuariosOnline: [] });

/**
 * Sessão do Supabase Auth (login com Google) — checa o e-mail contra a lista autorizada assim que a
 * sessão chega (login inicial, refresh de token, ou volta de outra aba); e-mail fora da lista nunca chega
 * a ficar "logado" de verdade aqui — desloga sozinho e liga `naoAutorizado`, pra LoginPage mostrar o aviso.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [naoAutorizado, setNaoAutorizado] = useState(false);
  const [usuariosOnline, setUsuariosOnline] = useState<UsuarioOnline[]>([]);

  useEffect(() => {
    function aplicarSessao(novaSessao: Session | null) {
      if (novaSessao && !emailAutorizado(novaSessao.user.email)) {
        setNaoAutorizado(true);
        setSession(null);
        supabase.auth.signOut();
        return;
      }
      setSession(novaSessao);
    }

    supabase.auth.getSession().then(({ data }) => {
      aplicarSessao(data.session);
      setCarregando(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_evento, novaSessao) => aplicarSessao(novaSessao));
    return () => listener.subscription.unsubscribe();
  }, []);

  // Canal de presença GLOBAL ("quem está online agora") — 1 assinatura por sessão de login, não por
  // página (o app mantém várias páginas montadas ao mesmo tempo, ver App.tsx; se isso vivesse no Topbar,
  // cada página visitada criaria sua própria presença e o mesmo usuário apareceria repetido). Chave da
  // presença é o id do usuário — várias abas do mesmo usuário contam como 1 só na lista.
  useEffect(() => {
    const usuario = session?.user;
    if (!usuario) {
      setUsuariosOnline([]);
      return;
    }
    const canal: RealtimeChannel = supabase.channel('usuarios-online', { config: { presence: { key: usuario.id } } });

    function atualizarLista() {
      const estado = canal.presenceState<{ email: string; avatar_url: string | null }>();
      setUsuariosOnline(Object.entries(estado).map(([id, presencas]) => ({ id, email: presencas[0]?.email ?? '', avatarUrl: presencas[0]?.avatar_url ?? null })));
    }

    canal.on('presence', { event: 'sync' }, atualizarLista).subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        canal.track({ email: usuario.email ?? '', avatar_url: (usuario.user_metadata?.avatar_url as string | undefined) ?? null });
      }
    });

    return () => {
      canal.untrack();
      supabase.removeChannel(canal);
    };
  }, [session]);

  return <AuthContext.Provider value={{ session, carregando, naoAutorizado, sair: () => supabase.auth.signOut(), usuariosOnline }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
