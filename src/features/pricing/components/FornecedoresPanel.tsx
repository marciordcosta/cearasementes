import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { Fornecedor } from '../types';

interface FornecedoresPanelProps {
  fornecedores: Fornecedor[];
  onAdicionarFornecedor: (nome: string) => void;
  onRenomearFornecedor: (id: string, nome: string) => void;
  onRemoverFornecedor: (id: string) => void;
}

/** Cadastro de Fornecedor — o campo "Fornecedor" do Editar Produto puxa essa lista (não é mais texto livre). */
export function FornecedoresPanel({ fornecedores, onAdicionarFornecedor, onRenomearFornecedor, onRemoverFornecedor }: FornecedoresPanelProps) {
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
