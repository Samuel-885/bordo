# Roteiro de teste no celular (deploy do Netlify)

Use o endereço do site publicado no Netlify (cada push na `main` publica). Não use a porta do Codespaces.

1. **Primeira visita, com internet.** Abra o endereço do site no Chrome (Android) ou no Safari (iPhone) e espere a lista de viagens aparecer. Deixe a página aberta uns 10 segundos: é quando o app guarda tudo para uso sem internet.
2. **Instalar.** Android: menu ⋮ → "Instalar app" (ou "Adicionar à tela inicial"). iPhone: Compartilhar → "Adicionar à Tela de Início". Confira o nome "Bordo" e o ícone.
3. **Testar sem internet.** Ligue o modo avião, feche o app e abra pelo ícone. A lista deve abrir, com as fontes IBM Plex.
4. **Demonstração sem internet.** Toque em "Abrir a demonstração" → "Iniciar viagem" → confirme. Na faixa amarela, toque em "Controles", escolha o cenário "Saída atrasada" e use "Próximo passo". Confira o atraso de +17 min.
5. **Registrar.** No modo livre, use +60 min e CHEGAMOS. Aparece o aviso com DESFAZER por 8 segundos. Toque em DESFAZER e confira que voltou a "Em viagem".
6. **Timeline.** Toque em "Timeline", em uma chegada, e tente um horário anterior à saída: a tela mostra a trava.
7. **Botão voltar.** O botão voltar do Android deve ir da timeline para a tela principal e dela para a lista, sem fechar o app.
8. **Versão nova.** Depois de um novo push, abra o app com internet: deve aparecer "Nova versão do Bordo". Toque em "Atualizar" para trocar.
9. **Atualização do banco (fase 5).** Em um celular que já tem viagens salvas, abra o app depois do deploy: as viagens, os locais e a timeline devem estar como antes, e "Passageiros" deve abrir vazio.
10. **Conferência.** Na demonstração, "Iniciar viagem" → SAÍMOS. Confira o quadro "ATENÇÃO 0/35", digite 35 na contagem rápida e toque em "Conferir" (vira "TODOS A BORDO"). Toque em SAÍMOS e confira "35/35 a bordo · conferido às HH:MM" na tela principal e a conferência na timeline.
11. **Sair sem todos.** Em outra saída, desmarque um nome, toque em "Sair sem todos", escolha o status, escreva o motivo e confirme. A timeline mostra o nome e o motivo.
12. **Tela acesa.** Durante a conferência, deixe o celular parado por mais que o tempo da tela: ela não deve apagar (no iPhone e em alguns Androids com economia de bateria o navegador pode não permitir).
13. **Voltar durante a conferência.** O botão voltar do Android fecha a conferência e volta à tela principal, sem registrar nada.
14. **App aberto em dois lugares.** Com o app instalado aberto, abra o site também no navegador e, depois de um deploy com mudança de banco, abra uma das duas: a outra mostra "O Bordo foi atualizado. Toque para recarregar." e, ao tocar, volta a funcionar.
15. **Quem desceu.** Na demonstração, depois do SAÍMOS, toque em PARAMOS → "Registrar parada". A folha "Quem desceu?" abre sozinha: toque em "Escolher nomes", marque dois e "Salvar". O cartão mostra "Desceram: 2". Toque em "Marcar quem desceu", escolha "Todos" e depois DESFAZER: volta a "Desceram: 2".
16. **Conferência com marcação.** Toque em VOLTAMOS: a conferência abre com só os dois marcados pendentes e o aviso "2 desceram, 33 ficaram no ônibus. Se tiver dúvida, use a contagem rápida." Toque no modo já selecionado: nada muda. Troque para o outro modo: a lista reinicia e o aviso some.
17. **Refeição.** Ao registrar CHEGAMOS numa refeição (almoço, café, jantar), a folha "Quem desceu?" não abre sozinha; o botão "Marcar quem desceu" no cartão do cronômetro continua disponível.
