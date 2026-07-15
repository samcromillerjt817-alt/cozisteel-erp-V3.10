import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'

export async function createTestUser(suffix: string) {
  const passwordHash = await bcrypt.hash('teste123', 4)
  return db.user.create({
    data: { username: `test_user_${suffix}`, name: 'Test User', password: passwordHash, role: 'admin', active: true },
  })
}

export async function createTestProduct(suffix: string) {
  return db.product.create({ data: { name: `Test Product ${suffix}` } })
}

export async function createTestMaterial(suffix: string) {
  return db.material.create({ data: { name: `Test Material ${suffix}` } })
}

export async function createTestSupplier(suffix: string) {
  return db.supplier.create({ data: { corporateName: `Test Supplier ${suffix}` } })
}
