import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

interface AcoesConciliacaoCardProps {
  processando: boolean;
  onConciliarAutomatico: () => void;
  onNovoLancamentoManual: () => void;
}

/** Ações da Conciliação (não são upload — importar OFX/Sistema agora vive na página de Uploads). */
export function AcoesConciliacaoCard({ processando, onConciliarAutomatico, onNovoLancamentoManual }: AcoesConciliacaoCardProps) {
  return (
    <Card className="flex flex-wrap items-center gap-2 p-4">
      <Button variant="action" disabled={processando} onClick={onConciliarAutomatico}>
        {processando ? 'Processando…' : 'Conciliar Automático'}
      </Button>
      <Button variant="outline" onClick={onNovoLancamentoManual}>
        + Lançamento Manual
      </Button>
    </Card>
  );
}
