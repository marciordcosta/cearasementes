import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { emailAutorizado } from './allowedEmails';

interface AuthContextValue {
  session: Session | null;
  carregando: boolean;
  /** Login com Google concluído, mas o e-mail não está na lista autorizada (ver allowedEmails.ts) — a sessão já foi encerrada sozinha. */
  naoAutorizado: boolean;
  sair: () => void;
}

const AuthContext = createContext<AuthContextValue>({ session: null, carregando: true, naoAutorizado: false, sair: () => {} });

/**
 * Sessão do Supabase Auth (login com Google) — checa o e-mail contra a lista autorizada assim que a
 * sessão chega (login inicial, refresh de token, ou volta de outra aba); e-mail fora da lista nunca chega
 * a ficar "logado" de verdade aqui — desloga sozinho e liga `naoAutorizado`, pra LoginPage mostrar o aviso.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [naoAutorizado, setNaoAutorizado] = useState(false);

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

  return <AuthContext.Provider value={{ session, carregando, naoAutorizado, sair: () => supabase.auth.signOut() }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
