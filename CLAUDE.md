# Bordo

PWA para acompanhar viagens de ônibus da empresa (Ipatinga/MG → Ribeirão Preto/SP, ida e volta). Usado por uma pessoa, no celular, dentro do ônibus, muitas vezes sem internet.

A especificação completa está em `docs/ESPECIFICACAO.md` e é a fonte da verdade. Se o código divergir dela, vale a especificação. Se algo não estiver claro ou faltar, pergunte antes de decidir. Não invente regra.

## Stack

- React + TypeScript (strict) + Vite, versões estáveis atuais
- Testes: Vitest
- Persistência: IndexedDB via Dexie (a partir da fase 3)
- PWA: vite-plugin-pwa (fase 4)
- Mapa: Leaflet + tiles do OpenStreetMap (fase 9)
- Deploy: Netlify, site estático (`npm run build`, pasta `dist`)
- Ambiente de desenvolvimento: GitHub Codespaces. O servidor de dev escuta em `0.0.0.0` (`vite --host`) para a porta ser encaminhada.

## Regras inegociáveis

1. **Nunca inventar tempo.** Todo trecho tem fonte (`roteiro`, `rota`, `manual`, `estimado`). Sem fonte, é "sem tempo definido". Nunca usar distância em linha reta como tempo. Nunca dados fictícios fora do modo demonstração.
2. **Plano original congelado** ao iniciar a viagem. Nada o altera depois.
3. **Recálculo 100% local**, sem rede.
4. **Relógio único:** todo horário atual vem de `agora()` em `src/core/relogio.ts`. Proibido `Date.now()` ou `new Date()` sem argumento fora desse arquivo.
5. **Horários sempre ISO completo com fuso** (`-03:00`), nunca só "HH:MM".
6. **Atraso = horário (real ou previsto) − original do mesmo evento.** Nunca soma de diferenças.
7. **Custo zero:** sem backend, sem API paga, sem chave com cobrança.
8. **Sem IA dentro do app.**
9. **Privacidade (LGPD):** passageiro tem só nome, embarque e desembarque. Dados ficam só no aparelho. Mensagens geradas nunca levam nomes. Nunca colocar dados pessoais reais em código, testes, fixtures ou commits: use nomes fictícios.

## Arquitetura

- `src/core/`: lógica pura. Sem React, sem IndexedDB, sem rede. Funções determinísticas do tipo `(plano, eventos, agora) → estado`.
- `src/core/__tests__/`: um teste para cada caso da seção "Casos de teste do recálculo" da especificação, com o número do caso no nome.
- `src/core/config.ts`: valores ajustáveis da seção "Decisões em aberto" (tolerância 5 min, margem 15 min, fator ônibus 1,15).
- `src/data/`: persistência. Guarda plano e eventos; estado derivado nunca é persistido. Exceções: a tabela `consultas` (consultas ao Google Maps da fase 6), que não é fato da viagem nem estado derivado, vale por pouco tempo e fica fora do backup; e a tabela `modelos` (modelos de mensagem da fase 7), configuração do app que entra no backup.
- `src/ui/`: telas. Nenhuma regra de negócio na UI: ela chama o core.

## Fluxo de trabalho

- Uma fase por vez, na ordem abaixo. Não adiante funcionalidades de fases futuras.
- Comece cada fase apresentando um plano e espere aprovação antes de escrever código.
- Uma fase só termina com `npm test` e `npm run build` passando, sem erros de TypeScript.
- Nunca faça push sem antes rodar `npm test` e `npm run build` com sucesso, nesta ordem, inclusive em correções pequenas.
- Commits pequenos e frequentes, mensagens em português.

## Fases

1. Núcleo de cálculo e testes (sem UI)
2. Modo demonstração com relógio simulado
3. Planejamento (viagem, etapas, locais) com persistência
4. Tela principal (CHEGAMOS, SAÍMOS, cronômetro, timeline) e PWA instalável offline
5. Passageiros e conferência
6. Alternativas e viabilidade
7. Mensagem de atualização (copiar e compartilhar)
8. Rotas automáticas com fallback
9. Mapa
10. Relatório, feedback, volta, backup

## Interface

- Mobile first (~390 px de largura), textos em pt-BR, alvos de toque de pelo menos 44 px.
- Nada de dashboards ou excesso de cards. A tela principal responde em segundos: onde estamos, próxima etapa, quanto falta, previsão, atraso, todos a bordo.
- Visual do protótipo validado: fundo cinza claro, cartões brancos, cabeçalho escuro, azul `#1E4FD8` para a ação principal, amarelo com borda âmbar para atenção, IBM Plex Sans no texto e IBM Plex Mono nos horários.
