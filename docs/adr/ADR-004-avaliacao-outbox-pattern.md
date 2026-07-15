# ADR-004 — Avaliação do Outbox Pattern (não implementado)

- **Status**: Aceito como avaliação — nenhuma implementação decorre deste documento
- **Data**: 2026-07-09
- **Depende de**: [ADR-003 — Eventos de Domínio](./ADR-003-eventos-de-dominio.md)

## Contexto

A Fase 3 implementou um `DomainEventBus` em processo, síncrono, sem persistência (ver ADR-003). Antes de
avançar para uma nova fase grande, o usuário pediu uma avaliação explícita de quando o Outbox Pattern
(ou equivalente) se torna necessário — **sem implementar nada agora**. Este documento existe para que essa
decisão, quando chegar a hora, não seja tomada às pressas.

## O que é o Outbox Pattern (para referência)

Escrever a mudança de estado do agregado E um registro do evento a ser publicado **na mesma transação de
banco de dados**. Um processo separado (relay/worker) lê essa tabela de outbox e entrega os eventos a
quem consome (fila externa, outro serviço, etc.), com retentativa e garantia de "pelo menos uma entrega"
mesmo se o processo original cair logo depois do commit.

## Riscos reais do barramento síncrono em memória de hoje

1. **Sem atomicidade entre o gatilho e o handler.** Em `QuoteService.changeStatus`, o `UPDATE` do status
   do Orçamento já commita antes de `domainEvents.publish()` rodar. Se o handler (ex:
   `productionOrderService.createFromApprovedQuote`) falhar, o Orçamento fica `approved` sem a Ordem de
   Produção correspondente — sinalizado só pelo erro 500 da requisição. **Importante**: essa característica
   já existia antes da Fase 3 (a chamada direta Service-a-Service tinha exatamente o mesmo comportamento —
   não é uma regressão introduzida pelos eventos, é inerente a não ter uma transação compartilhada entre
   os dois agregados).
2. **Sem persistência do evento em si.** Se o processo Node cair entre o commit do agregado de origem e a
   conclusão do handler, o fato "isso deveria ter acontecido" não fica registrado em lugar nenhum — não há
   como saber depois que um evento deveria ter sido processado e não foi.
3. **Sem retentativa automática.** Se um handler falhar por um erro transitório (ex: um futuro handler
   que chama uma API externa e a rede cai por um instante), a falha propaga pro chamador original e vira
   erro 500 pro usuário — não existe fila de reprocessamento.
4. **Sem garantia entre processos.** O singleton do barramento vive em `globalThis` de um único processo
   Node (ver achado da Fase 3 sobre duplicação entre layers do bundler). **Confirmado nesta avaliação**:
   `ecosystem.config.cjs` roda a aplicação como instância única do PM2 (sem `instances`/`exec_mode:
   'cluster'`) — hoje isso não é um risco na prática. **Vira um risco automaticamente** se o PM2 for
   configurado em modo cluster no futuro: um evento publicado no processo A nunca seria visto por um
   handler registrado só no processo B.

## Quando a persistência passa a ser realmente necessária

Não antes de pelo menos uma destas condições aparecer:

- **Um handler com efeito colateral irreversível ou externo** (ex: chamar um gateway de pagamento, uma
  API de terceiro, ou o futuro módulo Financeiro da Fase 12 registrando um título) — perder esse evento
  silenciosamente deixa de ser aceitável.
- **Escalonamento horizontal** — a aplicação passar a rodar em mais de um processo/instância
  simultaneamente (PM2 cluster mode, ou múltiplos containers).
- **Exigência de auditoria "pelo menos uma vez"** — algum evento precisar da garantia formal de que foi
  processado, não só "foi processado se nada deu errado no meio do caminho".
- **Handlers lentos o suficiente para importar latência da resposta** — hoje tudo é síncrono e rápido
  (chamadas de Repository locais); se um handler futuro fizer algo lento (chamada de rede, processamento
  pesado), bloquear a resposta HTTP nesse handler deixa de fazer sentido.

Nenhuma dessas condições existe hoje nos 3 fluxos migrados nem nos 4 eventos emitidos sem consumidor.

## Impacto esperado de uma fila externa futura (não implementado)

Se/quando uma das condições acima se concretizar:

- Uma tabela de outbox (ou usar `StockMovement`/`AuditLog` como inspiração de padrão já existente no
  projeto) precisaria ser criada, com o evento serializado e um status de entrega.
- Um processo relay (worker separado, ou um job dentro do próprio processo lendo a tabela periodicamente)
  precisaria existir.
- Consumidores precisariam ser **idempotentes** — filas externas tipicamente garantem "pelo menos uma
  entrega", nunca exatamente uma; os handlers de hoje (`createFromApprovedQuote`, `createFromQuote`,
  `createFromRequisition`) **não são idempotentes hoje** (rodar duas vezes cria OP/Pedido de Venda/Pedido
  de Compra duplicado) — isso precisaria ser resolvido junto, não depois.
- Monitoramento e uma fila de "mortos" (dead-letter) para eventos que falharem todas as retentativas.

## Decisão

**Não implementar o Outbox Pattern nesta fase.** O barramento síncrono em memória continua adequado
enquanto: a aplicação rodar como processo único, nenhum handler tiver efeito externo/irreversível, e a
falha de um handler puder legitimamente ser tratada como falha da requisição que a originou (o
comportamento atual, herdado de quando essas eram chamadas diretas). Reavaliar quando qualquer uma das
condições da seção anterior deixar de ser verdade — mais provavelmente quando a Fase 12 (Financeiro)
começar a consumir eventos de verdade.
