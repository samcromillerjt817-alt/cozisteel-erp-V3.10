import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { CnpjInput } from '@/components/form/cnpj-input'
import { CepInput } from '@/components/form/cep-input'
import { EmailInput } from '@/components/form/email-input'
import { PhoneInput } from '@/components/form/phone-input'
import { handleCnpjLookup, handleCepLookup } from '@/lib/cnpj-cep-lookup'
import { PAYMENT_TERMS_OPTIONS } from '@/lib/payment-terms'
import { toast } from 'sonner'
import type { SupplierFormData } from './types'

interface FornecedorFormFieldsProps {
  form: SupplierFormData
  onChange: (form: SupplierFormData) => void
}

// Grade de campos do formulário de Fornecedor — específica do domínio, mesmo raciocínio de
// `ClienteFormFields` (Subetapa 11.5.6): campos parecidos mas não idênticos aos de Cliente
// (Fornecedor tem "Condições de pagamento"/"Prazo de entrega"/"Observações" a mais), não nasce em
// `platform`.
export function FornecedorFormFields({ form, onChange }: FornecedorFormFieldsProps) {
  const set = <K extends keyof SupplierFormData>(key: K, value: SupplierFormData[K]) => onChange({ ...form, [key]: value })

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
      <div className="space-y-1.5"><Label>Razão Social</Label><Input value={form.corporateName} onChange={(e) => set('corporateName', e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Nome Fantasia</Label><Input value={form.tradeName} onChange={(e) => set('tradeName', e.target.value)} /></div>
      <div className="space-y-1.5">
        <Label>CNPJ/CPF</Label>
        <CnpjInput
          value={form.cpfCnpj}
          onChange={(v) => set('cpfCnpj', v)}
          onLookup={(cnpj) =>
            handleCnpjLookup<SupplierFormData>(
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
      <div className="space-y-1.5"><Label>Telefone do contato</Label><PhoneInput value={form.contactPhone} onChange={(v) => set('contactPhone', v)} /></div>
      <div className="space-y-1.5">
        <Label>CEP</Label>
        <CepInput value={form.zipCode} onChange={(v) => set('zipCode', v)} onLookup={(cep) => handleCepLookup<SupplierFormData>(cep, (updater) => onChange(updater(form)))} />
      </div>
      <div className="space-y-1.5"><Label>Endereço</Label><Input value={form.address} onChange={(e) => set('address', e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Bairro</Label><Input value={form.neighborhood} onChange={(e) => set('neighborhood', e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Cidade</Label><Input value={form.city} onChange={(e) => set('city', e.target.value)} /></div>
      <div className="space-y-1.5"><Label>UF</Label><Input value={form.state} onChange={(e) => set('state', e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Situação Cadastral</Label><Input value={form.situacaoCadastral} onChange={(e) => set('situacaoCadastral', e.target.value)} /></div>
      <div className="space-y-1.5"><Label>CNAE</Label><Input value={form.cnaeDescription} onChange={(e) => set('cnaeDescription', e.target.value)} /></div>
      <div className="space-y-1.5">
        <Label>Condições de pagamento</Label>
        <Select value={form.paymentTerms || undefined} onValueChange={(v) => set('paymentTerms', v)}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Selecione" /></SelectTrigger>
          <SelectContent>{PAYMENT_TERMS_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5"><Label>Prazo médio de entrega (dias)</Label><Input type="number" value={form.leadTimeDays} onChange={(e) => set('leadTimeDays', parseInt(e.target.value) || 0)} /></div>
      <div className="space-y-1 sm:col-span-2"><Label>Observações</Label><Textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} /></div>
    </div>
  )
}
