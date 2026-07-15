import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CnpjInput } from '@/components/form/cnpj-input'
import { CepInput } from '@/components/form/cep-input'
import { EmailInput } from '@/components/form/email-input'
import { PhoneInput } from '@/components/form/phone-input'
import { handleCnpjLookup, handleCepLookup } from '@/lib/cnpj-cep-lookup'
import { toast } from 'sonner'
import type { ClientFormData } from './types'

interface ClienteFormFieldsProps {
  form: ClientFormData
  onChange: (form: ClientFormData) => void
}

// Grade de campos do formulário de Cliente — específico do domínio (não nasce em `platform`: os
// campos de Cliente/Fornecedor são parecidos mas não idênticos, então cada um mantém sua própria
// grade; se uma 3ª entidade repetir exatamente este conjunto de campos no futuro, aí sim vira
// candidato a extração para `platform`). Mesmos campos expostos antes da migração — nenhum campo novo.
export function ClienteFormFields({ form, onChange }: ClienteFormFieldsProps) {
  const set = <K extends keyof ClientFormData>(key: K, value: ClientFormData[K]) => onChange({ ...form, [key]: value })

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
      <div className="space-y-1.5"><Label>Razão Social</Label><Input value={form.corporateName} onChange={(e) => set('corporateName', e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Nome Fantasia</Label><Input value={form.tradeName} onChange={(e) => set('tradeName', e.target.value)} /></div>
      <div className="space-y-1.5">
        <Label>CNPJ / CPF</Label>
        <CnpjInput
          value={form.cpfCnpj}
          onChange={(v) => set('cpfCnpj', v)}
          onLookup={(cnpj) =>
            handleCnpjLookup<ClientFormData>(
              cnpj,
              (updater) => onChange(updater(form)),
              { corporateName: 'corporateName', tradeName: 'tradeName', address: 'address', neighborhood: 'neighborhood', city: 'city', state: 'state', zipCode: 'zipCode', phone: 'phone', email: 'email', situacaoCadastral: 'situacaoCadastral', cnaeCode: 'cnaeCode', cnaeDescription: 'cnaeDescription' },
              toast
            )
          }
        />
      </div>
      <div className="space-y-1.5"><Label>Inscrição Estadual</Label><Input value={form.ie} onChange={(e) => set('ie', e.target.value)} /></div>
      <div className="space-y-1.5"><Label>E-mail</Label><EmailInput value={form.email} onChange={(v) => set('email', v)} /></div>
      <div className="space-y-1.5"><Label>Telefone</Label><PhoneInput value={form.phone} onChange={(v) => set('phone', v)} /></div>
      <div className="space-y-1.5"><Label>Contato</Label><Input value={form.contactName} onChange={(e) => set('contactName', e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Telefone Contato</Label><PhoneInput value={form.contactPhone} onChange={(v) => set('contactPhone', v)} /></div>
      <div className="space-y-1.5">
        <Label>CEP</Label>
        <CepInput value={form.zipCode} onChange={(v) => set('zipCode', v)} onLookup={(cep) => handleCepLookup<ClientFormData>(cep, (updater) => onChange(updater(form)))} />
      </div>
      <div className="space-y-1 sm:col-span-2"><Label>Endereço</Label><Input value={form.address} onChange={(e) => set('address', e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Bairro</Label><Input value={form.neighborhood} onChange={(e) => set('neighborhood', e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Cidade</Label><Input value={form.city} onChange={(e) => set('city', e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Estado</Label><Input value={form.state} onChange={(e) => set('state', e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Situação Cadastral</Label><Input value={form.situacaoCadastral} onChange={(e) => set('situacaoCadastral', e.target.value)} /></div>
      <div className="space-y-1.5"><Label>CNAE</Label><Input value={form.cnaeDescription} onChange={(e) => set('cnaeDescription', e.target.value)} /></div>
    </div>
  )
}
