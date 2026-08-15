import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { AutocompleteInput } from '@/features/fretes/components/AutocompleteInput';
import type { Categoria, Fornecedor, Produto, Subcategoria } from '../types';

interface EditProductModalProps {
  produto: Produto | null;
  categorias: Categoria[];
  subcategorias: Subcategoria[];
  fornecedores: Fornecedor[];
  /** Cultivares já cadastrados nos laudos (Arquivos) — sugeridos no autocomplete do campo Cultivar, pra manter o texto igual ao usado lá (o casamento produto↔laudo, ver calculoSemeadura.ts, depende disso). */
  cultivaresLaudos: string[];
  /** Processos já cadastrados nos laudos (Arquivos) — sugeridos no autocomplete do campo Processo, mesma ideia do Cultivar. */
  processosLaudos: string[];
  /** true = esse produto tem desconto médio real (BI) em pelo menos 1 canal — só nesse caso o checkbox "Usar desconto real" aparece (ver temDescontoBiParaProduto em historicoBi.ts). */
  temDescontoBi: boolean;
  onFechar: () => void;
  onSalvar: (patch: {
    nome: string;
    codigo: string;
    categoriaId: string;
    /** Texto livre — o chamador acha (ou cria na hora) a Subcategoria com esse nome dentro da Categoria escolhida (ver encontrarOuCriarSubcategoria em PricingPage.tsx). Vazio = sem Subcategoria/Processo (Categoria geral). */
    processo: string;
    valorKg: number;
    custo: number;
    peso: number;
    despesaExtraValor: number;
    cubagem: string | null;
    fornecedorId: string | null;
    imprimir: boolean;
    usarDescontoReal: boolean;
    mostrarDetalhesCatalogo: boolean;
    cultivar: string | null;
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

export function EditProductModal({ produto, categorias, subcategorias, fornecedores, cultivaresLaudos, processosLaudos, temDescontoBi, onFechar, onSalvar }: EditProductModalProps) {
  const [nome, setNome] = useState('');
  const [codigo, setCodigo] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [processo, setProcesso] = useState('');
  const [valorKg, setValorKg] = useState('');
  const [peso, setPeso] = useState('');
  const [despesaValor, setDespesaValor] = useState('0');
  const [cubagemC, setCubagemC] = useState('');
  const [cubagemL, setCubagemL] = useState('');
  const [cubagemA, setCubagemA] = useState('');
  const [fornecedorId, setFornecedorId] = useState('');
  const [imprimir, setImprimir] = useState(true);
  const [usarDescontoReal, setUsarDescontoReal] = useState(false);
  const [mostrarDetalhesCatalogo, setMostrarDetalhesCatalogo] = useState(true);
  const [cultivar, setCultivar] = useState('');

  useEffect(() => {
    if (!produto) return;
    setNome(produto.nome);
    setCodigo(produto.codigo ?? '');
    setCategoriaId(produto.categoriaId);
    setProcesso((produto.subcategoriaId && subcategorias.find((s) => s.id === produto.subcategoriaId)?.nome) || '');
    setValorKg(produto.valorKg ? String(produto.valorKg) : '');
    setPeso(String(produto.peso));
    setDespesaValor(String(produto.despesaExtraValor || 0));
    const partes = produto.cubagem?.split(/x/i) ?? [];
    setCubagemC(partes[0]?.trim() ?? '');
    setCubagemL(partes[1]?.trim() ?? '');
    setCubagemA(partes[2]?.trim() ?? '');
    setFornecedorId(produto.fornecedorId ?? '');
    setImprimir(produto.imprimir);
    setUsarDescontoReal(produto.usarDescontoReal);
    setMostrarDetalhesCatalogo(produto.mostrarDetalhesCatalogo);
    setCultivar(produto.cultivar ?? '');
  }, [produto]);


  function salvar() {
    const pesoNum = parseFloat(peso);
    const valorKgNum = parseFloat(valorKg);
    if (!nome.trim()) {
      alert('Informe o nome do produto.');
      return;
    }
    if (isNaN(pesoNum) || pesoNum <= 0) {
      alert('Informe um peso válido para o produto.');
      return;
    }
    if (isNaN(valorKgNum) || valorKgNum <= 0) {
      alert('Informe o Valor Kg do produto.');
      return;
    }
    const cubagemPreenchida = cubagemC.trim() && cubagemL.trim() && cubagemA.trim();
    onSalvar({
      nome: nome.trim(),
      codigo: codigo.trim(),
      categoriaId,
      processo: processo.trim(),
      valorKg: valorKgNum,
      custo: valorKgNum * pesoNum,
      peso: pesoNum,
      despesaExtraValor: parseFloat(despesaValor) || 0,
      cubagem: cubagemPreenchida ? `${cubagemC.trim()}x${cubagemL.trim()}x${cubagemA.trim()}` : null,
      fornecedorId: fornecedorId || null,
      imprimir,
      usarDescontoReal,
      mostrarDetalhesCatalogo,
      cultivar: cultivar.trim() || null,
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

        <Linha label="Cultivar">
          <AutocompleteInput
            value={cultivar}
            onChangeTexto={setCultivar}
            opcoes={cultivaresLaudos.map((c) => ({ valor: c }))}
            placeholder="Ex.: Massai, Marandu (opcional)"
            className={campoClasse}
          />
        </Linha>

        <Linha label="Processo">
          <AutocompleteInput
            value={processo}
            onChangeTexto={setProcesso}
            opcoes={processosLaudos.map((p) => ({ valor: p }))}
            placeholder="Ex.: Tradicional, Incrustado (opcional)"
            title="Antiga Subcategoria/Classe — acha (ou cria na hora) a Subcategoria com esse nome dentro da Categoria abaixo, com a margem própria dela. Em branco, o produto fica na Categoria geral."
            className={campoClasse}
          />
        </Linha>

        <Linha label="Categoria">
          <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className={campoClasse}>
            {categorias.map((c) => (
              <option key={c.id} value={c.id} className="text-[var(--color-text)]">
                {c.nome}
              </option>
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

        <Linha label="Valor Kg">
          <input
            type="number"
            step="0.01"
            min="0"
            value={valorKg}
            onChange={(e) => setValorKg(e.target.value)}
            placeholder="R$/Kg"
            className="num w-full rounded-md border-2 border-[var(--color-accent)] bg-[var(--color-surface)] px-2 py-1.5 text-sm font-bold text-[var(--color-text)]"
          />
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

        <label
          className="flex items-center gap-2 text-xs text-[var(--color-text)]"
          title="Sobrepõe a configuração da Tabela (Parametrização > Tabelas > Mostrar detalhes): desmarcado, esconde VC%/Validade/PMS no card do Catálogo Online SÓ pra esse produto, mesmo com a Tabela mostrando pros demais."
        >
          <input
            type="checkbox"
            checked={mostrarDetalhesCatalogo}
            onChange={(e) => setMostrarDetalhesCatalogo(e.target.checked)}
            className="accent-[var(--color-accent)]"
          />
          Mostrar detalhes no catálogo
        </label>

        {temDescontoBi && (
          <label
            className="flex items-center gap-2 text-xs text-[var(--color-text)]"
            title="Encargos 'Desconto' passa a usar o desconto médio real da última Safra vendida (BI), em vez do valor cadastrado no Canal — só disponível porque esse produto tem esse dado."
          >
            <input type="checkbox" checked={usarDescontoReal} onChange={(e) => setUsarDescontoReal(e.target.checked)} className="accent-[var(--color-accent)]" />
            Usar desconto real
          </label>
        )}
      </div>
    </Modal>
  );
}
