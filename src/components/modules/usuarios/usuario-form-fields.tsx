import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { RolePermissionsPreview } from './role-permissions-preview'
import { ROLE_OPTIONS, type UserFormData } from './types'

interface UsuarioFormFieldsProps {
  form: UserFormData
  onChange: (form: UserFormData) => void
  isEditing: boolean
}

export function UsuarioFormFields({ form, onChange, isEditing }: UsuarioFormFieldsProps) {
  const set = <K extends keyof UserFormData>(key: K, value: UserFormData[K]) => onChange({ ...form, [key]: value })

  return (
    <div className="space-y-4">
      <div className="space-y-1.5"><Label>Nome</Label><Input value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Usuário</Label><Input value={form.username} onChange={(e) => set('username', e.target.value)} /></div>
      <div className="space-y-1.5">
        <Label>Senha{isEditing ? ' (deixe vazio para manter)' : ''}</Label>
        <Input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} />
      </div>
      <div className="space-y-1.5"><Label>E-mail</Label><Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></div>
      <div className="space-y-1.5">
        <Label>Perfil</Label>
        <Select value={form.role} onValueChange={(v) => set('role', v)}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">O que este perfil pode fazer</Label>
        <RolePermissionsPreview role={form.role} />
      </div>
      <div className="flex items-center gap-3">
        <Switch checked={form.active} onCheckedChange={(v) => set('active', v)} />
        <Label>Ativo</Label>
      </div>
    </div>
  )
}
