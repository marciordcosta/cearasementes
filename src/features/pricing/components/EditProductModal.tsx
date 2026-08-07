import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { Categoria, Fornecedor, Produto, Subcategoria } from '../types';

interface EditProductModalProps {
  produto: Produto | null;
  categorias: Categoria[];
  subcategorias: Subcategoria[];
  fornecedores: Fornecedor[];
  onFechar: () => void;
  onSalvar: (patch: {
    nome: string;
    codigo: string;
    categoriaId: string;
    subcategoriaId: string | null;
    peso: number;
    despesaExtraValor: number;
    cubagem: string | null;
    fornecedorId: string | null;
    imprimir: boolean;
  }) => void;
}

const campoClasse = 'w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1.5 text-xs text-[var(--color-text)]';

/** Linha do formulário: rótulo (descrição) numa coluna fixa à esquerda, campo de preenchimento à direita. */
function Linha({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[90px_1fr] items-center gap-2">
      <label className="text-xs text-[var(--color-text-soft)]">{label}</label>
      {children}
    </div>
  );
}

export function EditProductModal({ produto, categorias, subcategorias, fornecedores, onFechar, onSalvar }: EditProductModalProps) {
  const [nome, setNome] = useState('');
  const [codigo, setCodigo] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [subcategoriaId, setSubcategoriaId] = useState<string | null>(null);
  const [peso, setPeso] = useState('');
  const [despesaValor, setDespesaValor] = useState('0');
  const [cubagemC, setCubagemC] = useState('');
  const [cubagemL, setCubagemL] = useState('');
  const [cubagemA, setCubagemA] = useState('');
  const [fornecedorId, setFornecedorId] = useState('');
  const [imprimir, setImprimir] = useState(true);

  useEffect(() => {
    if (!produto) return;
    setNome(produto.nome);
    setCodigo(produto.codigo ?? '');
    setCategoriaId(produto.categoriaId);
    setSubcategoriaId(produto.subcategoriaId);
    setPeso(String(produto.peso));
    setDespesaValor(String(produto.despesaExtraValor || 0));
    const partes = produto.cubagem?.split(/x/i) ?? [];
    setCubagemC(partes[0]?.trim() ?? '');
    setCubagemL(partes[1]?.trim() ?? '');
    setCubagemA(partes[2]?.trim() ?? '');
    setFornecedorId(produto.fornecedorId ?? '');
    setImprimir(produto.imprimir);
  }, [produto]);

  // Valor do select de Classe: "sub:ID" quando o produto tem subcategoria, senão "cat:ID" — mesmo
  // esquema de prefixo usado no filtro da Tabela de Preços (PricingPage.tsx).
  const classeValue = subcategoriaId ? `sub:${subcategoriaId}` : `cat:${categoriaId}`;
  function onClasseChange(valor: string) {
    if (valor.startsWith('sub:')) {
      const subId = valor.slice(4);
      const sub = subcategorias.find((s) => s.id === subId);
      if (!sub) return;
      setSubcategoriaId(sub.id);
      setCategoriaId(sub.categoriaId);
    } else {
      setCategoriaId(valor.slice(4));
      setSubcategoriaId(null);
    }
  }

  function salvar() {
    const pesoNum = parseFloat(peso);
    if (!nome.trim()) {
      alert('Informe o nome do produto.');
      return;
    }
    if (isNaN(pesoNum) || pesoNum <= 0) {
      alert('Informe um peso válido para o produto.');
      return;
    }
    const cubagemPreenchida = cubagemC.trim() && cubagemL.trim() && cubagemA.trim();
    onSalvar({
      nome: nome.trim(),
      codigo: codigo.trim(),
      categoriaId,
      subcategoriaId,
      peso: pesoNum,
      despesaExtraValor: parseFloat(despesaValor) || 0,
      cubagem: cubagemPreenchida ? `${cubagemC.trim()}x${cubagemL.trim()}x${cubagemA.trim()}` : null,
      fornecedorId: fornecedorId || null,
      imprimir,
    });
  }

  return (
    <Modal
      open={produto !== null}
      title="Editar Produto"
      onClose={onFechar}
      widthClassName="max-w-[480px]"
      footer={
        <>
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={salvar}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <Linha label="ID">
          <input value={codigo} onChange={(e) => setCodigo(e.target.value)} className={campoClasse} />
        </Linha>

        <Linha label="Produto">
          <input value={nome} onChange={(e) => setNome(e.target.value)} className={campoClasse} />
        </Linha>

        <Linha label="Classe">
          <select value={classeValue} onChange={(e) => onClasseChange(e.target.value)} className={campoClasse}>
            {categorias.map((c) => (
              <optgroup key={c.id} label={c.nome}>
                <option value={`cat:${c.id}`} className="text-[var(--color-text)]">
                  {c.nome} (geral)
                </option>
                {subcategorias
                  .filter((s) => s.categoriaId === c.id)
                  .map((s) => (
                    <option key={s.id} value={`sub:${s.id}`} className="text-[var(--color-text)]">
                      {s.nome}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </Linha>

        <Linha label="Fornecedor">
          <select value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)} className={campoClasse}>
            <option value="" className="text-[var(--color-text)]">— Nenhum —</option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id} className="text-[var(--color-text)]">
                {f.nome}
              </option>
            ))}
          </select>
        </Linha>

        <Linha label="Peso (Kg)">
          <input type="number" step="1" min="0" value={peso} onChange={(e) => setPeso(e.target.value)} className={campoClasse} />
        </Linha>

        <Linha label="Cubagem (m)">
          <div className="flex gap-1.5">
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-[var(--color-text-soft)]">Compr.</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={cubagemC}
                onChange={(e) => setCubagemC(e.target.value)}
                className="num w-14 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 py-0.5 text-right text-xs text-[var(--color-text)]"
              />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-[var(--color-text-soft)]">Larg.</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={cubagemL}
                onChange={(e) => setCubagemL(e.target.value)}
                className="num w-14 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 py-0.5 text-right text-xs text-[var(--color-text)]"
              />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-[var(--color-text-soft)]">Alt.</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={cubagemA}
                onChange={(e) => setCubagemA(e.target.value)}
                className="num w-14 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 py-0.5 text-right text-xs text-[var(--color-text)]"
              />
            </div>
          </div>
        </Linha>

        <Linha label="Despesa Extra (R$)">
          <input type="number" step="0.1" min="0" value={despesaValor} onChange={(e) => setDespesaValor(e.target.value)} placeholder="Valor R$" className={campoClasse} />
        </Linha>

        <label className="flex items-center gap-2 text-xs text-[var(--color-text)]">
          <input type="checkbox" checked={imprimir} onChange={(e) => setImprimir(e.target.checked)} className="accent-[var(--color-accent)]" />
          Imprimir
        </label>
      </div>
    </Modal>
  );
}
