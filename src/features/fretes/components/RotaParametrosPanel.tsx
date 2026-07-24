import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { fmtInt } from '@/lib/format';
import { kmPorDiaCheio } from '../calculations';
import type { RotaParametros } from '../types';

interface RotaParametrosPanelProps {
  parametros: RotaParametros;
  onSalvar: (input: RotaParametros) => void;
}

const campoClasse = 'w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm text-[var(--color-text)]';

/** Parametrização única da Rota de Frota Própria — usada pelo modo "Rota" da Cotação de Frete pra calcular custo por km rodado, não por peso/transportadora. */
export function RotaParametrosPanel({ parametros, onSalvar }: RotaParametrosPanelProps) {
  const [form, setForm] = useState(parametros);

  useEffect(() => setForm(parametros), [parametros]);

  const alterado = JSON.stringify(form) !== JSON.stringify(parametros);

  return (
    <div className="space-y-3">
      <p className="text-sm font-bold text-[var(--color-text)]">Parametrização de Rota (Frota Própria)</p>
      <p className="text-xs text-[var(--color-text-soft)]">
        Usada só pelo modo "Rota" da Cotação de Frete — custo por km rodado (ida e volta) + despesa por dia de viagem, independente das transportadoras cadastradas.
      </p>
      <Card className="space-y-3 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Nome do transporte</label>
            <input value={form.nomeTransporte} onChange={(e) => setForm({ ...form, nomeTransporte: e.target.value })} className={campoClasse} placeholder="Ex.: Caminhão 1" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Cidade de início (Base)</label>
            <input value={form.cidadeInicio} onChange={(e) => setForm({ ...form, cidadeInicio: e.target.value })} className={campoClasse} placeholder="Ex.: Fortaleza, CE" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Horário de início da rota</label>
            <input type="time" value={form.horarioInicio} onChange={(e) => setForm({ ...form, horarioInicio: e.target.value })} className={campoClasse} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Valor por km (R$)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.valorKm}
              onChange={(e) => setForm({ ...form, valorKm: parseFloat(e.target.value) || 0 })}
              className={`num ${campoClasse}`}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Velocidade média (km/h)</label>
            <input
              type="number"
              step="1"
              min="0"
              value={form.velocidadeMedia}
              onChange={(e) => setForm({ ...form, velocidadeMedia: parseFloat(e.target.value) || 0 })}
              className={`num ${campoClasse}`}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Início de jornada (h)</label>
            <input
              type="number"
              step="0.5"
              min="0"
              max="23.5"
              value={form.jornadaInicioHora}
              onChange={(e) => setForm({ ...form, jornadaInicioHora: parseFloat(e.target.value) || 0 })}
              className={`num ${campoClasse}`}
              placeholder="Ex.: 6"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Término de jornada (h)</label>
            <input
              type="number"
              step="0.5"
              min="0"
              max="24"
              value={form.jornadaFimHora}
              onChange={(e) => setForm({ ...form, jornadaFimHora: parseFloat(e.target.value) || 0 })}
              className={`num ${campoClasse}`}
              placeholder="Ex.: 18"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Pausa (h)</label>
            <input
              type="number"
              step="0.5"
              min="0"
              value={form.pausaHoras}
              onChange={(e) => setForm({ ...form, pausaHoras: parseFloat(e.target.value) || 0 })}
              className={`num ${campoClasse}`}
              placeholder="Ex.: 1"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Média de km rodado por dia</label>
            <input value={`${fmtInt.format(Math.round(kmPorDiaCheio(form)))} km`} disabled className={`num ${campoClasse} cursor-not-allowed opacity-70`} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Despesa extra por dia (R$)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.despesaExtraDia}
              onChange={(e) => setForm({ ...form, despesaExtraDia: parseFloat(e.target.value) || 0 })}
              className={`num ${campoClasse}`}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Peso mínimo p/ comparativo automático (kg)</label>
            <input
              type="number"
              step="1"
              min="0"
              value={form.pesoMinimoComparativo}
              onChange={(e) => setForm({ ...form, pesoMinimoComparativo: parseFloat(e.target.value) || 0 })}
              className={`num ${campoClasse}`}
              placeholder="Ex.: 500"
            />
          </div>
        </div>
        <p className="text-xs text-[var(--color-text-soft)]">
          "Km rodado por dia" é calculado (velocidade × (jornada − pausa)) — não precisa digitar direto. O "Horário de início da rota" (acima) é o que
          realmente sai no 1º dia: se cair no meio da jornada, o 1º dia roda só o resto do tempo até o "Término de jornada". O "Peso mínimo" define a
          partir de quantos kg a Cotação de Frete de Cidade única já compara sozinha com a Frota Própria — 0 desliga esse gatilho automático.
        </p>
        <div className="flex justify-end">
          <Button variant="primary" disabled={!alterado} onClick={() => onSalvar(form)}>
            Salvar parametrização
          </Button>
        </div>
      </Card>
    </div>
  );
}
