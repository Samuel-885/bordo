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
} as const
