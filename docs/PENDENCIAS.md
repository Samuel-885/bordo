# Pendências entre fases

- **Fase 10:** o registro esquecido (`pendenciasDeRegistro`) segue ligado na tela principal, mas nem os botões da fase 4 nem a conferência da fase 5 produzem essa situação: a conferência faz parte do SAÍMOS e só existe junto com ele, e uma saída gravada sem conferência não é pendência (a tela mostra "sem conferência"). Ela só aparece com evento fora da ordem, por exemplo ao restaurar um backup. Na restauração, decidir se uma saída sem conferência deve aparecer marcada na timeline.
- **Fase 10:** "Apagar passageiros" ao fim da viagem. A fase 5 não deixa excluir passageiro de viagem concluída nem de quem já passou por conferência; o apagamento em massa precisa manter as contagens no relatório.
- **Fase 10:** o backup deve incluir a tabela `modelos` (modelos de mensagem da fase 7), ao contrário das consultas ao Google Maps.
- **Fase 10:** o relatório inclui as observações livres (eventos `observacao`, texto em `dados.texto`) e as atualizações geradas (horário e previsão informada), para mostrar o que foi comunicado e quando.
