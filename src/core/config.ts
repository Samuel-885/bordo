// Valores ajustáveis da seção "Decisões em aberto" da especificação.

export const CONFIG = {
  /** Até quantos minutos, para mais ou para menos, é "no horário". */
  toleranciaNoHorarioMin: 5,
  /** Margem mínima (fechamento − fim da parada) para "viável". */
  margemViavelMin: 15,
  /** Multiplica o tempo de carro da rota. Ajustável em cada viagem. */
  fatorOnibusPadrao: 1.15,
  /** Depois de quantos minutos uma consulta ao Google Maps vira "antiga" e deixa de valer. */
  consultaValidaMin: 30,
  /** Backup (fase 10a): depois de quantas horas o último backup passa a pedir atenção na tela principal. */
  backupAvisaDepoisDeHoras: 4,
  /** Backup (fase 10a): quantos registros novos desde o último backup passam a pedir atenção. */
  backupAvisaDepoisDeRegistros: 15,
  /** Backup (fase 10a): quantas horas "AGORA NÃO" silencia a sugestão de backup. */
  backupSilencioHoras: 2,
  /** Fator ônibus aceito na viagem (fase 8). */
  fatorOnibusMin: 1,
  fatorOnibusMax: 2,
  /** Trecho manual × rota (× fator ônibus): a diferença é "grande" quando passa dos dois limites ao mesmo tempo. */
  rotaDiferencaGrandeMin: 15,
  /** Percentual da rota × fator ônibus. */
  rotaDiferencaGrandePct: 15,
  /** Serviços da fase 8 (só no planejamento, com internet). OSRM público do FOSSGIS: perfil de carro, sem chave. */
  rotasUrl: 'https://routing.openstreetmap.de/routed-car/route/v1/driving',
  /** Photon (OpenStreetMap), sem chave. */
  geocodificadorUrl: 'https://photon.komoot.io/api/',
  /** O OSRM público pede no máximo 1 requisição por segundo: esperamos um pouco mais entre uma e outra. */
  rotasIntervaloMs: 1100,
  servicoTempoLimiteMs: 10000,
  /** Previsão com trânsito (TomTom, via Netlify Function do próprio site): só nos cálculos a partir da posição atual. */
  transitoUrl: '/.netlify/functions/transito',
  /** A função espera o TomTom por até `transitoFuncaoTempoLimiteMs`; o app espera a função um pouco mais. */
  transitoTempoLimiteMs: 8000,
  transitoFuncaoTempoLimiteMs: 6000,
  /** Caixa do Brasil (graus): a função só aceita coordenadas de origem e destino dentro dela. */
  caixaDoBrasil: { latMin: -34, latMax: 5.5, lngMin: -74, lngMax: -28 },
  buscaMaxResultados: 5,
  /** Atualizar pela localização (GPS): tempo limite da leitura da posição. */
  gpsTempoLimiteMs: 15000,
  /** Precisão do GPS (raio, em metros) acima da qual a prévia avisa "posição aproximada". */
  gpsPrecisaoRuimM: 1000,
  /** Mapa do cadastro de local: precisão do GPS (raio, em metros) acima da qual o pino recebe um aviso (sem bloquear). */
  gpsPrecisaoLocalM: 50,
  /** Mapa: zoom ao abrir num ponto (acerta a entrada de um restaurante ou de uma casa), sobre o centro do catálogo e sem referência nenhuma. */
  mapaZoomDoPonto: 17,
  mapaZoomDoCatalogo: 12,
  mapaZoomSemReferencia: 4,
  /** Depois de quantos minutos a prévia pela localização deixa de valer e pede novo cálculo. */
  previaLocalizacaoValidaMin: 2,
  /** Atualizar sozinho pela localização: intervalo entre as leituras. */
  atualizacaoAutomaticaMin: 5,
  /** No modo automático, só grava se o horário calculado difere da previsão atual por pelo menos isto. */
  atualizacaoAutomaticaDiferencaMinMin: 2,
} as const
