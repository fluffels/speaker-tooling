import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';

type Zustand = { art: 'laedt' } | { art: 'text'; text: string } | { art: 'fehler' };

/** Zeigt den Begrüßungstext, den das Backend aus der Datenbank liest (`GET /api/begruessung`). */
@Component({
  selector: 'app-begruessung',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (zustand().art) {
      @case ('laedt') {
        <p>Lädt …</p>
      }
      @case ('text') {
        <p>{{ text() }}</p>
      }
      @default {
        <p role="alert">Backend nicht erreichbar</p>
      }
    }
  `,
})
export class Begruessung {
  private readonly http = inject(HttpClient);
  protected readonly zustand = signal<Zustand>({ art: 'laedt' });

  constructor() {
    this.http.get<{ text?: unknown }>('/api/begruessung').subscribe({
      next: (antwort) => {
        const text = antwort?.text;
        this.zustand.set(typeof text === 'string' && text !== '' ? { art: 'text', text } : { art: 'fehler' });
      },
      error: () => this.zustand.set({ art: 'fehler' }),
    });
  }

  protected text(): string {
    const z = this.zustand();
    return z.art === 'text' ? z.text : '';
  }
}
