# Bordo — Especificação da lógica

Versão de 21/10/2026

## Objetivo e princípios

Este documento define as regras que o Bordo segue para planejar, registrar e recalcular a viagem. É a referência para a construção no Claude Code: quando o código e este documento divergirem, vale o documento.

Princípios que valem para todas as regras abaixo:

- **Nada inventado.** Todo tempo de trecho tem origem registrada: roteiro, rota calculada, manual ou Google Maps. Sem origem, o trecho fica "sem tempo definido" e o app avisa.
- **Original congelado.** Ao iniciar a viagem, o planejamento é copiado e nunca mais muda. Toda comparação usa essa cópia.
- **Recálculo local.** Durante a viagem, todo cálculo roda no celular, sem internet.
- **Previsão nunca no passado.** Um evento que ainda não aconteceu não pode ter previsão anterior ao horário atual.
- **Atraso nunca somado.** Atraso é sempre a diferença entre um horário e o original do mesmo evento.
- **Menos funções, mais confiabilidade.** Em caso de dúvida, o app mostra que não sabe em vez de estimar.
- **Custo zero.** Nenhum serviço pago, nenhum cadastro com cartão.

## Modelo de dados

São oito entidades. O registro de eventos é a fonte da verdade: o estado da viagem (onde estamos, previsões, atrasos) é sempre recalculado a partir do plano mais os eventos, nunca guardado à parte.

| Entidade | Campos principais | Observações |
| --- | --- | --- |
| Viagem | id, nome, tipo (ida, volta), data de saída, status, viagem relacionada, fator ônibus, plano original | Plano original fica vazio até "Iniciar viagem". A volta aponta para a ida. |
| Etapa | id, viagem, ordem, tipo, local, motivo, categoria, janela início/fim, permanência (min), chegada do roteiro, alternativas, modo de conferência | Tipos: origem, obrigatória, flexível, destino. Na origem, o horário do roteiro é a saída. O local é o preferido (o do roteiro); as alternativas são os outros candidatos. Parada não planejada não é etapa: é um par de eventos. |
| Local | id, nome, cidade, tipo, coordenadas, abre, fecha, telefone, ônibus para (sim, não, não sei), observações, marcação (favorito, evitar) | Catálogo reutilizado entre viagens e anos. Abre e fecha são "HH:MM", um único horário por local, resolvidos pela data da chegada (única exceção à regra dos horários completos). |
| Trecho | etapa de origem, local de origem, etapa de destino, local de destino, duração (min), fonte, distância (km), calculado em | Fonte: roteiro, rota, manual, estimado. Um trecho por par de locais candidatos. Só rota e manual são guardados; roteiro e estimado são derivados no cálculo. Na rota, a duração guardada é a de carro, sem o fator ônibus. |
| Evento | id, viagem, tipo, horário do fato, registrado em, etapa, dados, observação | Tipos: início, saída, chegada, recalibração, troca de local, pular etapa, parada não planejada (fase início ou fim), imprevisto, conferência, status do passageiro, fim. Todo horário de evento é arredondado para baixo, para o minuto. |
| Passageiro | id, nome, etapa de embarque, etapa de desembarque, status | Desembarque vazio = destino. Status: ativo, não embarcou, saiu da viagem. |
| Conferência | etapa, modo, confirmados, pendentes, resultado, motivo | Resultado: completa ou incompleta. |
| Feedback | local, viagem, etapa, nota (1 a 5), voltaria (sim, não), critérios, observação | Critérios opcionais: comida, banheiro, atendimento, rapidez, estacionamento. |

Todo horário é guardado com data completa e fuso (por exemplo `2026-11-14T06:47:00-03:00`), nunca só "06:47". A única exceção é o horário de funcionamento dos locais. Isso resolve a virada da meia-noite e as viagens de ida e volta em dias diferentes. Ipatinga e Ribeirão Preto estão no mesmo fuso.

O evento guarda dois horários: o do fato ("chegamos às 08:55") e o do registro (quando você apertou o botão). Corrigir um horário muda só o do fato.

## Ciclo de vida da viagem e estados das etapas

A viagem passa por três estados: **planejando**, **em andamento** e **concluída**. Só em "planejando" as etapas podem ser editadas livremente.

**Para iniciar a viagem**, toda etapa precisa ter horário previsto calculável, ou seja, todo trecho tem duração. Isso bloqueia o botão. Outros problemas só geram aviso e não bloqueiam: parada flexível sem local escolhido, local sem horário de funcionamento, chegada prevista fora da janela, nenhum passageiro cadastrado.

Ao iniciar, o app copia os horários calculados de cada etapa para o plano original e registra o evento "início". A viagem termina com a chegada registrada no destino.

Cada etapa tem um estado:

| Estado | Quando | O que a tela principal mostra |
| --- | --- | --- |
| Pendente | Ainda não chegamos | Próxima etapa (a primeira pendente) |
| Em parada | Chegada registrada, saída não | Cronômetro da parada e botão SAÍMOS |
| Concluída | Saída registrada | Some da tela principal, fica na timeline |
| Pulada | Etapa flexível descartada | Fica riscada na lista e na timeline |

A origem só tem saída e o destino só tem chegada. Ponto obrigatório nunca pode ser pulado. Entre a saída de uma etapa e a chegada na próxima, a viagem está **em trânsito**: isso é um estado da viagem, não de uma etapa.

**Desfazer.** O último registro (chegada, saída, troca, pulo) pode ser desfeito por alguns segundos depois de apertado, e corrigido a qualquer momento pela timeline. Um toque errado em CHEGAMOS dentro de um ônibus em movimento é inevitável.

## Regras de cálculo da previsão

A previsão é recalculada do zero, em ordem, da primeira à última etapa, a cada evento, a cada troca de local e a cada minuto do relógio. Não há previsão guardada: ela é sempre o resultado destas regras sobre o plano e os eventos.

**Chegada prevista de uma etapa**, nesta ordem de prioridade:

1. Se a chegada real foi registrada, é a chegada real.
2. Se há recalibração ativa para esta etapa, é o horário informado.
3. Senão, é a saída prevista da etapa anterior + a duração do trecho + o tempo de paradas não planejadas nesse trecho.

**Saída prevista de uma etapa:**

1. Se a saída real foi registrada, é a saída real.
2. Senão, é a chegada prevista + a permanência planejada.

**Regra do relógio.** O próximo evento ainda não registrado da viagem nunca fica no passado: se o valor calculado for anterior ao horário atual, ele vira o horário atual. Os eventos seguintes partem dele, então o efeito se propaga sozinho. Na prática:

- Parados além do planejado: a saída prevista acompanha o relógio, e todo o resto atrasa junto.
- Em trânsito além do previsto: a chegada prevista acompanha o relógio.
- Antes da saída, passou do horário: a saída prevista da origem acompanha o relógio.

**Duração de um trecho**, nesta ordem:

1. **Roteiro:** se as duas etapas têm horário no roteiro, a duração é a chegada do roteiro na etapa seguinte menos a saída do roteiro na anterior (chegada + permanência).
2. **Rota:** calculada antes da viagem pelo serviço gratuito, multiplicada pelo fator ônibus.
3. **Manual:** digitada por você em horas e minutos, só quando não há as outras.
4. Nenhuma: "sem tempo definido", e a viagem não pode ser iniciada.

Alternativas que não são a preferida não têm horário de roteiro, então usam rota ou manual.

**Plano original.** Ao iniciar a viagem, as mesmas regras rodam sem eventos e sem a regra do relógio. O resultado (chegada e saída de cada etapa, com o local escolhido) é a expectativa original congelada.

**Pular etapa flexível.** Ao pular, a etapa sai da corrente. O trecho que liga a anterior à seguinte normalmente não foi calculado. Nesse caso a duração é a soma dos dois trechos que passavam pela etapa pulada, com fonte "estimado". É uma aproximação para cima, porque a parada ficava mais ou menos no caminho.

**Trechos pré-calculados.** Antes da viagem, com internet, o app calcula os trechos entre todos os locais candidatos de etapas vizinhas: cada alternativa do almoço com cada alternativa do café, e assim por diante. São poucos cálculos (três alternativas de um lado e três do outro dão nove) e garantem que trocar de restaurante durante a viagem não precise de internet.

## Cálculo de atraso

O atraso de qualquer evento é o horário real (ou previsto, se ainda não aconteceu) menos o horário original do mesmo evento. Nunca é a soma de diferenças anteriores.

O número principal da tela é o **atraso na chegada ao destino**: chegada prevista no destino menos chegada original no destino. Cada evento da timeline mostra o próprio atraso.

Exemplo com os horários do seu planejamento:

| Evento | Original | Real | Atraso no evento | Previsão no destino |
| --- | --- | --- | --- | --- |
| Saída de Ipatinga | 06:30 | 06:47 | +17 min | 23:47 (+17) |
| Chegada em Monlevade | 08:25 | 08:55 | +30 min | 00:00 (+30) |
| Saída de Monlevade | 08:40 | 09:14 | +34 min | 00:04 (+34) |

O atraso no destino depois de Monlevade é +34, não 17 + 30 + 34. Cada linha mede a distância até o original, e o atraso cresce só quando a realidade se afasta mais do plano.

Regras de exibição:

- Adiantamento aparece com sinal negativo (−5 min).
- Até 5 minutos para mais ou para menos aparece como "no horário".
- Se o local de uma parada flexível mudou (almoço planejado no Restaurante A, feito no C), a comparação continua sendo pela etapa "Almoço".
- Para o relatório, o app também calcula a **variação** de cada trecho e parada: quanto o atraso cresceu ou diminuiu ali (por exemplo, a parada em Monlevade durou 19 min em vez de 15: +4). É essa variação que aponta onde o atraso nasceu.

## Recalibração manual via Google Maps

A recalibração substitui a chegada prevista na **próxima etapa** por um horário que você informa, e só isso. Os trechos seguintes mantêm suas durações.

Fluxo: você toca ATUALIZAR PREVISÃO, abre o Google Maps pelo botão, vê o horário de chegada, volta e digita, por exemplo, 13:02.

Regras:

- Vale só durante o trecho atual. Quando a chegada é registrada, a recalibração deixa de existir (a chegada real a substitui).
- Uma nova recalibração no mesmo trecho substitui a anterior.
- Horário anterior ao atual é recusado, com aviso.
- Só pode ser feita em trânsito ou parado na etapa anterior (aguardando a saída da origem conta como parado). Não existe recalibração direta do destino. Veja "Decisões da fase 1" para o efeito em cada caso.
- A previsão mostra a origem: "Google Maps, informado às 11:40".
- Pode ser desfeita, voltando ao cálculo pelo trecho.

O Google Maps é aberto por um link comum com as coordenadas do destino. Não há chamada de API nem cobrança.

## Alternativas e viabilidade

Para uma parada flexível ainda não alcançada, o app calcula cada alternativa como se ela fosse a escolhida e classifica pelo horário de funcionamento.

Para cada alternativa L:

1. Chegada em L = saída prevista da etapa anterior + trecho até L (com a regra do relógio).
2. Fim da parada em L = chegada + permanência planejada.
3. Impacto no destino = diferença entre a chegada prevista no destino com L e com a escolha atual.

Classificação, pela margem = fechamento − fim da parada:

| Classe | Regra |
| --- | --- |
| Inviável | Chega com o local fechado (antes de abrir ou a partir do fechamento) |
| Pouca margem | Chega aberto, mas a margem é menor que 15 min (inclusive negativa: a permanência não cabe) |
| Viável | Margem de 15 min ou mais |
| Sem horário | Funcionamento não cadastrado: mostra só a chegada |
| Sem tempo | Trecho sem duração (local sem coordenadas): não mostra chegada |

Com o seu exemplo e 60 min de almoço: Restaurante A chega 14:15 e fecha 14:00, inviável. Restaurante B chega 14:35, termina 15:35 e fecha 15:00, pouca margem. Restaurante C chega 15:05, termina 16:05 e fecha 16:30, viável com 25 min de margem.

Avisos que aparecem junto da classe, sem mudá-la: chegada fora da janela ideal, ônibus não para ou "não sei", marcado como evitar, mal avaliado em viagem anterior, favorito.

Ordem da lista: viáveis primeiro, depois pouca margem, sem horário, inviáveis e sem tempo; dentro de cada grupo, pela chegada mais cedo.

Escolher outra alternativa registra o evento "troca de local" e a previsão é recalculada na hora. Um local que fecha depois da meia-noite (fecha menor que abre) tem o fechamento tratado como dia seguinte.

## Passageiros e conferência

**Esperados a bordo** ao sair de uma etapa = passageiros ativos que embarcam nessa etapa ou antes, e que não desembarcaram nela ou antes. Na saída de Ipatinga são 35; na saída de Monlevade, 38. É esse número que aparece como "35/35", nunca o total da viagem.

Um passageiro pode mudar de status durante a viagem:

- **Não embarcou:** não apareceu no ponto de embarque. Sai da contagem dali em diante.
- **Saiu da viagem:** embarcou, mas não continua (foi de carro, ficou em uma cidade). Sai da contagem dali em diante.

As duas mudanças viram evento na timeline, com horário e motivo.

**Conferência.** Todo SAÍMOS passa pela tela de conferência. Se todos já estão confirmados, é um toque.

| Situação | Começa como |
| --- | --- |
| Origem | Todos pendentes |
| Ponto de embarque | Quem já estava a bordo: confirmado. Quem embarca ali: pendente |
| Refeições (almoço, café, jantar) | Modo "todos desceram": todos pendentes |
| Banheiro, descanso, parada não planejada | Modo "só alguns": todos confirmados, você desmarca quem desceu |

O modo pode ser trocado na hora. Ao trocar, a lista reinicia no estado do novo modo.

**Contagem rápida.** Se o número digitado é igual aos esperados, todos ficam confirmados e a conferência registra "completa por contagem". Se é diferente, o app mostra a diferença e pede a conferência por nome. A contagem não altera ninguém individualmente.

**Sair sem todos.** Só é possível dando a cada pendente um status (não embarcou, saiu da viagem) e um motivo. Assim a contagem seguinte continua correta e ninguém fica para trás por um toque distraído.

No destino não há conferência.

## Eventos, timeline, imprevistos e paradas não planejadas

A timeline é a lista de eventos ordenada pelo horário do fato. Ela é gerada, não digitada.

**CHEGAMOS e SAÍMOS** registram o horário atual. Depois podem ser corrigidos, com estas travas:

- Não pode ser depois do horário atual.
- A chegada não pode ser antes da saída da etapa anterior.
- A saída não pode ser antes da chegada da mesma etapa.

**Imprevisto** = horário + tipo + observação curta. Tipos: trânsito, acidente na estrada, problema mecânico, passageiro, clima, atraso, outro. O imprevisto não altera o cálculo sozinho: a realidade aparece nos horários registrados. Depois de registrar, o app oferece ATUALIZAR PREVISÃO.

**Parada não planejada.** Em trânsito, o botão PARAMOS registra o início, e VOLTAMOS registra o fim, com tipo opcional (pneu, polícia, banheiro, passageiro passando mal, outro). Enquanto dura, o tempo parado é somado à chegada prevista da próxima etapa. Depois, a duração real fica somada. Não exige local cadastrado. Na saída, a conferência abre no modo "só alguns".

**Cronômetro.** Em parada, a tela mostra o tempo decorrido desde a chegada real, o tempo planejado e quanto falta. Ao passar do planejado, mostra "excedeu em X min". O cronômetro é derivado da chegada registrada, então sobrevive a fechar o app ou reiniciar o celular.

## Rotas automáticas e fallback

Rotas são calculadas só no planejamento, com internet, e guardadas. Durante a viagem o app nunca depende delas.

- Exigem coordenadas nos dois locais. Sem coordenadas, o trecho fica "sem tempo".
- O serviço usa dados do OpenStreetMap e é gratuito. A escolha exata (por exemplo, um servidor público de OSRM ou o OpenRouteService com cadastro gratuito) fica para a fase de stack, e os limites de uso precisam ser confirmados na época.
- O tempo do serviço é de carro. O app multiplica pelo fator ônibus (proposta: 1,15, ajustável na viagem).
- Distância em linha reta nunca é usada como tempo.
- Cada trecho guarda distância, duração, fonte e data do cálculo. A tela mostra "calculado pela rota".
- Se o serviço falhar ou estiver fora, o trecho fica "sem tempo" e você pode digitar a duração (fonte "manual") ou tentar de novo depois.
- Um botão "recalcular rotas" refaz todos os trechos de fonte rota, sem tocar nos de roteiro e manuais.

Para calibrar o fator ônibus antes da viagem: compare dois ou três trechos do roteiro (que vêm da empresa) com o tempo calculado pela rota.

## Mensagem de atualização para Ribeirão Preto

GERAR ATUALIZAÇÃO monta um texto a partir do estado atual, mostra uma prévia editável e oferece COPIAR e COMPARTILHAR (menu nativo do celular, que inclui o WhatsApp). Sem compartilhamento disponível, só copiar.

Campos, nesta ordem, com os ícones do seu exemplo:

| Campo | Origem |
| --- | --- |
| Identificação | Texto configurável na viagem (por exemplo, "Unidade X — Ipatinga") |
| Situação | Aguardando saída, Em viagem, Parados em \<local>, Chegamos |
| Próxima etapa | Nome da etapa e do local |
| Chegada estimada | Previsão da próxima etapa |
| Previsão no destino | Chegada prevista no destino |
| Atraso atual | Atraso no destino, ou "no horário" |
| Passageiros | A bordo / esperados |
| Observação | Opcional, digitada na hora |
| Atualizado às | Horário da geração |

A mensagem nunca leva nomes de passageiros, só contagens.

Na parada flexível há uma segunda mensagem, para o restaurante: "Grupo de N pessoas, chegada prevista às HH:MM", com o telefone do local pronto para ligar.

## Relatório final, feedback e uso na volta

**Relatório** (gerado na chegada ao destino, copiável como texto):

- Tabela por etapa: original × real, chegada e saída, com o atraso de cada uma.
- Tempo total: saída real da origem até chegada real no destino.
- Tempo parado: soma de todas as permanências, incluindo paradas não planejadas. Tempo em movimento: total menos parado.
- Principais atrasos: os três trechos ou paradas com maior variação positiva (seção de atraso).
- Paradas realizadas, com o local usado e a nota dada.
- Imprevistos, com horário e tipo.
- Passageiros: esperados × embarcados, mudanças de status.

**Feedback.** Ao sair de uma parada flexível, o app oferece avaliar, sem obrigar. Campos: nota de 1 a 5, "pararia aqui de novo?" (sim, não) e, opcionalmente, os critérios e uma observação. Ao final, pode marcar o local como favorito ou evitar. A marcação fica no local e vale para todas as viagens futuras.

**Volta.** "Criar volta a partir da ida" copia os passageiros (com embarque e desembarque a revisar) e usa o mesmo catálogo de locais. As etapas são novas, porque a ordem e os horários mudam. Nas alternativas da volta aparecem os sinais da ida: "bem avaliado na ida", "mal avaliado na ida", favorito, evitar. O catálogo também guarda a última vez que o local foi usado e a média das notas, para os próximos anos.

## Modo demonstração e relógio simulado

Todo o app lê o horário de uma única função, `agora()`. Na viagem real ela devolve o relógio do celular. Na demonstração devolve um relógio simulado. Isso permite testar 17 horas de viagem em minutos, com exatamente o mesmo código.

- **Controles do relógio:** avançar 5, 15 ou 60 minutos e definir um horário.
- **Dados fictícios:** a viagem das telas de planejamento (Ipatinga, Monlevade, almoço com três alternativas, café, jantar, Ribeirão Preto) e 38 passageiros fictícios.
- **Cenários prontos**, cada um um botão: saída atrasada, chegada atrasada em Monlevade, passageiro faltando, parada estourando o tempo, restaurante ficando inviável e troca, recalibração pelo Google Maps, parada não planejada, chegada ao destino.
- **Isolamento:** a demonstração usa um espaço de dados separado, com uma faixa "MODO DEMONSTRAÇÃO" sempre visível. Nada dela vai para viagens reais, relatório ou catálogo de locais.
- **Reiniciar:** volta ao início do cenário com um toque.

Os casos de teste abaixo devem ser executáveis neste modo.

## Armazenamento, offline e privacidade

O Bordo é um app web instalável (PWA) que guarda tudo no próprio celular e funciona sem internet depois de instalado.

| Função | Sem internet |
| --- | --- |
| Planejar, registrar, recalcular, conferir, timeline, relatório | Funciona |
| Copiar mensagem | Funciona |
| Compartilhar no WhatsApp | Abre, mas a mensagem só sai quando houver sinal |
| Calcular rotas | Não funciona (só no planejamento) |
| Mapa | Só as áreas já carregadas antes |
| Abrir no Google Maps | Depende do próprio Google Maps |

**Backup.** "Exportar backup" gera um arquivo com a viagem, os locais e os passageiros. "Importar" restaura em outro celular. O app lembra de exportar antes de iniciar a viagem. Instalar na tela inicial reduz o risco de o navegador apagar os dados, mas o backup continua sendo a garantia.

**Privacidade (LGPD).**

- Passageiro tem só nome, embarque e desembarque. Nenhum outro dado pessoal.
- Nada sai do celular, a não ser o que você copia, compartilha ou exporta.
- A mensagem gerada não leva nomes.
- "Apagar passageiros" remove os nomes ao fim da viagem, mantendo as contagens no relatório.
- O arquivo de backup contém nomes: deve ser tratado como dado confidencial.

Durante a conferência, a tela fica acesa (quando o navegador permite), para não apagar no meio da contagem.

## Casos de teste do recálculo

Todos partem do mesmo plano: saída de Ipatinga 06:30; Monlevade 08:25, 15 min; almoço 12:00, 60 min; café 16:00, 30 min; jantar 20:30, 50 min; Ribeirão Preto 23:30. Trechos: 1h55, 3h20, 3h00, 4h00 e 2h10. Cada caso continua do anterior, salvo indicação. O código só está pronto quando todos passam.

| # | Situação | Entrada | Resultado esperado |
| --- | --- | --- | --- |
| 1 | Saída atrasada | Saída real 06:47 | Monlevade 08:42, almoço 12:17, destino 23:47, atraso +17 |
| 2 | Chegada atrasada | Chegada em Monlevade 08:55 | Saída prevista 09:10, almoço 12:30, destino 00:00, atraso +30 |
| 3 | Atraso não somado | Saída de Monlevade 09:14 | Atraso na saída +34, destino 00:04, atraso +34 (não +81) |
| 4 | Parada estourando | A partir do caso 2, relógio 09:20, sem saída | Saída prevista 09:20, destino 00:10, atraso +40 |
| 5 | Trânsito estourando | A partir do caso 3, relógio 12:50, sem chegada | Chegada prevista no almoço 12:50, destino 00:20, atraso +50 |
| 6 | Recalibração | A partir do caso 3, informa almoço 13:02 | Almoço 13:02, destino 00:32, atraso +62 |
| 7 | Recalibração no passado | Relógio 12:10, informa 12:05 | Recusada com aviso, nada muda |
| 8 | Parada não planejada | A partir do caso 3, 20 min parados antes do almoço | Almoço 12:54, destino 00:24, atraso +54 |
| 9 | Viabilidade | Chegadas 14:15, 14:35, 15:05; fechamentos 14:00, 15:00, 16:30; 60 min | A inviável, B pouca margem, C viável (25 min de margem) |
| 10 | Pular etapa | Plano sem eventos, café pulado | Trecho almoço → jantar 7h00 "estimado", jantar 20:00, destino 23:00, −30 |
| 11 | Virada do dia | Destino previsto 00:04 | Tratado como dia seguinte: atraso +34, não −23h26 |
| 12 | Passageiros esperados | 35 em Ipatinga, 3 em Monlevade | 35 esperados na saída de Ipatinga, 38 na saída de Monlevade |
| 13 | Não embarcou | 1 de Monlevade marcado "não embarcou" | 37 esperados dali em diante |
| 14 | Contagem rápida | 38 esperados, digita 37 | Nada confirmado, aviso de diferença de 1 |
| 15 | Original intacto | Qualquer caso acima | Plano original idêntico ao do início da viagem |

## Decisões em aberto

Os valores abaixo estão neste documento como proposta. Cada um vira uma configuração simples, para não exigir mudança de código.

- [ ] Tolerância de "no horário": 5 min?
- [ ] Margem mínima para "viável": 15 min?
- [ ] Fator ônibus: 1,15, a calibrar com o roteiro da empresa.
- [x] Horário de funcionamento: um único horário por local na primeira versão (ver "Decisões da fase 1").
- [x] Texto de identificação na mensagem (unidade, cidade).
- [ ] Regras de descanso do motorista: confirmar com a empresa de ônibus se há um ou dois motoristas e se existe parada mínima obrigatória.
- [ ] Serviço de rotas e hospedagem: definir na fase de stack, com os limites gratuitos confirmados.

## Decisões da fase 1

Aprovadas em 21/10/2026, na construção do núcleo de cálculo. Complementam e, onde divergem, prevalecem sobre as seções anteriores.

**Horários**

- Todo horário de evento (do fato, do registro, o informado na recalibração e o corrigido) é arredondado para baixo, para o minuto, ao ser criado. O app trabalha só com minutos inteiros.
- O horário atual (`agora()`) também é arredondado para baixo, para o minuto, na entrada do cálculo e das validações. Assim a regra do relógio, as paradas em andamento e as travas trabalham com o mesmo minuto dos eventos; a previsão pode ficar até 59 segundos atrás do relógio, o que não aparece na tela.
- Os horários são guardados com segundos (`2026-11-14T06:47:00-03:00`).
- Horários nunca são comparados como texto: toda comparação e conta é feita pelo valor numérico.
- Abre e fecha de um local são "HH:MM", um único horário por local, resolvidos pela data da chegada. Fecha antes de abrir significa fechar no dia seguinte; por isso, uma chegada depois da meia-noite também é comparada com o período que começou na véspera.

**Duração dos trechos**

- A fonte roteiro só vale entre etapas vizinhas no plano e quando as duas estão no local preferido. Ao pular uma etapa, as etapas que ficam vizinhas não usam o roteiro: vale o trecho direto, se tiver sido calculado, ou a soma dos trechos que passavam pela pulada, com fonte "estimado".
- Rota × fator ônibus é arredondada para cima, para o minuto.

**Regra do relógio e registros esquecidos**

- A regra do relógio vale para o primeiro evento sem registro depois do último registrado, e vale por cima de qualquer outra origem da previsão, inclusive a recalibração.
- Um evento sem registro que vem antes de um registrado (por exemplo, chegada registrada sem a saída da etapa anterior ou da origem) é um registro esquecido: a regra do relógio não o empurra, e o app aponta a pendência para que o horário seja informado.

**Recalibração**

- Feita em trânsito: a chegada prevista é o horário informado.
- Feita parado na etapa anterior, ou aguardando a saída da origem: vira duração do trecho (horário informado − horário em que foi informada), aplicada a partir da saída real ou prevista da etapa anterior. Se a saída atrasar, a chegada atrasa junto.
- O tempo das paradas não planejadas iniciadas depois da recalibração é somado a ela.
- Trocar o local da etapa depois de uma recalibração a cancela: a previsão volta a ser calculada pelo trecho.

**Parada não planejada**

- Não é uma etapa: é um par de eventos (PARAMOS = início, VOLTAMOS = fim) ligado à próxima etapa. Enquanto dura, conta o tempo até agora. A conferência no modo "só alguns" vale para a saída depois de VOLTAMOS.

**Alternativas**

- Cada alternativa é calculada pelas regras completas da previsão, como se fosse a escolhida (incluindo paradas não planejadas do trecho; a recalibração vale só para o local já escolhido).
- O aviso "mal avaliado em viagem anterior" fica para a fase 10.

**Passageiros**

- Mudança de status (não embarcou, saiu da viagem) é o evento "status do passageiro", com passageiro, status, motivo e a etapa onde aconteceu. Vale dessa etapa em diante.
