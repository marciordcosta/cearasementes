import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { DESCRICAO_CHAVE_ROTULO, ROTULOS_CATEGORIA_PADRAO, type ChaveRotuloCategoria } from '../types';

interface RotulosCategoriaModalProps {
  open: boolean;
  rotulos: Partial<Record<ChaveRotuloCategoria, string>>;
  onFechar: () => void;
  /** Salva uma chave por vez (upsert ou apaga, se vazio) — mais simples que salvar tudo de uma vez, e cada campo já sai do foco/perde o "sujo" assim que confirma. */
  onSalvar: (chave: ChaveRotuloCategoria, rotulo: string | null) => Promise<void>;
}

const ORDEM: ChaveRotuloCategoria[] = [
  'mesmoNome',
  'mesmaData',
  'pagoPosteriormenteBanco',
  'pagoAntecipadoBanco',
  'pagoPosteriormenteSistema',
  'pagoAntecipadoSistema',
  'parcelaDivergente',
  'combinacaoBoleto',
  'combinacaoPix',
  'recebimentoDiferente',
];

export function RotulosCategoriaModal({ open, rotulos, onFechar, onSalvar }: RotulosCategoriaModalProps) {
  const [form, setForm] = useState(rotulos);
  const [salvando, setSalvando] = useState<ChaveRotuloCategoria | null>(null);

  // Mesmo padrão do modal de Regras: recarrega com os valores atuais toda
  // vez que abre, pra não começar de um rascunho de uma abertura anterior.
  useEffect(() => {
    if (open) setForm(rotulos);
  }, [open, rotulos]);

  async function salvarCampo(chave: ChaveRotuloCategoria) {
    setSalvando(chave);
    try {
      await onSalvar(chave, form[chave]?.trim() || null);
    } finally {
      setSalvando(null);
    }
  }

  return (
    <Modal open={open} title="Nomes das categorias de sugestão" onClose={onFechar} widthClassName="max-w-[640px]" footer={<Button onClick={onFechar}>Fechar</Button>}>
      <p className="mb-4 text-xs text-[var(--color-text-soft)]">
        Só o texto exibido no painel de Sugestões muda — a lógica de casamento (ver Regras de Conciliação) continua a mesma. Deixe em branco pra voltar ao nome padrão.
      </p>
      <div className="space-y-2.5">
        {ORDEM.map((chave) => (
          <div key={chave} className="flex items-center gap-2">
            <div className="w-64 shrink-0">
              <p className="text-sm font-semibold text-[var(--color-text)]">{DESCRICAO_CHAVE_ROTULO[chave]}</p>
              <p className="text-[11px] text-[var(--color-text-soft)]">Padrão: {ROTULOS_CATEGORIA_PADRAO[chave]}</p>
            </div>
            <input
              value={form[chave] ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, [chave]: e.target.value }))}
              onBlur={() => {
                if ((form[chave] ?? '') !== (rotulos[chave] ?? '')) salvarCampo(chave);
              }}
              placeholder={ROTULOS_CATEGORIA_PADRAO[chave]}
              disabled={salvando === chave}
              className="flex-1 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm text-[var(--color-text)] disabled:opacity-50"
            />
          </div>
        ))}
      </div>
    </Modal>
  );
}
