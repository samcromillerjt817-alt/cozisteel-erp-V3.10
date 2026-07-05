import { db } from '@/lib/db'

class SettingService {
  async get(key: string): Promise<string> {
    const setting = await db.systemSetting.findUnique({ where: { key } })
    return setting?.value ?? ''
  }

  async getNumber(key: string, defaultValue = 0): Promise<number> {
    const val = await this.get(key)
    const num = parseFloat(val)
    return isNaN(num) ? defaultValue : num
  }

  async getBoolean(key: string, defaultValue = false): Promise<boolean> {
    const val = await this.get(key)
    return val === 'true' || val === '1' ? true : defaultValue
  }

  async getGroup(group: string) {
    return db.systemSetting.findMany({
      where: { group },
      orderBy: { id: 'asc' },
    })
  }

  async set(key: string, value: string) {
    return db.systemSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    })
  }

  async setMany(settings: Array<{ key: string; value: string }>) {
    const operations = settings.map((s) =>
      db.systemSetting.upsert({
        where: { key: s.key },
        update: { value: s.value },
        create: { key: s.key, value: s.value },
      })
    )
    return db.$transaction(operations)
  }

  async getAllGrouped() {
    const all = await db.systemSetting.findMany({ orderBy: { group: 'asc' } })
    const grouped: Record<string, typeof all> = {}
    for (const s of all) {
      if (!grouped[s.group]) grouped[s.group] = []
      grouped[s.group].push(s)
    }
    return grouped
  }
}

export const settingService = new SettingService()