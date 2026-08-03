import { Injectable, computed, signal } from '@angular/core';

export type UiLang = 'es' | 'en';

const STORAGE_KEY = 'track-aws.ui-lang';

function readStoredLang(): UiLang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'en' || v === 'es') return v;
  } catch {
    /* ignore */
  }
  return 'es';
}

@Injectable({ providedIn: 'root' })
export class UiLocaleService {
  private readonly _lang = signal<UiLang>(readStoredLang());

  readonly lang = this._lang.asReadonly();
  readonly isEs = computed(() => this._lang() === 'es');
  readonly isEn = computed(() => this._lang() === 'en');

  readonly langOptions: { label: string; value: UiLang }[] = [
    { label: 'ES', value: 'es' },
    { label: 'EN', value: 'en' },
  ];

  setLang(lang: UiLang): void {
    this._lang.set(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* ignore */
    }
  }

  /** Labels cortos de UI para tarjetas de findings */
  whyLabel(): string {
    return this._lang() === 'en' ? 'Why it matters' : 'Por qué importa';
  }

  actionLabel(): string {
    return this._lang() === 'en' ? 'What to do' : 'Qué hacer';
  }

  unnamedResource(): string {
    return this._lang() === 'en' ? 'unnamed resource' : 'recurso sin nombre';
  }
}
