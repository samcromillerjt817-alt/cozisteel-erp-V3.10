'use client'

import { useCallback, useState } from 'react'

export interface CatalogCartItem {
  id: string // id da linha do carrinho (não o productId — o mesmo produto pode aparecer 2x com personalizações diferentes)
  productId: string
  productName: string
  productImage?: string
  quantity: number
  width?: number
  height?: number
  length?: number
  material: string
  finish: string
  voltage: string
  operationSide: string
  accessories: string
  modifications: string
  notes: string
}

const STORAGE_KEY = 'cozisteel-catalogo-cesta'

function readCart(): CatalogCartItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as CatalogCartItem[]) : []
  } catch {
    return []
  }
}

function writeCart(items: CatalogCartItem[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

/**
 * Cesta do Catálogo Digital Público (ADR-026, Fase 3) — persistida em localStorage, não no servidor.
 * Só vira dado real (CatalogRequest/Quote) no momento da submissão final — navegar/fechar a aba antes
 * disso não deixa rastro nenhum no sistema.
 */
export function useCatalogCart() {
  const [items, setItems] = useState<CatalogCartItem[]>(() => readCart())

  const addItem = useCallback((item: Omit<CatalogCartItem, 'id'>) => {
    setItems((prev) => {
      const next = [...prev, { ...item, id: crypto.randomUUID() }]
      writeCart(next)
      return next
    })
  }, [])

  const updateItem = useCallback((id: string, patch: Partial<CatalogCartItem>) => {
    setItems((prev) => {
      const next = prev.map((i) => (i.id === id ? { ...i, ...patch } : i))
      writeCart(next)
      return next
    })
  }, [])

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const next = prev.filter((i) => i.id !== id)
      writeCart(next)
      return next
    })
  }, [])

  const clear = useCallback(() => {
    setItems([])
    writeCart([])
  }, [])

  return { items, addItem, updateItem, removeItem, clear }
}
