# Pendências entre fases

- **Fase 5:** a conferência intercepta o SAÍMOS (`aoSair` em `src/ui/TelaViagem.tsx` hoje grava a saída direto), a tela principal ganha "a bordo", e a timeline passa a mostrar os eventos de passageiro e conferência com nomes. O aviso "nenhum passageiro cadastrado" do início da viagem também entra na fase 5.
- **Fase 5:** o registro esquecido (`pendenciasDeRegistro`) está ligado na tela principal, mas os botões da fase 4 não produzem essa situação (CHEGAMOS e SAÍMOS só valem na ordem certa). Ela aparece se um evento vier fora da ordem (por exemplo, restauração de backup, fase 10). Revisitar quando houver conferência.
- **Fase 6:** incluir a entrada manual de duração dos trechos das alternativas. Na fase 3, o trecho manual só existe entre os locais preferidos; os pares com alternativas ficam "sem tempo" até lá (ou até as rotas automáticas da fase 8). A troca de local pela tela principal também é da fase 6 (hoje só os cenários da demonstração gravam esse evento).
- **Fase 4 (fechamento):** o ícone do app (`public/icons/`) aguarda a aprovação do desenho antes de entrar no repositório.
