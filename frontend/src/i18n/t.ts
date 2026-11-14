import { createContext, useContext } from 'react'
import en from './en.json'
import ms from './ms.json'

export type Lang = 'ms' | 'en'
export type Key = keyof typeof ms
export const dictionaries: Record<Lang, Record<Key, string>> = { ms, en }

export function translate(lang: Lang, key: Key, vars?: Record<string, string | number>): string {
  const text = dictionaries[lang][key] ?? dictionaries.ms[key] ?? key
  return vars ? text.replace(/\{(\w+)\}/g, (m, name: string) => String(vars[name] ?? m)) : text
}

type I18n = { lang: Lang; setLang: (lang: Lang) => void; t: (key: Key, vars?: Record<string, string | number>) => string }
export const I18nContext = createContext<I18n | null>(null)

export function useI18n(): I18n {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n outside I18nProvider')
  return ctx
}

/** "1 day" / "3 days" ("1 hari" / "3 hari"). */
export const dayCount = (t: (k: Key, v?: Record<string, string | number>) => string, n: number) => t(n === 1 ? 'picker.day1' : 'picker.daysN', { n })
