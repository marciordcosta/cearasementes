import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthProvider';

function entrarComGoogle() {
  supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
}

export function LoginPage() {
  const { naoAutorizado } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-page)] px-4">
      <div className="w-full max-w-sm rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-8 text-center shadow-lg">
        <h1 className="text-lg font-semibold text-[var(--color-text)]">Ceará Sementes</h1>
        <p className="mt-1 text-sm text-[var(--color-text-soft)]">Acesso restrito à equipe.</p>
        {naoAutorizado && (
          <p className="mt-4 rounded-md border border-bad/40 bg-bad-soft px-3 py-2 text-xs text-[#8F2E2E]">Esse e-mail não tem acesso a esse sistema.</p>
        )}
        <button
          type="button"
          onClick={entrarComGoogle}
          className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-2.5 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-page)]"
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.9 2.5 30.5 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.1 17.6 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.5 3-2.2 5.4-4.7 7.1l7.3 5.7c4.3-4 6.8-9.9 6.8-17.3z" />
            <path fill="#FBBC05" d="M10.4 19.3c-.5 1.5-.8 3.1-.8 4.7s.3 3.2.8 4.7l-7.8 6.1C.9 31.6 0 27.9 0 24s.9-7.6 2.6-10.8z" />
            <path fill="#34A853" d="M24 48c6.5 0 12-2.1 16-5.8l-7.3-5.7c-2.1 1.4-4.9 2.3-8.7 2.3-6.4 0-11.7-3.6-13.6-9.8l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
          </svg>
          Entrar com Google
        </button>
      </div>
    </div>
  );
}
