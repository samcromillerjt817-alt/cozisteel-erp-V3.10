import { describe, it, expect, vi } from 'vitest'

 
type EventHandler<T = any, R = any> = (payload: T) => Promise<R> | R

class DomainEventBus {
   
  private handlers = new Map<string, EventHandler<any, any>[]>()

  on<T, R = unknown>(eventName: string, handler: EventHandler<T, R>): void {
    const list = this.handlers.get(eventName) || []
    list.push(handler)
    this.handlers.set(eventName, list)
  }

  async publish<T, R = unknown>(eventName: string, payload: T): Promise<R[]> {
    const list = (this.handlers.get(eventName) || []) as EventHandler<T, R>[]
    const results: R[] = []
    for (const handler of list) {
      results.push(await handler(payload))
    }
    return results
  }
}

/**
 * Testa a MECÂNICA do barramento isoladamente (sem `globalThis`, sem Next.js) — reimplementa
 * a mesma classe de `src/lib/domain-events.ts` porque importar o módulo real traria consigo o
 * singleton em `globalThis` e o registro de handlers de produção, o que non é o propósito de
 * um teste unitário do mecanismo. Os testes de integração (`tests/domain-events-flows.test.ts`)
 * cobrem o módulo real, com o singleton real.
 */
describe('DomainEventBus (mecânica isolada)', () => {
  it('publica um evento sem handler registrado e retorna array vazio', async () => {
    const bus = new DomainEventBus()
    const results = await bus.publish('evento.sem.handler', { x: 1 })
    expect(results).toEqual([])
  })

  it('entrega o payload exato para o handler registrado', async () => {
    const bus = new DomainEventBus()
    const received: unknown[] = []
    bus.on('evento.teste', (payload) => {
      received.push(payload)
    })

    await bus.publish('evento.teste', { quoteId: 'abc', total: 100 })

    expect(received).toEqual([{ quoteId: 'abc', total: 100 }])
  })

  it('aguarda cada handler em sequência (ordem de registro) antes de resolver publish()', async () => {
    const bus = new DomainEventBus()
    const order: string[] = []

    bus.on('evento.sequencial', async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
      order.push('primeiro')
    })
    bus.on('evento.sequencial', async () => {
      order.push('segundo')
    })

    await bus.publish('evento.sequencial', {})

    expect(order).toEqual(['primeiro', 'segundo'])
  })

  it('publish() retorna um array com o valor de retorno de cada handler', async () => {
    const bus = new DomainEventBus()
    bus.on('evento.com.retorno', () => ({ id: 1 }))
    bus.on('evento.com.retorno', () => ({ id: 2 }))

    const results = await bus.publish<unknown, { id: number }>('evento.com.retorno', {})

    expect(results).toEqual([{ id: 1 }, { id: 2 }])
  })

  it('propaga o erro do handler para quem chamou publish() — mesma semântica de uma chamada direta', async () => {
    const bus = new DomainEventBus()
    bus.on('evento.com.erro', () => {
      throw new Error('falha no handler')
    })

    await expect(bus.publish('evento.com.erro', {})).rejects.toThrow('falha no handler')
  })

  it('handlers de eventos diferentes não se veem entre si', async () => {
    const bus = new DomainEventBus()
    const handlerA = vi.fn()
    const handlerB = vi.fn()
    bus.on('evento.a', handlerA)
    bus.on('evento.b', handlerB)

    await bus.publish('evento.a', { marca: 'a' })

    expect(handlerA).toHaveBeenCalledTimes(1)
    expect(handlerB).not.toHaveBeenCalled()
  })
})
