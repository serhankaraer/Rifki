// Çok dil desteği: yeni dil eklemek = locales/<kod>.js dosyası + aşağıdaki kayıt satırı.
import tr from './locales/tr.js';

const locales = { tr };
let current = 'tr';

export function registerLocale(code, dict) { locales[code] = dict; }
export function availableLocales() { return Object.keys(locales); }
export function currentLocale() { return current; }

export function setLocale(code) {
  const base = String(code || '').toLowerCase().split('-')[0];
  current = locales[base] ? base : 'tr';
  if (typeof document !== 'undefined') document.documentElement.lang = current;
  return current;
}

/** Çeviri: süslü parantezli yer tutucular doldurulur; anahtar eksikse Türkçeye, o da yoksa anahtarın kendisine düşer. */
export function t(key, params) {
  const text = locales[current]?.[key] ?? locales.tr[key] ?? key;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, name) => (params[name] !== undefined ? String(params[name]) : m));
}
