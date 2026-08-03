import { Component, ViewEncapsulation, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { PageHeaderComponent } from '../../ui/layout/page-header.component';

type PlaceholderData = {
  module?: number;
  title?: string;
  subtitle?: string;
  roadmap?: string[];
};

@Component({
  standalone: true,
  selector: 'app-module-placeholder-page',
  encapsulation: ViewEncapsulation.None,
  imports: [RouterLink, PageHeaderComponent],
  template: `
    <section class="ta-page ta-page--wide">
      <ta-page-header
        [eyebrow]="eyebrow()"
        [title]="title()"
        [subtitle]="subtitle()"
      >
        <a class="ta-btn ta-btn--ghost" routerLink="/tabs/dashboard">Dashboard</a>
      </ta-page-header>

      <div class="ta-card">
        <p class="ta-meta" style="margin-top:0">
          Esta sección ya está en el menú. Pronto vas a poder usarla completa;
          mientras tanto te mostramos qué va a incluir.
        </p>
        @if (roadmap().length) {
          <ul class="ta-placeholder__list">
            @for (item of roadmap(); track item) {
              <li>{{ item }}</li>
            }
          </ul>
        }
      </div>
    </section>
  `,
  styles: [
    `
      .ta-placeholder__list {
        margin: 1rem 0 0;
        padding-left: 1.15rem;
        display: grid;
        gap: 0.45rem;
        color: var(--ta-text, #0f172a);
        font-size: 0.95rem;
      }
    `,
  ],
})
export class ModulePlaceholderPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly data = toSignal(
    this.route.data.pipe(map((d) => d as PlaceholderData)),
    { initialValue: {} as PlaceholderData },
  );

  readonly eyebrow = computed(() => {
    const m = this.data().module;
    return m ? `Módulo ${m}` : 'Roadmap';
  });
  readonly title = computed(() => this.data().title ?? 'Próximamente');
  readonly subtitle = computed(
    () => this.data().subtitle ?? 'En construcción sobre el audit pipeline actual.',
  );
  readonly roadmap = computed(() => this.data().roadmap ?? []);
}
