/**
 * Lista fixa de e-mails com acesso ao sistema — login com Google fora dessa lista é recusado (ver
 * AuthProvider.tsx). Ainda não tem tela de gestão; pra adicionar/remover alguém, edita aqui e faz deploy.
 */
const EMAILS_AUTORIZADOS = ['cearasementes@gmail.com', 'marciordcosta@gmail.com'];

export function emailAutorizado(email: string | null | undefined): boolean {
  return !!email && EMAILS_AUTORIZADOS.includes(email.toLowerCase());
}
