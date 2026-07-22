import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { apagarUpload, listarUploadsRecentes } from '../api';

const STATUS_COR: Record<string, string> = {
  sucesso: '#0ca30c',
  aviso: '#c98a1e',
  erro: '#d03b3b',
};

export function UploadLog() {
  const queryClient = useQueryClient();
  const [paraApagar, setParaApagar] = useState<{ id: string; nome: string } | null>(null);

  const { data: uploads = [] } = useQuery({
    queryKey: ['uploads_log'],
    queryFn: () => listarUploadsRecentes(20),
  });

  const { mutate: confirmarExclusao, isPending: apagando } = useMutation({
    mutationFn: (id: string) => apagarUpload(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['uploads_log'] });
      queryClient.invalidateQueries({ queryKey: ['bi'] });
      setParaApagar(null);
    },
  });

  return (
    <Card className="p-5">
      <h3 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Arquivos processados recentemente</h3>
      {uploads.length === 0 ? (
        <p className="text-sm text-[var(--color-text-soft)]">Nenhum arquivo enviado ainda.</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {uploads.map((u) => (
            <li key={u.id} className="flex items-start justify-between gap-2">
              <span className="flex items-start gap-2">
                <span style={{ color: STATUS_COR[u.status] }}>●</span>
                <span className="text-[var(--color-text-soft)]">
                  <strong className="text-[var(--color-text)]">{u.arquivo_nome}</strong> — Relatório {u.tipo_relatorio}
                  {u.status === 'sucesso' && `, ${u.linhas_importadas} linha(s) importada(s)`}
                  {u.mensagem && ` — ${u.mensagem}`}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setParaApagar({ id: u.id, nome: u.arquivo_nome })}
                title="Apagar este arquivo e os dados que ele gerou"
                className="shrink-0 text-[var(--color-text-soft)] hover:text-bad"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={paraApagar !== null}
        title="Apagar arquivo importado"
        onClose={() => setParaApagar(null)}
        footer={
          <>
            <Button variant="outline" onClick={() => setParaApagar(null)} disabled={apagando}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={() => paraApagar && confirmarExclusao(paraApagar.id)} disabled={apagando}>
              {apagando ? 'Apagando...' : 'Apagar definitivamente'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-[var(--color-text)]">
          Isso vai apagar <strong>{paraApagar?.nome}</strong> da lista e todas as linhas que esse upload gravou nas tabelas do
          Supabase. Não tem como desfazer.
        </p>
      </Modal>
    </Card>
  );
}
