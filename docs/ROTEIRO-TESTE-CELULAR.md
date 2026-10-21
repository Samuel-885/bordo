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
