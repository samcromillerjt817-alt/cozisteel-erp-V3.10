'use client'

import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { AsyncButton } from '@/components/domain/async-button'
import { CnpjInput } from '@/components/form/cnpj-input'
import { CepInput } from '@/components/form/cep-input'
import { PhoneInput } from '@/components/form/phone-input'
import { EmailInput } from '@/components/form/email-input'
import { fetchCompanyByCnpj, fetchAddressByCep, maskCep, maskPhone } from '@/lib/masks'
import { PageHeader } from '@/components/platform/page-header'
import { useSettings } from './use-settings'

/**
 * Aba "Empresa" de Configurações — formulário simples, sem tabela (Subetapa 11.5.9).
 *
 * Achado corrigido (reforma dos PDFs): este formulário gravava em chaves `supplier.*` que nenhum PDF
 * jamais lia — `pdf.service.ts::getCompanyInfo()` sempre leu o grupo `company.*` (só populado pelo seed
 * inicial, sem tela pra editar). Os campos abaixo agora escrevem DIRETO nas chaves `company.*` que os
 * PDFs já consomem — editar aqui passa a ter efeito real nos documentos gerados. `headerTitle` (campo
 * antigo, nunca lido em lugar nenhum) foi removido em vez de mantido como promessa vazia; "Nome
 * Fantasia" (`company.tradeName`) foi adicionado — os PDFs já distinguem razão social de nome
 * fantasia, mas a tela só tinha um campo.
 */
export function EmpresaTab() {
  const { settings, setSettings, loading, saving, save } = useSettings()

  return (
    <div className="space-y-4">
      <PageHeader title="Dados da Empresa" description="Estes dados aparecem nos PDFs de Orçamento, Pedidos e demais documentos gerados pelo sistema." />
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : (
        <>
          <Card><CardContent className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1.5"><Label>Razão Social</Label><Input value={settings['company.name'] || ''} onChange={(e) => setSettings({ ...settings, 'company.name': e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Nome Fantasia</Label><Input value={settings['company.tradeName'] || ''} onChange={(e) => setSettings({ ...settings, 'company.tradeName': e.target.value })} /></div>
              <div className="space-y-1.5">
                <Label>CNPJ</Label>
                <CnpjInput
                  value={settings['company.cnpj'] || ''}
                  onChange={(v) => setSettings({ ...settings, 'company.cnpj': v })}
                  onLookup={async (cnpj) => {
                    toast.info('Buscando dados do CNPJ...')
                    const data = await fetchCompanyByCnpj(cnpj)
                    if (!data) {
                      toast.error('CNPJ não encontrado ou API indisponível')
                      return
                    }
                    setSettings((prev) => ({
                      ...prev,
                      'company.name': data.razao_social || prev['company.name'],
                      'company.tradeName': data.nome_fantasia || prev['company.tradeName'],
                      'company.address': `${data.logradouro || ''}${data.numero ? `, ${data.numero}` : ''}`.trim() || prev['company.address'],
                      'company.neighborhood': data.bairro || prev['company.neighborhood'],
                      'city.state': data.municipio && data.uf ? `${data.municipio}/${data.uf}` : prev['city.state'],
                      'company.cep': data.cep ? maskCep(data.cep) : prev['company.cep'],
                      'company.phone': data.ddd_telefone_1 ? maskPhone(data.ddd_telefone_1) : prev['company.phone'],
                      'company.email': data.email || prev['company.email'],
                    }))
                    toast.success('Dados preenchidos a partir do CNPJ!')
                  }}
                />
              </div>
              <div className="space-y-1.5"><Label>Inscrição Estadual</Label><Input value={settings['company.ie'] || ''} onChange={(e) => setSettings({ ...settings, 'company.ie': e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Inscrição Municipal</Label><Input value={settings['company.im'] || ''} onChange={(e) => setSettings({ ...settings, 'company.im': e.target.value })} /></div>
              <div className="space-y-1 sm:col-span-2"><Label>Endereço</Label><Input value={settings['company.address'] || ''} onChange={(e) => setSettings({ ...settings, 'company.address': e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Bairro</Label><Input value={settings['company.neighborhood'] || ''} onChange={(e) => setSettings({ ...settings, 'company.neighborhood': e.target.value })} /></div>
              <div className="space-y-1.5">
                <Label>CEP</Label>
                <CepInput
                  value={settings['company.cep'] || ''}
                  onChange={(v) => setSettings({ ...settings, 'company.cep': v })}
                  onLookup={async (cep) => {
                    const addr = await fetchAddressByCep(cep)
                    if (!addr) return
                    setSettings((prev) => ({
                      ...prev,
                      'company.address': addr.logradouro || prev['company.address'],
                      'company.neighborhood': addr.bairro || prev['company.neighborhood'],
                      'city.state': addr.localidade && addr.uf ? `${addr.localidade}/${addr.uf}` : prev['city.state'],
                    }))
                  }}
                />
              </div>
              <div className="space-y-1.5"><Label>Cidade / UF</Label><Input value={settings['city.state'] || ''} onChange={(e) => setSettings({ ...settings, 'city.state': e.target.value })} /></div>
              <div className="space-y-1.5">
                <Label>Telefone</Label>
                <PhoneInput value={settings['company.phone'] || ''} onChange={(v) => setSettings({ ...settings, 'company.phone': v })} />
              </div>
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <EmailInput value={settings['company.email'] || ''} onChange={(v) => setSettings({ ...settings, 'company.email': v })} />
              </div>
              <div className="space-y-1.5"><Label>Contato</Label><Input value={settings['company.contact'] || ''} onChange={(e) => setSettings({ ...settings, 'company.contact': e.target.value })} /></div>
              <div className="space-y-1 sm:col-span-2"><Label>Dados Bancários</Label><Textarea rows={3} value={settings['company.bankData'] || ''} onChange={(e) => setSettings({ ...settings, 'company.bankData': e.target.value })} /></div>
            </div>
          </CardContent></Card>
          <div className="flex justify-end">
            <AsyncButton onClick={save} loading={saving}>Salvar Configurações</AsyncButton>
          </div>
        </>
      )}
    </div>
  )
}
