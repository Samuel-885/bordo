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
| Viagem | id, nome, tipo (ida, volta), data de saída, status, viagem relacionada, fator ônibus, identificação, equipe, plano original | Plano original fica vazio até "Iniciar viagem". A volta aponta para a ida. Identificação (texto) e equipe (número de motoristas e responsáveis, padrão 0) são opcionais e só alimentam as mensagens (fase 7). |
| Etapa | id, viagem, ordem, tipo, local, motivo, categoria, janela início/fim, permanência (min), chegada do roteiro, alternativas, modo de conferência | Tipos: origem, obrigatória, flexível, destino. Na origem, o horário do roteiro é a saída. O local é o preferido (o do roteiro); as alternativas são os outros candidatos. Parada não planejada não é etapa: é um par de eventos. |
| Local | id, nome, cidade, tipo, coordenadas, abre, fecha, telefone, ônibus para (sim, não, não sei), observações, marcação (favorito, evitar) | Catálogo reutilizado entre viagens e anos. Abre e fecha são "HH:MM", um único horário por local, resolvidos pela data da chegada (única exceção à regra dos horários completos). |
| Trecho | etapa de origem, local de origem, etapa de destino, local de destino, duração (min), fonte, distância (km), calculado em | Fonte: roteiro, rota, manual, estimado. Um trecho por par de locais candidatos. Só rota e manual são guardados; roteiro e estimado são derivados no cálculo. Na rota, a duração guardada é a de carro, sem o fator ônibus. Um trecho manual pode guardar ao lado a rota calculada (`rota`: duração de carro, distância e data), que nunca entra no cálculo (ver "Decisões da fase 8"). |
| Evento | id, viagem, tipo, horário do fato, registrado em, etapa, dados, observação | Tipos: início, saída, chegada, recalibração, troca de local, pular etapa, parada não planejada (fase início, fim ou previsão), imprevisto, conferência, status do passageiro, atualização gerada, observação, fim. Todo horário de evento é arredondado para baixo, para o minuto. |
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
- O serviço usa dados do OpenStreetMap e é gratuito: o OSRM público do FOSSGIS (perfil de carro), sem chave. A escolha, os limites e o plano B estão em "Decisões da fase 8".
- O tempo do serviço é de carro. O app multiplica pelo fator ônibus (proposta: 1,15, ajustável na viagem).
- Distância em linha reta nunca é usada como tempo.
- Cada trecho guarda distância, duração, fonte e data do cálculo. A tela mostra "calculado pela rota".
- Se o serviço falhar ou estiver fora, o trecho fica "sem tempo" e você pode digitar a duração (fonte "manual") ou tentar de novo depois.
- O botão "Calcular tempos" faz o cálculo e também o recálculo: refaz todos os trechos de fonte rota, sem tocar nos manuais (a rota nova fica ao lado deles) e sem alterar o tempo do roteiro.

Para calibrar o fator ônibus antes da viagem: compare dois ou três trechos do roteiro (que vêm da empresa) com o tempo calculado pela rota.

## Mensagem de atualização para Ribeirão Preto

GERAR ATUALIZAÇÃO monta um texto a partir do estado atual, mostra uma prévia editável e oferece COPIAR e COMPARTILHAR (menu nativo do celular, que inclui o WhatsApp; sem ele, um link do WhatsApp com o texto). O formato do texto é um modelo editável (ver "Decisões da fase 7"). Os campos, nesta ordem, são os do modelo padrão:

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

Na parada flexível há uma segunda mensagem, para o restaurante: o tamanho do grupo e a chegada prevista naquele local, com o telefone do local pronto para ligar.

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
| Editar modelos de mensagem, registrar observação | Funciona |
| Calcular rotas | Não funciona (só no planejamento) |
| Buscar endereço no cadastro de local | Não funciona (avisa; o resto do formulário funciona) |
| Mapa | Só as áreas já carregadas antes |
| Abrir no Google Maps | Depende do próprio Google Maps |

**Backup.** A tela "Backup" (botão BACKUP da lista de viagens) gera um arquivo com tudo do espaço real (viagens com o plano original, etapas, locais, trechos, eventos, passageiros e modelos de mensagem; as consultas ao Google Maps ficam de fora) e restaura esse arquivo em outro celular ou no mesmo. O app pergunta se a pessoa quer fazer o backup antes de iniciar a viagem e mostra na tela principal quando foi o último. Instalar na tela inicial reduz o risco de o navegador apagar os dados, mas o backup continua sendo a garantia. Detalhes na seção "Decisões da fase 10a".

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
- [x] Serviço de rotas e hospedagem: OSRM público do FOSSGIS e Photon, hospedagem no Netlify (ver "Decisões da fase 8"). Se o app virar ferramenta oficial da empresa, rever.

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

## Decisões da fase 3

Aprovadas em 21/10/2026, na construção do planejamento com persistência. Complementam as seções anteriores.

**Persistência**

- Dois bancos IndexedDB separados e com o mesmo esquema: `bordo` (real) e `bordo-demo` (demonstração). O relógio acompanha o espaço: entrar no espaço real liga o relógio real; entrar na demonstração liga o simulado, apaga o `bordo-demo` e regrava o planejamento fictício (também ao reiniciar). O repositório do banco real se recusa a trabalhar com o relógio simulado ligado, e o da demonstração, com o relógio real.
- Só plano e eventos são guardados. Trechos só existem entre etapas vizinhas e entre locais que ainda são candidatos: ao reordenar, excluir uma etapa ou remover uma alternativa, os trechos digitados que deixaram de valer são apagados. Se a ação apagaria trechos digitados à mão (fonte "manual"), a tela pede confirmação informando quantos; sem trecho manual afetado, não pergunta.
- Mudar a data de saída desloca junto os horários já gravados das etapas, sem mudar as horas.
- Depois de iniciada, a viagem não aceita mais edição do planejamento; só o nome pode mudar.

**Horários nos formulários**

- Os campos pedem só "HH:MM". A data vem da saída do roteiro da etapa anterior mais próxima que tenha horário (ou do dia da saída da viagem). Hora menor que a dessa referência vai para o dia seguinte, com "+1 dia" e confirmação.
- A janela da parada flexível é ancorada no dia da chegada da etapa (ou da referência anterior). Quando o fim é menor que o início (a janela atravessa a meia-noite):
  - com a chegada conhecida e a hora dela menor ou igual ao fim (chegada exatamente no fim conta como dentro), o início fica na véspera da chegada e o fim no dia da chegada (chegada 00:30 do dia 15, janela 23:00–01:00 → 23:00 do dia 14 até 01:00 do dia 15);
  - senão (chegada depois do fim, por exemplo 01:01 ou mais tarde, ou sem chegada prevista), o início fica no dia da âncora e o fim no dia seguinte.

**Início da viagem**

- Bloqueios: os de `calcularPlanoOriginal`, mais um horário de roteiro anterior à saída da etapa anterior (daria trecho negativo) e viagem sem nome.
- Avisos (não bloqueiam): parada flexível sem local, local candidato sem horário de funcionamento, chegada prevista fora da janela. O aviso de "nenhum passageiro cadastrado" entra na fase 5.

## Decisões da fase 4

Aprovadas em 21/10/2026, na construção da tela principal, dos registros, da timeline e do PWA. Complementam as seções anteriores.

**Registros e travas**

- Além das três travas da seção "Eventos, timeline, imprevistos e paradas não planejadas", valem duas, para a ordem dos eventos nunca ficar inconsistente: a chegada não pode ser depois da saída da própria etapa, e a saída não pode ser depois da chegada da etapa seguinte. "Anterior" e "seguinte" ignoram etapas puladas. Valem no registro pelos botões e na correção pela timeline.
- Só chegadas e saídas podem ser corrigidas. Corrigir a chegada no destino move também o evento "fim".
- Chegada só na próxima etapa, com o ônibus em viagem; saída só da etapa em que estamos (a origem aguardando a saída conta). Nada pode ser registrado depois de agora, e a viagem concluída não aceita novos registros.
- Cada evento guarda uma sequência de gravação (1, 2, 3…). Os horários são arredondados ao minuto e empatam; a sequência diz qual foi o último registro.

**Horário digitado**

- Registro esquecido, correção, imprevisto e volta à estrada (VOLTAMOS): o "HH:MM" vira a ocorrência mais recente que não seja depois de agora. Não existe "+1 dia". Se violar uma trava, a tela mostra a trava. Quando o dia resultante não é o de hoje, a tela mostra o dia junto (ex.: "23:55 do dia 14").
- Previsão informada na recalibração (que fica no futuro): vale o dia, hoje ou amanhã, que ficar mais perto de agora. Assim 12:05 às 12:10 vale hoje e é recusada (caso 7), e 00:10 às 23:50 vale amanhã.

**Desfazer**

- Todo botão de registro (SAÍMOS, CHEGAMOS, PARAMOS, VOLTAMOS, recalibração, imprevisto, pular) mostra, por 8 segundos, um aviso com DESFAZER.
- Desfazer apaga os eventos criados por aquele registro, identificados pelo id, e só se ainda forem os últimos da viagem pela sequência de gravação. Se houve outro registro depois, recusa e manda corrigir pela timeline.
- Um registro pode criar mais de um evento (VOLTAMOS + chegada; chegada no destino + "fim"): desfaz-se tudo junto. Desfazer a chegada no destino reabre a viagem (status "em andamento"). O evento "início" nunca é desfeito.

**Motivos, imprevisto e parada**

- Os motivos do PARAMOS passam a ser: pneu, polícia, banheiro, passageiro passando mal, acidente na estrada, trânsito parado e outro (os dois novos são "Acidente na estrada" e "Trânsito parado").
- A folha de REGISTRAR IMPREVISTO avisa: "O ônibus está parado? Use PARAMOS para a previsão contar o tempo parado." Em viagem, ela oferece o botão "Usar PARAMOS", que fecha a folha e abre o PARAMOS. O imprevisto continua sem alterar o cálculo.

**Parada não planejada esquecida aberta**

- Com PARAMOS sem VOLTAMOS, o botão principal é VOLTAMOS. Se for registrar CHEGAMOS mesmo assim, a tela pergunta primeiro a que horas voltamos à estrada (mesma regra de horário) e grava o VOLTAMOS antes da chegada, numa só operação. A volta não pode ser antes do PARAMOS nem depois de agora.

**Tela principal**

- A situação (aguardando saída, em viagem, parados em um local, parada não planejada, chegamos) e o cronômetro vêm do núcleo (`src/core/registro.ts`), sem regra na interface. O cronômetro trabalha em minutos inteiros.
- Aguardando a saída, a "próxima etapa" mostrada é a etapa depois da origem (é a ela que a recalibração se aplica e para onde o link do Google Maps aponta).
- Chegada no destino conclui a viagem (evento "fim") e mostra o resumo original × real. O relatório completo é da fase 10.
- O botão voltar do celular navega entre as telas (`history.pushState`).
- Ao abrir o app no espaço real, se houver exatamente uma viagem em andamento, a tela principal dela abre direto, com a lista logo abaixo no histórico (o voltar leva a ela). Com nenhuma ou mais de uma em andamento, abre a lista. Viagens planejando ou concluídas não contam. A demonstração não participa da regra.

**Demonstração**

- Os cenários rodam no banco da demonstração: escolher um cenário reinicia o banco, liga o relógio em `cenario.inicio`, inicia a viagem de verdade e fica no passo 0. Cada passo de registro passa pelo mesmo repositório e pelas mesmas travas da viagem real. O primeiro registro feito pelos botões liga o modo livre.
- Os controles ganham o botão "Relógio parado / Relógio correndo". Correndo, o relógio simulado avança em tempo real a partir do horário simulado atual; definir horário e +5/+15/+60 continuam valendo, e ele segue correndo dali. O padrão é parado. Escolher ou reiniciar um cenário, ou reiniciar a demonstração, volta a parado, para cenários e testes continuarem determinísticos. A viagem real nunca usa o simulado, e só `relogio.ts` lê o relógio do sistema.
- Eventos de passageiro e de conferência dos cenários são gravados, mas a timeline os mostra de forma genérica e sem nomes, até a fase 5.

**PWA**

- Service worker gerado com Workbox: tudo o que o build emite entra no cache (o app abre sem internet depois da primeira visita). As fontes IBM Plex são hospedadas no próprio app (subconjunto latino).
- O ícone do app e o favicon são o mesmo "B" branco sobre `#14181F`, com a barra azul `#1E4FD8`.
- Versão nova do app não recarrega sozinha: aparece o aviso "Nova versão do Bordo" e a troca só acontece quando a pessoa toca em Atualizar.

## Decisões da fase 5

Aprovadas em 21/10/2026, na construção de passageiros e conferência. Complementam as seções anteriores.

**Persistência**

- O banco passa à versão 2 do esquema, que só adiciona a tabela `passageiros` (índices `id` e `viagemId`), nos dois bancos (`bordo` e `bordo-demo`). Nenhuma linha existente é reescrita: as viagens, etapas, locais, trechos e eventos que já estão nos celulares continuam como estavam.
- O passageiro ganha o campo `viagemId` (o modelo de dados não o listava): sem ele não há como listar os passageiros de uma viagem por índice.
- O `status` do passageiro é gravado sempre como "ativo". As mudanças (não embarcou, saiu da viagem) vivem só nos eventos "status do passageiro", como o estado derivado de sempre; desfazer um registro desfaz o status junto.
- App aberto em mais de um lugar (outra aba, janela ou o app instalado): a conexão que está aberta se fecha sozinha quando outra quer subir a versão do banco (`versionchange`) e a tela mostra "O Bordo foi atualizado. Toque para recarregar." Se é a abertura nova que fica presa por outra conexão (`blocked`), a tela mostra "Feche as outras abas ou janelas do Bordo e toque para tentar de novo.", e a abertura segue sozinha quando a outra conexão fecha. Tocar na mensagem recarrega o app. Um banco fechado nunca mostra o erro técnico: vira a mensagem de atualização. Vale para os dois bancos.
- A semente da demonstração grava os 38 passageiros fictícios. Excluir uma viagem apaga os passageiros dela.

**Cadastro**

- Selects: embarque aceita a origem e os pontos obrigatórios; desembarque aceita os pontos obrigatórios e o destino (padrão). Paradas flexíveis ficam de fora, porque podem ser puladas. O desembarque precisa ser depois do embarque.
- Planejando, o cadastro é livre. Com a viagem em andamento: dá para adicionar alguém de última hora e escolher embarque e desembarque só em etapas de onde ainda não saímos; quem já aparece em alguma conferência ou tem status só pode mudar o nome e não pode ser excluído (o caminho é o status "saiu da viagem"). Viagem concluída não aceita mudança. A lista de passageiros não faz parte do plano original e não o altera.
- Conferências passadas guardam os ids de confirmados e pendentes, então mudar o cadastro depois não as reescreve.
- "Nenhum passageiro cadastrado" entra nos avisos do início da viagem e não bloqueia. Sem passageiros cadastrados, o SAÍMOS e o VOLTAMOS gravam direto, sem conferência.

**Conferência**

- Esperados na saída de uma etapa = `esperadosNaSaida`, com a lista por nome vinda de `passageirosEsperados`. Na volta à estrada (VOLTAMOS), os esperados são os que seguem a bordo no trecho que chega na próxima etapa (`passageirosEmTransito`): embarcaram antes dela, desembarcam nela ou depois, e mudanças de status registradas nela já valem. É o mesmo conjunto de `esperadosNaSaida` da última etapa de que saímos, a menos que uma conferência anterior do mesmo trecho já tenha dado status a alguém.
- O evento "conferência" ganha o campo opcional `momento` ("saida" ou "volta"); vazio vale "saida". Na volta, o evento e os status levam como etapa a próxima etapa, igual ao PARAMOS.
- Modo inicial: volta = "só alguns"; senão, `modoConferencia` da etapa, se definido; origem e refeições (almoço, café, jantar) = "todos desceram"; banheiro, descanso, ponto obrigatório e parada flexível sem categoria = "só alguns". A tabela da especificação não cobre ponto obrigatório sem categoria nem parada sem categoria: o ponto obrigatório funciona como ponto de embarque (quem já estava a bordo confirmado, quem embarca ali pendente; sem embarcantes, todos confirmados) e a parada sem categoria usa "só alguns".
- Trocar o modo reinicia a lista: "todos desceram" deixa todos pendentes e "só alguns" confirma todos, exceto no modo padrão de um ponto obrigatório, que volta ao estado de embarque.
- Contagem rápida: número igual aos esperados confirma todos e o resultado é "completa por contagem"; qualquer toque depois em um nome volta o resultado para "completa". Número diferente mostra a diferença e não altera ninguém.
- Sair sem todos: cada pendente recebe status (não embarcou ou saiu da viagem) e motivo. Ordem de gravação, numa só transação: conferência, um status por pendente e a saída (ou o fim da parada, na volta), todos com o mesmo horário e a mesma sequência crescente. Um DESFAZER desfaz tudo junto. Conferência e status são validados no registro: os ids precisam bater com os esperados e o status só pode ser "não embarcou" ou "saiu da viagem".
- O VOLTAMOS passa pela conferência apenas pelo botão VOLTAMOS. O caminho "CHEGAMOS sem registrar a volta antes", em que a volta é informada depois, não abre conferência.
- A tela fica acesa durante a conferência (Wake Lock, quando o navegador permite; pedido de novo ao voltar à aba). O botão voltar do celular fecha a conferência sem registrar nada.

**Marcar quem desceu** (melhoria da conferência)

- Novo evento "desceram", sem efeito no cálculo da previsão: etapa, local da marcação (`etapa`, a parada de uma etapa; ou `nao_planejada`, a parada não planejada, ligada à próxima etapa como os outros eventos da parada) e os ids de quem desceu. Uma marcação nova na mesma parada substitui a anterior: vale a mais recente pela sequência de gravação, e os eventos antigos ficam. Por isso o DESFAZER, que apaga o último registro, devolve a marcação anterior. Na parada não planejada só vale a marcação feita depois do último PARAMOS: um PARAMOS novo começa uma parada nova, sem marcação. Marcação vazia = "ninguém desceu".
- A lista só tem os esperados a bordo naquele ponto: na parada de uma etapa, os esperados na saída que já embarcaram antes dela (quem embarca ali ainda não está a bordo); na parada não planejada, os esperados em trânsito. O registro recusa ids fora dessa lista.
- Folha "Quem desceu?" com "Todos", "Escolher nomes" (lista em botões grandes, toque marca) e "Agora não". Abre sozinha depois do CHEGAMOS em toda parada, menos refeições (almoço, café, jantar), origem e destino, e depois do PARAMOS. Sem passageiros cadastrados ou sem ninguém a bordo naquele ponto, não abre. Durante a parada (cronômetro ou parada não planejada), o botão "Marcar quem desceu" no cartão abre a folha direto na lista, com ou sem marcação anterior (e com a marcação atual, se houver), para marcar ou corrigir a qualquer momento. Só a folha que abre sozinha depois do CHEGAMOS ou do PARAMOS mostra as três opções.
- Na conferência da saída (ou do VOLTAMOS), havendo marcação: só quem desceu fica pendente e os demais que já estavam a bordo são confirmados (quem vai embarcar ali continua pendente), com o aviso "X desceram, Y ficaram no ônibus. Se tiver dúvida, use a contagem rápida." A marcação considera só quem ainda é esperado (quem saiu da viagem no meio fica de fora). "Todos" equivale a "todos desceram". Sem marcação, a conferência funciona como antes. Tocar no modo que já está selecionado não faz nada (a lista e a marcação ficam como estão); só a troca para o outro modo reinicia a lista no estado desse modo, sem a marcação, e tira o aviso.
- A timeline mostra "Desceram N passageiros na parada de …" com os nomes (só no celular).

**Mensagens de erro do banco**

- Todas as telas, de leitura e de registro, passam o erro por `mensagemDeErroDoBanco`: banco fechado vira "O Bordo foi atualizado. Toque para recarregar."; as mensagens das regras (travas, edição bloqueada) continuam como estavam.

**Tela principal e timeline**

- Em trânsito: "Y/Y a bordo · conferido às HH:MM", com o horário da última conferência da saída da etapa deixada ou da volta à estrada; "sem conferência" se a saída foi gravada sem ela. Parado ou aguardando a saída: "Y esperados na saída", sem X, porque ninguém foi conferido ainda. Sem passageiros cadastrados, nada aparece. A tela principal ganha o botão PASSAGEIROS, para o cadastro de última hora.
- A timeline mostra a conferência ("37/38 a bordo · Falta: Nome") e as mudanças de status com o nome do passageiro e o motivo. Os nomes ficam só no celular: a mensagem da fase 7 nunca os leva.
- Demonstração: o cenário "Passageiro faltando" grava a conferência incompleta de Monlevade antes da saída; os demais cenários continuam com SAÍMOS direto, sem conferência.

## Decisões da fase 6

Aprovadas em 22/10/2026, na construção das alternativas e da viabilidade na viagem. Complementam as seções anteriores.

**Planejamento**

- Entre duas etapas vizinhas em que ao menos uma tem alternativas, a seção "Tempos das alternativas" lista todos os pares de locais candidatos (da etapa anterior até cada alternativa e de cada alternativa até a seguinte, inclusive quando a vizinha também tem alternativas), menos o par preferido → preferido, que continua na linha de trecho entre as etapas. Cada par mostra a duração e a fonte, ou "sem tempo", e aceita horas e minutos (fonte "manual").
- Alternativa com algum par sem tempo gera o aviso "alternativa sem trecho" no início da viagem. Não bloqueia.

**Troca de local na viagem**

- O evento "troca de local" só é aceito para parada flexível ainda pendente (não alcançada nem pulada), com local entre os candidatos da etapa e diferente do atual. "Inviável" é aceita (a tela pede confirmação).
- A troca é recusada quando falta o tempo de algum trecho: o da etapa anterior até o novo local ou o do novo local até a etapa seguinte (com as puladas entre elas). A mensagem diz qual: "Falta o tempo de X até Y." Alternativa "Sem tempo" não pode ser escolhida.
- Trocar o local cancela a recalibração da etapa (decisão da fase 1). A tela avisa antes, e pede confirmação, quando há uma previsão do Google Maps ativa naquela etapa.
- DESFAZER funciona como nos outros registros.

**Trecho manual durante a viagem**

- Dá para gravar a duração manual de um trecho com a viagem em andamento, só quando o trecho ainda não foi percorrido (a etapa de destino não foi alcançada e a de origem não foi deixada, ou está pulada), liga etapas vizinhas e locais candidatos, e o par ainda não tem tempo definido. Nada que já entra na previsão é alterado em silêncio.
- Não é evento e não aparece na timeline. O plano original guarda horários, não durações, e não muda.
- Em trânsito, o trecho em curso (da etapa que acabamos de deixar até a próxima) não aceita duração. O caso é tratado pela chegada informada, abaixo.

**Escolher uma alternativa sem o trecho em curso (chegada pelo Google Maps)**

- Quando, em trânsito para a parada, o único trecho sem tempo até a alternativa é o que está em curso, o ESCOLHER pede "Chegada no <local> pelo Google Maps" (HH:MM, com o link do Maps para o local) e grava, numa só transação, a troca de local e a recalibração da etapa com esse horário. Pelas decisões da fase 1, a recalibração feita depois da troca vale para o novo local: nenhuma regra de cálculo muda.
- O trecho da alternativa até a etapa seguinte continua obrigatório (se faltar, informa-se com "Informar tempo", porque é futuro). Antes do horário informado, a lista mostra a classe "Sem tempo" e a dica "Informe a chegada pelo Google Maps para escolher".
- O núcleo valida (`validarTrocaComChegada`): só vale nesse caso; o horário passa pelas mesmas travas da recalibração (não anterior a agora, em trânsito para a etapa), avaliadas já com a troca. A troca simples continua recusada nesse caso. O DESFAZER retira os dois eventos juntos.
- Desempate no mesmo minuto: a troca cancela a recalibração feita antes dela e, quando os dois eventos têm o mesmo horário (minuto), vale a ordem de gravação (a sequência; um evento simulado acrescentado no fim vale por último). Isso aplica a decisão da fase 1 sem mudar o resultado quando os horários diferem. Sem o desempate, a avaliação das outras alternativas, logo depois de escolher uma pelo Maps, herdaria a chegada informada para o novo local.

**Tela de alternativas**

- Botão VER ALTERNATIVAS na tela principal enquanto houver parada flexível pendente com mais de um local. A tela lista as paradas flexíveis pendentes, cada uma com as alternativas na ordem de `avaliarAlternativas`: classe, chegada estimada, fim da parada, "fecha às" (o horário cadastrado no local), margem, impacto na chegada ao destino ("+20 min", "−5 min") e os avisos. A escolhida atual vem marcada.
- Em cada alternativa: link do Google Maps e, havendo telefone, LIGAR (link `tel:` só com dígitos). O espaço da mensagem para o restaurante fica para a fase 7.
- PULAR ESTA PARADA vale para qualquer parada flexível pendente, com confirmação, usando `validarPulo`. O botão PULAR ETAPA da tela principal continua para a próxima parada.
- Demonstração: o cenário "Restaurante inviável e troca" continua como está. Parando no passo anterior ao último, a troca para o Restaurante C pode ser feita pela tela de alternativas, no modo livre, com o mesmo resultado do cenário.

**Consultar alternativas pelo Google Maps**

- Na próxima parada flexível (em trânsito para ela ou parado na etapa anterior, as mesmas condições da recalibração), cada local tem o botão CONSULTAR NO MAPS: abre o Google Maps com a rota até o local (link comum, sem API, origem = posição atual do celular) e pede "Chegada no <local> pelo Google Maps" (HH:MM, mesma resolução de horário da recalibração). A alternativa é recalculada como se a chegada fosse essa (classe, chegada, fim da parada, margem, impacto no destino), com a origem "Google Maps, informado às HH:MM". Paradas além da próxima seguem pelos trechos, sem o botão.
- A consulta não é fato da viagem: não é evento, não aparece na timeline, não altera a previsão nem o plano original. Usa o mesmo mecanismo da recalibração, simulado (nenhuma regra de cálculo muda); o local já escolhido simula só a recalibração, os outros a troca seguida da recalibração.
- **Onde fica:** tabela `consultas` do Dexie (esquema v3, só adiciona a tabela), chave viagem + etapa + local; uma consulta nova no mesmo local substitui a anterior. É a única exceção à regra "só plano e eventos" e fica fora do backup. É apagada com a viagem e as descartadas são limpas ao guardar uma nova.
- **Vigência:** vale 30 min (`consultaValidaMin`). Depois disso, ou quando, em trânsito, o horário consultado já passou, fica "antiga": aparece marcada, mas não entra no cálculo. Depois de uma saída, chegada, troca de local ou pulo (comparados pela sequência de gravação) a consulta é descartada.
- **Parado na etapa anterior**, a consulta informa a duração até o local, não um horário absoluto: a chegada vale horário consultado + (agora − momento da consulta). Consultado às 08:30 com chegada 12:00 e aplicado às 08:38, a chegada é 12:08, e a duração se mantém. Em trânsito o horário é absoluto.
- **ESCOLHER** uma alternativa com consulta vigente grava troca + recalibração com a chegada da consulta (calculada no momento do registro), numa só transação (`registrarTrocaComChegada`); o DESFAZER retira os dois eventos, e a consulta usada é consumida. O núcleo valida com as mesmas travas da recalibração, avaliadas já com a troca. Com a consulta, o trecho de chegada sem tempo deixa de impedir a escolha, também parado; o trecho do local até a etapa seguinte continua obrigatório. Para o local já escolhido, a consulta vira ATUALIZAR PREVISÃO (só a recalibração). DESCARTAR CONSULTA apaga a consulta.
- **Eventos no mesmo minuto (corrigido depois da fase 6):** os horários dos eventos são arredondados ao minuto e empatam. Todo cálculo que ordena os eventos pelo horário do fato desempata o empate pela ordem de gravação (a sequência; sem sequência, a posição na lista), e não pela ordem em que o banco devolveu a lista. Antes, isso valia só entre troca e recalibração; agora vale também entre duas trocas, duas recalibrações, PARAMOS e VOLTAMOS e mudanças de status, e o nome do local em uso na interface segue a mesma regra. O horário continua mandando: o evento de horário mais tarde vale, mesmo com sequência menor.


## Decisões da fase 7

Aprovadas em 22/10/2026, na construção da mensagem de atualização, da mensagem para o restaurante, dos modelos editáveis e das observações. Complementam as seções anteriores.

**Dados novos da viagem**

- `identificacao` (texto, opcional) e `equipe` (número inteiro de 0 a 99, opcional, padrão 0; "Equipe (motoristas e responsáveis)"). Editáveis no planejamento e com a viagem iniciada (a equipe não muda em viagem concluída). Não fazem parte do plano original e não entram em nenhum cálculo; a equipe só entra no tamanho do grupo da mensagem do restaurante. Sem mudança de esquema: a tabela `viagens` guarda o objeto inteiro.

**GERAR ATUALIZAÇÃO e OBSERVAÇÃO**

- Os dois botões só aparecem com a viagem em andamento.
- GERAR ATUALIZAÇÃO abre uma prévia com o texto editável e os botões COPIAR (área de transferência, com cópia alternativa quando o navegador recusa) e COMPARTILHAR (Web Share API quando existir; senão, abre o link `https://wa.me/?text=…` em outra aba). Um aviso fixo diz que, sem sinal, a mensagem só sai quando houver internet; com o aparelho sem conexão, o aviso ganha destaque.
- O texto editado na prévia é o que sai. A mensagem nunca leva nomes de passageiros, nem o motivo de uma parada não planejada.
- Evento **atualização gerada**: gravado ao COPIAR ou COMPARTILHAR, uma vez por prévia (não ao abrir a prévia). Guarda só o horário e a previsão informada no destino com o atraso (`previsaoDestino`, `atrasoMin`), nunca o texto. Aparece na timeline como "Atualização gerada · previsão 23:47 (+17 min)". Não altera a previsão, o plano original, as travas nem as pendências, e o DESFAZER o ignora (um registro anterior continua desfazível mesmo depois de uma atualização gerada).
- Evento **observação**: texto livre de até 500 caracteres (`dados.texto`) e horário que começa em agora e pode ser anterior (mesma regra do imprevisto: a ocorrência mais recente que não seja depois de agora). Sem efeito no cálculo. Aparece na timeline com o horário e o texto; DESFAZER funciona como nos outros registros (aviso de 8 segundos). Pela timeline, o texto e o horário podem ser corrigidos (o horário não pode ser depois de agora). Fica só no celular e nunca entra nas mensagens automáticas.

**Modelos de mensagem**

- Dois modelos, "atualização" e "restaurante": texto livre com variáveis entre chaves que o app preenche ao gerar. Valem para todas as viagens do espaço (real e demonstração têm os seus). Tela "Modelos de mensagem", aberta pela prévia, pela mensagem do restaurante e pela lista de viagens: lista das variáveis com a descrição (tocar insere no cursor), prévia ao vivo com a viagem em andamento (ou valores de exemplo, marcados como "exemplo", quando não há viagem iniciada) e "Voltar ao padrão".
- Linha que contém variável vazia é removida inteira; linhas em branco seguidas viram uma só e o texto é aparado nas pontas. Só `{nome}` com letras, números e sublinhado conta como variável; chave solta é texto comum. Variável desconhecida bloqueia o SALVAR; se um modelo salvo mesmo assim tiver uma, a geração usa o modelo padrão e avisa. O modelo não pode ficar vazio.
- Variáveis da atualização: `{identificacao}`, `{situacao}`, `{proxima_parada}`, `{hora_proxima}`, `{previsao_destino}` (horário já com o atraso: "23:47 (atraso de 17 min)", "23:30 (no horário)", "23:25 (adiantado 5 min)"; sem plano original, só o horário), `{destino}` (cidade do último local), `{passageiros}` ("35 a bordo" ou "35 esperados na saída"; vazio sem passageiros cadastrados e ao chegar) e `{agora}`.
- `{situacao}`: "aguardando saída", "em viagem", "parados em <etapa>", "parada não planejada" (sem o motivo) ou, no destino, "chegamos a <destino> às 23:47 (atraso de 17 min)"; nesse caso as variáveis da próxima parada e da previsão ficam vazias.
- Variáveis do restaurante: `{grupo}` (passageiros a bordo ao chegar naquele local, incluindo quem desce ali, mais a equipe), `{chegada}` (chegada prevista naquele local, a da avaliação da alternativa), `{local}` e `{identificacao}`. Sem passageiros e sem equipe, o botão fica desligado, com a dica.
- Nenhuma variável expõe nomes de passageiros.
- Modelos padrão:

```
🚌 Atualização da viagem
{identificacao}

Situação: {situacao}
Próxima parada: {proxima_parada}, às {hora_proxima}
Chegada em {destino}: {previsao_destino}
Passageiros: {passageiros}

Atualizado às {agora}
```

```
Olá! Somos um grupo de {grupo} pessoas ({identificacao}), em ônibus, com chegada prevista às {chegada}. Podem nos receber? Se o horário mudar, avisamos.
```

- **Onde ficam:** tabela `modelos` do Dexie (esquema v4, só adiciona a tabela), uma linha por modelo (`atualizacao`, `restaurante`) com o texto e a data. Sem linha gravada, vale o padrão, que mora no código. É a segunda exceção à regra "só plano e eventos" (a primeira é `consultas`): é configuração do app, não fato da viagem nem estado derivado. **Entra no backup da fase 10**, ao contrário das consultas.

## Ajuste do PARAMOS: paradas por escolha

Aprovado em 22/10/2026. Pensado para paradas por escolha ("todo mundo quer parar para um café"), não só por problema. Complementa a seção "Parada não planejada" e as decisões das fases 1, 4 e 5.

**Motivo e lugar**

- Novo motivo "Café / lanche" (`cafe`), entre "Banheiro" e "Outro".
- Campo opcional "Onde" (`onde`): nome do lugar, texto curto de até 60 caracteres, espaços aparados; vazio = ausente. Dica no campo: "Nome do lugar. Sem nomes de passageiros." Aparece na timeline ("PARAMOS · Café / lanche · Padaria Tal") e no cartão da parada, e fica no evento para o relatório da fase 10. Não entra na mensagem de atualização (que continua sem o motivo e sem o lugar) nem na variável `{situacao}`.

**Tempo previsto**

- Campo opcional "Tempo previsto" (`tempoPrevistoMin`): inteiro de 1 a 600 minutos.
- Informado no PARAMOS (evento fase `inicio`) ou depois, com a parada aberta, por um evento fase `previsao`. O evento `previsao` leva o **estado completo** da folha ("onde" e tempo previsto): vale o mais recente pela ordem de gravação, e o que vier ausente nele fica sem valor (apagar o tempo volta ao comportamento sem tempo previsto). Só é aceito com a parada aberta; depois do VOLTAMOS é recusado. Vai pelos mesmos botões e travas dos outros registros (não pode ser depois de agora nem antes do PARAMOS); o DESFAZER o retira como qualquer registro.
- Regra do cálculo. O tempo parado de cada parada do trecho que entra na chegada prevista da próxima etapa é:
  - parada fechada (com VOLTAMOS): a duração real, `fim − início`, mesmo menor que o tempo previsto;
  - parada aberta sem tempo previsto: `agora − início` (como antes);
  - parada aberta com tempo previsto T: `max(T, agora − início)`.
  Equivale a "volta prevista = max(início + T, agora)": a previsão mostra o impacto ao parar e volta a acompanhar o relógio se a parada estourar. As demais regras (recalibração, que só conta parada iniciada depois dela; regra do relógio; atraso medido contra o original do mesmo evento; plano original congelado) não mudam.
- Cartão "Parada não planejada": com tempo previsto, mostra "Previsto X min" e "faltam Y min" ou "excedeu em Y min" (minutos inteiros; vindos do núcleo, `situacaoDaViagem`), como o cronômetro das paradas planejadas. Botão para definir ou alterar "Onde" e tempo previsto numa só folha.

**Demonstração**

- Novo cenário "Parada para café": PARAMOS por "Café / lanche", "Onde" preenchido e tempo previsto de 20 min; passos que mostram a previsão ao parar, a parada estourando e o VOLTAMOS.

**Casos de teste** (`parada-tempo-previsto.test.ts`, do caso 3: saída de Monlevade 09:14, almoço 12:34, destino 00:04)

| # | Situação | Resultado esperado |
| --- | --- | --- |
| P1 | PARAMOS 10:00 sem tempo previsto, relógio 10:20 | Almoço 12:54, destino 00:24, +54 (igual ao caso 8) |
| P2 | PARAMOS 10:00 com T=20, relógio 10:00 | Almoço 12:54, destino 00:24, +54 |
| P3 | T=20, relógio 10:12 | Continua 12:54; cartão "faltam 8 min" |
| P4 | T=20, relógio 10:20 | 12:54; cartão "faltam 0 min" |
| P5 | T=20, relógio 10:35, aberta | Almoço 13:09, destino 00:39, +69; "excedeu em 15 min" |
| P6 | T=20, VOLTAMOS 10:14 | Duração real: almoço 12:48, destino 00:18, +48 |
| P7 | T=20, VOLTAMOS 10:31 | Almoço 13:05 |
| P8 | Aos 10:12, T muda de 20 para 40; depois é apagado | 13:14; apagado, 12:46 (volta a acompanhar o relógio) |
| P9 | Parada fechada de 10 min e outra aberta com T=15 | Soma 25 min: almoço 12:59 |
| P10 | Recalibração depois do PARAMOS | Parada anterior à recalibração não conta; parada nova com T conta |
| P11 | `previsao` com parada fechada, T=0, T=601, T não inteiro, "onde" com mais de 60 caracteres | Recusado, com mensagem |
| P12 | Qualquer caso acima | Plano original idêntico ao do início |

## Decisões da fase 10a

Aprovadas em 22 e 23/10/2026: backup e restauração. Relatório, feedback, viagem de volta e "apagar passageiros" ficam para a fase 10b. Complementam a seção "Armazenamento, offline e privacidade". Nenhuma regra de cálculo muda: a restauração grava os registros como estão, sem recalcular nada.

**O arquivo**

- Envelope JSON: `{ app: "bordo", formato: 1, geradoEm, resumo, conteudo, integridade }`. O `conteudo` tem `viagens` (com o `planoOriginal` congelado), `etapas`, `locais`, `trechos`, `eventos` (com `sequencia`), `passageiros` e `modelos`, copiados literalmente. Não leva consultas, nem a tabela `meta`, nem nada do espaço da demonstração. O `resumo` só facilita a leitura do arquivo: ao restaurar, o app o recalcula a partir do conteúdo.
- `integridade`: SHA-256 do `conteudo` serializado, calculado com `crypto.subtle` (exige conexão segura, HTTPS ou localhost). Detecta arquivo cortado ou corrompido. **Não protege contra edição feita à mão**: quem alterar o conteúdo e refizer o hash produz um arquivo válido. A estrutura e as referências cruzadas são conferidas de novo ao restaurar.
- `formato`: versão do formato do arquivo (hoje 1). Arquivo de formato mais novo que o do app é recusado com "atualize o app"; formato mais antigo passará por migração (ainda não existe nenhum).
- Nome: `bordo-backup-AAAA-MM-DD-HHMM.txt`, com a data e a hora de `agora()`.
- **Extensão e tipo `.txt` / `text/plain`.** O Chrome só deixa compartilhar arquivos de alguns tipos pelo menu do celular. Pela lista do código do Chromium (`share_service_impl.cc`), aceitam-se, entre outros, `.txt` e `text/plain`, mas **não** `.json` nem `application/json`: com `.json`, `navigator.canShare` devolveria falso e o COMPARTILHAR nunca apareceria. Por isso o arquivo sai como texto puro, com o JSON dentro. A restauração aceita `.txt` e `.json` (o que vale é o conteúdo, não a extensão). A lista foi lida em 23/10/2026 e pode mudar com versões do Chrome; o teste no celular está no roteiro.

**Entregar**

- COMPARTILHAR BACKUP (Web Share com arquivo, para WhatsApp, Drive ou e-mail) só aparece quando `navigator.canShare({ files })` aceita o arquivo; BAIXAR ARQUIVO está sempre disponível e é o botão principal quando não há menu de compartilhar. Gerar funciona sem internet; só o envio espera o sinal.
- O app não sabe se o envio terminou: só que o menu aceitou o arquivo ou que o download começou. A tela diz "arquivo gerado" e nunca "backup enviado". Compartilhamento cancelado não conta como backup.
- **Aviso de privacidade**, sempre junto dos botões de gerar: "Este arquivo contém os nomes dos passageiros. Trate como confidencial: envie só para você ou para quem for continuar a viagem, e apague depois. Observações e nomes de lugares que você digitou também podem conter nomes." Não há backup sem nomes na 10a (ver PENDENCIAS.md).

**Restaurar**

- Validação, nesta ordem, parando no primeiro problema, com mensagem em português: JSON; `app`; versão do formato; data de geração e integridade; estrutura, tipos e valores permitidos (enums); referências cruzadas (etapa → viagem, local → catálogo, evento, passageiro e trecho → etapa da própria viagem, plano original); identificadores únicos.
- Resumo antes de confirmar: data do backup; para cada viagem, nome, tipo, data, status, nº de registros, nº de passageiros e o último registro; totais de registros, passageiros, locais e modelos.
- **Juntar por viagem (padrão).** Uma lista com as viagens do arquivo, cada uma com checkbox. Cada viagem marcada substitui, inteira, a de mesmo id no celular (viagem, etapas, trechos, eventos e passageiros), nunca misturando registros, porque a `sequencia` dos eventos quebraria. As outras viagens do celular não mudam. A viagem vem **desmarcada** com o aviso "O celular tem N registros a mais; restaurar apaga esses registros" quando a do celular tem mais eventos ou uma sequência maior que a do arquivo. Locais: o do arquivo vence no mesmo id e os demais do celular ficam. Modelos: só entram os que o celular não tem (o modelo editado no celular fica). Consultas ao Google Maps das viagens restauradas são apagadas.
- **Substituir tudo (opção avançada).** Apaga o espaço real inteiro e grava o arquivo. Exige marcar "Entendo que o que está no celular será perdido" e confirmar uma segunda vez numa janela que diz quantas viagens e registros serão apagados.
- Tudo numa só transação do banco (tudo ou nada). Na mesma tela, antes de confirmar, GERAR BACKUP do que está no celular. Nunca roda na demonstração. A demonstração não tem backup (o espaço dela é recriado a cada entrada), e o botão BACKUP não aparece nela.
- Depois de restaurar, a tela principal mostra um cartão dispensável: "Restaurada do backup de DD/MM HH:MM. O que aconteceu depois não está aqui: registre pela timeline."
- **O que aconteceu entre o backup e a restauração** entra pelos botões de sempre, com as travas de sempre (testado):
  - parada não planejada aberta no backup continua aberta (com "onde" e tempo previsto); CHEGAMOS sem informar a volta é recusado, e "CHEGAMOS (sem registrar a volta antes)" ou o VOLTAMOS aceitam a hora real da volta, anterior a agora;
  - a etapa atual: CHEGAMOS e SAÍMOS gravam com o horário de agora e o horário do fato é corrigido na timeline (nunca antes da saída anterior nem depois de agora);
  - o registro esquecido (`pendenciasDeRegistro`) só aparece quando já existe um registro posterior fora de ordem, o que os botões não produzem; ao restaurar um arquivo assim, `registrarPendencia` aceita o horário digitado. A sequência de gravação continua a do arquivo, e o plano original não muda.
  - Saída gravada depois, pelo horário digitado, não tem conferência. Fica como já é: a tela mostra "sem conferência", sem marca nova na timeline.

**Último backup e lembrete**

- Tabela `meta` no banco (versão 5, só adiciona, como as versões 2 a 4), fora do backup: `ultimoBackup` (data do arquivo e total de registros que ele tinha), `restauradoDe` (data do arquivo, quando foi restaurado, viagens e se o aviso foi dispensado) e `silencioBackupAte`. Depois de restaurar, o último backup passa a ser a data do arquivo, a menos que fiquem no celular viagens com registros que o arquivo não tem. O `restauradoDe` fica à disposição do relatório da fase 10b.
- Ao tocar INICIAR VIAGEM: a janela "Fazer backup antes de iniciar?", com os botões de gerar e INICIAR SEM BACKUP (vira "Iniciar viagem" depois de gerar). Não bloqueia.
- Tela principal: linha discreta no fim, "Último backup: hoje 08:12 · 3 registros depois" (ou "nunca"; "ontem" ou DD/MM depois de um dia), em destaque quando passa de 4 h ou de 15 registros desde o último (`config.ts`). Toque abre a tela Backup.
- Sugestão (cartão, nunca janela) com FAZER BACKUP e AGORA NÃO (silencia por 2 h), só se o backup está defasado e só parado numa etapa ou logo depois de um SAÍMOS. Nunca durante a parada não planejada, nem logo depois de CHEGAMOS ou PARAMOS.

**Testes:** `backup.test.ts` no núcleo, nos dados e na lógica da interface, e o fluxo `e2e/fluxos/fase10a-backup.mjs`.

## Decisões do redesenho (interface, antes da fase 8)

Aprovadas em 23/10/2026. Só interface: nenhuma regra de cálculo, o núcleo e o banco não mudam. Onde as seções anteriores falam de botões da tela principal, valem as equivalências abaixo.

**Estrutura.** Cinco abas fixas embaixo: Viagem, Roteiro, Pessoas, Locais e Mais. Antes de iniciar, as mesmas abas valem para o planejamento: Viagem = dados, avisos e bloqueios (rodapé INICIAR VIAGEM), Roteiro = etapas e trechos, Pessoas = cadastro, Locais = catálogo, Mais = modelos, backup, modo noite, demonstração e excluir viagem. A lista de viagens fica fora das abas (Locais, Modelos, Backup e Demonstração por botões).

**Aba Viagem.** Cartão de destaque (chegada no destino, horário grande, "original HH:MM", selo de atraso e origem da previsão); cartão da situação (próxima parada com "falta X" e "Abrir no Maps", cronômetro "7 min para sair" ou "excedeu em X" com barra de progresso, ou a parada não planejada); cartões "A bordo" (ou "Esperados na saída") e "Último backup" (este não existe na demonstração); sugestão de backup. O rodapé fixo traz a ação principal (CHEGAMOS, SAÍMOS ou VOLTAMOS, ~68 px) e três ações rápidas: em viagem, PARAMOS, Previsão e Mensagem; parado, Quem desceu, Observação e Mensagem. "N alternativas · ver no Roteiro" usa N = alternativas além do local preferido. Viagem concluída: sem ação principal, com "Viagem encerrada" e o resumo original × real. Registro esquecido: o cartão "Falta um horário" substitui a ação principal.

**Equivalências.** GERAR ATUALIZAÇÃO = Mensagem (rodapé e Mais); ATUALIZAR PREVISÃO = Previsão (rodapé, em viagem) e Mais › Registros (quando vale, inclusive parado); OBSERVAÇÃO, REGISTRAR IMPREVISTO e PULAR ETAPA = Mais › Registros; PASSAGEIROS = aba Pessoas; Timeline = aba Roteiro, visão Timeline; VER ALTERNATIVAS = aba Roteiro, "Comparar e escolher"; ABRIR NO GOOGLE MAPS = "Abrir no Maps" no cartão da próxima parada e o link da folha de previsão; BACKUP = Mais › Backup e o cartão "Último backup". "CHEGAMOS (sem registrar a volta antes)" fica no cartão da parada não planejada.

**Barra compacta.** Nas abas Roteiro, Pessoas, Locais e Mais, uma barra de ~52 px acima das abas mostra a previsão do destino e a ação principal, para registrar sem voltar à aba Viagem. Some com a viagem concluída.

**Roteiro.** Visão "Paradas": lista vertical com marcador (feita, estamos aqui, próxima, adiante, pulada), horário real ou previsto em mono e o atraso; as alternativas da próxima parada flexível aparecem abertas, com classificação e margem, e levam à tela de alternativas. Visão "Timeline": a de sempre. "Mapa" desligado, com a dica "chega na fase 9".

**Locais.** Lista, novo, editar e excluir. A exclusão usa a trava do repositório (`LocalEmUso`): em uso, a tela diz em qual viagem e etapa o local está (preferido ou alternativa) e não exclui; livre, pede confirmação.

**Mais.** Três grupos: Comunicação (Mensagem de atualização com "última gerada às", Modelos), Registros (imprevisto, observação, atualizar previsão, pular etapa, Relatório desligado: "chega na fase 10b") e Dados e aparelho (Backup com o último, Modo noite, Trocar de viagem, Demonstração).

**Identidade e modo noite.** Tokens em `estilos.css` (ver CLAUDE.md). Noite automática das 18:00 (inclusive) às 06:00 (exclusive), pelo `agora()`, portanto também na demonstração; "Automático", "Sempre claro" ou "Sempre escuro" em Mais, guardado no `localStorage` (fora do banco e do backup). Cores de noite acrescentadas: destaque `#9CCB62`, perigo `#FF9A8F`, barra `#121B18`. O destaque `#5E8F2E` não vai em texto pequeno (3,9:1 sobre branco); o cabeçalho usa o fundo da tela para o ponto de "bordo." passar de 3:1. O `theme-color` do navegador acompanha o tema; o ícone do app não muda.

**Online.** O selo do topo mostra "Online" ou "Sem internet" por `navigator.onLine` e pelos eventos `online` e `offline`.

**Testes.** Fluxos e2e atualizados para a navegação nova e `e2e/fluxos/redesenho.mjs` (abas, ação principal por situação, barra compacta, locais, selo de rede, tamanhos mínimos e modo noite). Testes unitários: `tema.test.ts`, `usoDoLocal.test.ts` e a edição em `formLocal.test.ts`.


## Decisões da fase 8

Aprovadas em 23/10/2026, na construção das rotas automáticas e da busca de endereço. Tudo isso só no planejamento, com internet: na viagem nada depende de rede. Complementam as seções anteriores. Nenhuma regra de cálculo da previsão muda: a rota entra como a fonte "rota" que a seção "Regras de cálculo da previsão" já previa.

**Serviços** (limites e termos lidos em 23/10/2026; podem mudar)

| Uso | Serviço | Chave | Limite e termos |
| --- | --- | --- | --- |
| Rotas de carro | OSRM público do FOSSGIS, endpoint `routing.openstreetmap.de/routed-car` (perfil de carro) | Não | No máximo 1 requisição por segundo; uso razoável e não comercial; sem garantia de disponibilidade; o acesso pode ser retirado. |
| Busca de endereço | Photon (Komoot, dados do OpenStreetMap), `photon.komoot.io/api/` | Não | "Seja justo": uso excessivo é limitado, sem números; sem garantia de disponibilidade. |

- Os dois respondem com `access-control-allow-origin: *`: o navegador chama direto, sem backend e sem Netlify Function (custo zero, nenhuma chave no site público).
- **Plano B.** Se o OSRM cair, bloquear ou limitar: (1) no próprio app, o trecho fica "sem tempo" e a duração é digitada (fonte manual), como já prevê a seção "Rotas automáticas e fallback"; (2) se a queda for duradoura, trocar para o OpenRouteService com cadastro gratuito (2.000 rotas e 1.000 buscas por dia no plano padrão; exige chave, então com uma Netlify Function de repasse e a chave numa variável de ambiente do Netlify, nunca no repositório). Isso não foi construído: o cliente de rotas fica isolado em `src/servicos/` para a troca mexer num arquivo. O endereço alternativo `router.project-osrm.org` não conta como reserva: respondeu igual, byte a byte, ao do FOSSGIS.
- **Uso pessoal.** O app é de uso pessoal e o volume é mínimo (cerca de 30 requisições por planejamento). Os termos dizem "não comercial": **se o app passar a ser ferramenta oficial da empresa, o serviço de rotas deve ser revisto** (servidor próprio ou plano pago).
- Atribuição: a tela mostra "dados do OpenStreetMap" junto da busca e dos tempos pela rota.
- **Privacidade (LGPD).** Vão para a rede apenas o texto digitado na busca e as coordenadas dos locais. Nada de passageiros. A dica do campo de busca diz: "Nome ou endereço do estabelecimento. Não digite nomes de pessoas nem endereços residenciais." Sem cookies (`credentials: omit`). A busca só dispara no botão ou no Enter, nunca a cada tecla.

**Busca de endereço (cadastro de local)**

- Campo "Buscar endereço ou nome do lugar", com até 5 resultados (nome, cidade e estado). Ao escolher, preenche coordenadas e cidade; os dois continuam editáveis, e o nome e o resto do formulário não mudam. A cidade vem de `city`; para uma cidade, o próprio nome; senão, município ou bairro; sem nenhum, a cidade digitada fica como está. O campo de coordenadas coladas (texto ou link do Google Maps) continua funcionando.
- Sem internet, a busca avisa antes de tentar e o resto do formulário funciona. Falha do serviço, limite excedido, tempo esgotado (10 s) e "nada encontrado" têm mensagem própria.

**Calcular tempos (aba Roteiro do planejamento)**

- Calcula todos os pares de locais candidatos entre etapas vizinhas (trechos e pares das alternativas) com coordenadas nos dois locais, **inclusive os que já têm tempo de roteiro**: o roteiro continua valendo primeiro, e a rota fica guardada só para exibir e calibrar. Pares de um local com ele mesmo não são calculados.
- Em sequência, com 1,1 s entre as requisições (o serviço pede no máximo 1 por segundo) e botão Cancelar. Cada rota é gravada assim que chega: o que já foi calculado não se perde. Guarda duração de carro, distância (km, uma casa) e a data do cálculo (`agora()`).
- **Arredondamento:** o tempo de carro, em segundos, é arredondado para **cima**, para o minuto; depois vale a regra de sempre (× fator ônibus, para cima).
- **Falhas.** Sem internet, limite excedido (429), servidor fora ou tempo esgotado: o lote **para na primeira falha, sem insistir**, avisa quantos trechos ficaram sem calcular e mantém tudo o que já estava guardado. Resposta vazia, inválida ou "sem caminho" (`NoRoute`) de um par marca só aquele par ("Sem rota encontrada: A → B") e o lote continua. O tempo nunca é inventado; sem rota, o trecho fica "sem tempo" e pode ser digitado.
- **Sem coordenadas:** o trecho fica como está, com a dica "Sem coordenadas em X: cadastre em Locais para calcular a rota", e o cartão da aba lista os locais com atalho para editá-los.
- **Fonte à vista.** Cada tempo mostra a fonte e, quando há rota, o tempo de carro, o fator, a distância e quando foi calculado ("carro 1h40 × fator 1,15 · 90 km · calculado em 23/10 às 15:30"). Num trecho com tempo de roteiro e rota: "roteiro 1h55 · carro 1h40 · fator implícito 1,15" (fator implícito = tempo do roteiro ÷ tempo de carro).

**Manual × rota**

- Tempo digitado à mão (fonte manual) **nunca é sobrescrito**. Calcular guarda a rota ao lado dele, no campo `rota` do trecho (duração de carro, distância e data); o cálculo da previsão continua usando só o manual. Digitar um tempo sobre um trecho de rota também guarda a rota ao lado.
- A diferença é **grande** quando manual − (rota × fator ônibus) passa, em módulo, de **15 min ou mais e 15% ou mais** da rota × fator (`rotaDiferencaGrandeMin` e `rotaDiferencaGrandePct`, em `config.ts`). Então a tela mostra os dois tempos ("Seu tempo 3h40 · rota 2h18 (diferença +1h22)") e deixa escolher: **Usar a rota** (o trecho vira rota e o tempo digitado deixa de existir) ou **Manter o meu** (fica o manual e a rota guardada ao lado é descartada; um novo cálculo pode propô-la de novo). Diferença pequena só mostra a rota, sem pedir escolha. O bloco "Tempos das alternativas" abre sozinho enquanto houver escolha pendente.
- O campo `rota` é opcional e aditivo: o backup aceita (formato 1, sem mudança) e versões antigas o ignoram.

**Fator ônibus**

- Campo "Fator ônibus" em "Dados da viagem" (aba Viagem), **editável só no planejamento** (na viagem, mudá-lo alteraria a previsão em silêncio) e de **1,00 a 2,00** (`fatorOnibusMin` e `fatorOnibusMax`, em `config.ts`). Padrão 1,15, duas casas. Mostra um exemplo ("2h00 de carro → 2h24 de ônibus").
- **Sugestão para calibrar:** a média dos fatores implícitos dos trechos que têm tempo de roteiro e rota calculada, mostrada sob o campo ("Sugestão pelo roteiro: 1,20, média de 5 trechos"). Só é aplicada quando a pessoa toca em "Usar 1,20".

**Testes.** Núcleo (`fase8-rotas.test.ts`: leitura das respostas, pares, rota ao lado do manual, comparação, fator, backup), serviços com respostas simuladas e sem rede (`src/servicos/__tests__`: sucesso, limite 429, servidor fora, sem internet, tempo esgotado, resposta vazia e inválida, "sem caminho", lote com parada e cancelamento), dados (`fase8-rotas.test.ts` em `src/data`), texto da interface (`trechoDescricao.test.ts`, `formLocal.test.ts`) e o fluxo `e2e/fluxos/fase8-rotas.mjs`, com os dois serviços simulados.

## Correções dos testes no celular

Aprovadas em 25/10/2026, depois de uma viagem curta urbana testada no celular (Ipatinga, cerca de 20 min). Nenhuma regra de cálculo muda, salvo o que está dito no item 1.

**Trocar de viagem.** Cada troca de aba entra no histórico do navegador; "voltar uma entrada" só voltava à aba anterior. "Trocar de viagem" e o "Voltar às viagens" do cabeçalho (planejamento e viagem, em qualquer status) agora voltam à lista de viagens pulando as abas empilhadas. O botão voltar do Android continua passo a passo. Teste: `e2e/fluxos/correcoes-celular.mjs`.

**Viagem encerrada, "A bordo".** O cartão (aba Viagem e aba Pessoas) deixa de mostrar "—": passa a se chamar "Chegaram" e mostra quantos passageiros chegaram ao destino ("38 passageiros"). Conta, pelo que foi registrado, quem embarcou antes do destino e não desceu, não deixou de embarcar nem saiu da viagem (a mesma regra de quem está em trânsito para uma etapa, aplicada ao destino). Não é uma contagem feita no destino. Sem passageiros cadastrados, continua "Sem passageiros cadastrados". A variável `{passageiros}` da mensagem continua vazia ao chegar.
