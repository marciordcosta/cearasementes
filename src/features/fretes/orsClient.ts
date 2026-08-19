import { supabase } from '@/lib/supabase';
import { normalizarCidade } from './calculations';

const ORS_API_KEY = import.meta.env.VITE_ORS_API_KEY;
const ORS_BASE_URL = 'https://api.openrouteservice.org';

export interface Coordenada {
  lat: number;
  lon: number;
}

function checarChave() {
  if (!ORS_API_KEY) {
    throw new Error('Rotas não configuradas: defina VITE_ORS_API_KEY no seu .env com a chave gratuita do OpenRouteService (veja .env.example).');
  }
}

/** Erro amigável pra resposta HTTP da ORS — cota estourada (429) é o caso mais comum de dar problema em uso normal. */
async function erroDaResposta(resp: Response, contexto: string): Promise<Error> {
  if (resp.status === 429) {
    return new Error('Limite diário de consultas de rota atingido (plano gratuito do OpenRouteService). Tente novamente mais tarde.');
  }
  if (resp.status === 401 || resp.status === 403) {
    return new Error('Chave da API de rotas inválida ou sem permissão — confira VITE_ORS_API_KEY no .env.');
  }
  const corpo = await resp.text().catch(() => '');
  return new Error(`Falha ao consultar ${contexto} (HTTP ${resp.status}). ${corpo.slice(0, 200)}`);
}

/**
 * Busca as coordenadas de uma cidade — primeiro no cache (rota_cidades_cache,
 * evita gastar cota da API pra cidade já usada antes), senão geocodifica via
 * OpenRouteService e grava no cache pra próxima vez.
 */
export async function geocodificarCidade(cidade: string): Promise<Coordenada> {
  const chave = normalizarCidade(cidade);

  const { data: doCache } = await supabase.from('rota_cidades_cache').select('*').eq('cidade_normalizada', chave).maybeSingle();
  if (doCache) return { lat: doCache.latitude, lon: doCache.longitude };

  checarChave();
  const url = `${ORS_BASE_URL}/geocode/search?api_key=${ORS_API_KEY}&text=${encodeURIComponent(cidade)}&boundary.country=BR&size=1`;
  const resp = await fetch(url);
  if (!resp.ok) throw await erroDaResposta(resp, `a cidade "${cidade}"`);

  const json = await resp.json();
  const feature = json.features?.[0];
  if (!feature) throw new Error(`Cidade "${cidade}" não encontrada — tente incluir o estado (ex.: "Sobral, CE").`);

  const [lon, lat] = feature.geometry.coordinates as [number, number];
  // Best-effort: falha em gravar o cache (RLS, rede) não deve derrubar a geocodificação, que já
  // funcionou — só loga, senão a cidade volta a gastar cota da API toda vez sem ninguém perceber.
  const { error: erroCache } = await supabase
    .from('rota_cidades_cache')
    .insert({ cidade_normalizada: chave, cidade_exibicao: cidade, latitude: lat, longitude: lon });
  if (erroCache) console.error('Falha ao gravar cache de cidade geocodificada:', erroCache);
  return { lat, lon };
}

/** Distância em linha reta (Haversine, km) entre 2 coordenadas — só pra ESTIMAR a ordem mais curta da rota (ver sugerirOrdemPorProximidade), não pro cálculo de custo real (que usa km de rodovia via calcularRotaKm). */
function haversineKm(a: Coordenada, b: Coordenada): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Sugere a ordem das cidades que minimiza a distância total em linha reta,
 * partindo da Base — heurística "vizinho mais próximo" (gulosa, a cada passo
 * escolhe a cidade restante mais perto da última visitada). Não é o ótimo
 * exato (problema do caixeiro-viajante), mas não gasta cota da API de rotas
 * (só usa coordenadas já geocodificadas) e já evita "zigue-zague" óbvio.
 */
export function sugerirOrdemPorProximidade(coordBase: Coordenada, cidades: { nome: string; coord: Coordenada }[]): string[] {
  const restantes = [...cidades];
  const ordenadas: string[] = [];
  let atual = coordBase;
  while (restantes.length > 0) {
    let melhorIndice = 0;
    let melhorDistancia = Infinity;
    restantes.forEach((c, i) => {
      const d = haversineKm(atual, c.coord);
      if (d < melhorDistancia) {
        melhorDistancia = d;
        melhorIndice = i;
      }
    });
    const [escolhida] = restantes.splice(melhorIndice, 1);
    ordenadas.push(escolhida.nome);
    atual = escolhida.coord;
  }
  return ordenadas;
}

/**
 * Km real de rodovia entre uma sequência de pontos (uma chamada só resolve
 * a rota inteira, incluindo ida e volta se o array já começar e terminar no
 * mesmo ponto/Base) — retorna o total e o km de cada trecho individual.
 */
export async function calcularRotaKm(pontos: Coordenada[]): Promise<{ kmTotal: number; trechosKm: number[] }> {
  checarChave();
  const resp = await fetch(`${ORS_BASE_URL}/v2/directions/driving-car`, {
    method: 'POST',
    headers: { Authorization: ORS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ coordinates: pontos.map((p) => [p.lon, p.lat]) }),
  });
  if (!resp.ok) throw await erroDaResposta(resp, 'a rota');

  const json = await resp.json();
  const rota = json.routes?.[0];
  if (!rota) throw new Error('Não foi possível calcular uma rota entre essas cidades.');

  return {
    kmTotal: rota.summary.distance / 1000,
    trechosKm: rota.segments.map((s: { distance: number }) => s.distance / 1000),
  };
}
