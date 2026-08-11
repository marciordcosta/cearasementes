import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { Fornecedor } from '../types';

interface FornecedoresPanelProps {
  fornecedores: Fornecedor[];
  onAdicionarFornecedor: (nome: string) => void;
  onRenomearFornecedor: (id: string, nome: string) => void;
  onRemoverFornecedor: (id: string) => void;
  /** campo 'visivelGrade' desmarcado já esconde da grade E do PDF; 'visivelPdf' desmarcado esconde só do PDF. */
  onAtualizarFornecedorVisibilidade: (id: string, campo: 'visivelGrade' | 'visivelPdf', valor: boolean) => void;
}

/** Cadastro de Fornecedor — o campo "Fornecedor" do Editar Produto puxa essa lista (não é mais texto livre). */
export function FornecedoresPanel({
  fornecedores,
  onAdicionarFornecedor,
  onRenomearFornecedor,
  onRemoverFornecedor,
  onAtualizarFornecedorVisibilidade,
}: FornecedoresPanelProps) {
  const [nome, setNome] = useState('');

  function submeter() {
    if (!nome.trim()) return;
    onAdicionarFornecedor(nome.trim());
    setNome('');
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-bold text-[var(--color-text)]">Gerenciamento de Fornecedores</p>
      <Card className="overflow-hidden">
        {fornecedores.length > 0 && (
          <div className="divide-y divide-[var(--color-line)]">
            <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-semibold tracking-wide text-[var(--color-text-soft)] uppercase">
              <span className="flex-1" />
              <span className="w-14 text-center">Grade</span>
              <span className="w-14 text-center">PDF</span>
              <span className="w-5" />
            </div>
            {fornecedores.map((f) => (
              <div key={f.id} className="flex items-center gap-2 px-3 py-2">
                <input
                  type="text"
                  defaultValue={f.nome}
                  onBlur={(e) => {
                    const novoNome = e.target.value.trim();
                    if (novoNome && novoNome !== f.nome) onRenomearFornecedor(f.id, novoNome);
                    else e.target.value = f.nome;
                  }}
                  className="flex-1 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1.5 text-xs text-[var(--color-text)]"
                />
                <label className="flex w-14 items-center justify-center" title="Aparece na grade da Tabela de Preços (desmarcar esconde da grade e do PDF)">
                  <input
                    type="checkbox"
                    checked={f.visivelGrade}
                    onChange={(e) => onAtualizarFornecedorVisibilidade(f.id, 'visivelGrade', e.target.checked)}
                  />
                </label>
                <label className="flex w-14 items-center justify-center" title="Aparece no PDF (Exportar)">
                  <input
                    type="checkbox"
                    checked={f.visivelPdf}
                    disabled={!f.visivelGrade}
                    onChange={(e) => onAtualizarFornecedorVisibilidade(f.id, 'visivelPdf', e.target.checked)}
                  />
                </label>
                <button type="button" onClick={() => onRemoverFornecedor(f.id)} title="Deletar fornecedor" className="text-[var(--color-text-soft)] hover:text-bad">
                  🗑
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-line)] bg-[var(--color-page)] px-4 py-3">
          <span className="text-xs font-semibold text-[var(--color-text-soft)]">Novo fornecedor:</span>
          <input
            type="text"
            placeholder="Nome do fornecedor"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submeter()}
            className="w-56 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1.5 text-xs text-[var(--color-text)]"
          />
          <Button variant="primary" onClick={submeter}>
            + Adicionar fornecedor
          </Button>
        </div>
      </Card>
    </div>
  );
}
