export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerDomainEventHandlers } = await import('@/lib/register-domain-event-handlers')
    registerDomainEventHandlers()
  }
}
