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
  await supabase.from('rota_cidades_cache').insert({ cidade_normalizada: chave, cidade_exibicao: cidade, latitude: lat, longitude: lon });
  return { lat, lon };
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
