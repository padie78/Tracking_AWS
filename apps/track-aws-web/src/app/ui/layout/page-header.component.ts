import { Component, Input } from '@angular/core';

@Component({
  standalone: true,
  selector: 'ta-page-header',
  template: `
    <header class="ta-page__head">
      <div class="ta-page__intro">
        @if (eyebrow) {
          <div class="ta-page__eyebrow">{{ eyebrow }}</div>
        }
        <h1>{{ title }}</h1>
        @if (subtitle) {
          <p>{{ subtitle }}</p>
        }
      </div>
      <div class="ta-page__actions">
        <ng-content />
      </div>
    </header>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }

      .ta-page__intro {
        min-width: 0;
        flex: 1 1 auto;
      }

      .ta-page__eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        font-size: 0.72rem;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--ta-accent);
        font-weight: 700;
        margin-bottom: 0.55rem;
      }

      .ta-page__actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.65rem;
        align-items: center;
        justify-content: flex-end;
        flex-shrink: 0;
      }

      @media (max-width: 720px) {
        .ta-page__actions {
          width: 100%;
          justify-content: stretch;
        }

        .ta-page__actions ::ng-deep .p-button,
        .ta-page__actions ::ng-deep .ta-btn {
          flex: 1 1 auto;
        }
      }
    `,
  ],
})
export class PageHeaderComponent {
  @Input({ required: true }) title!: string;
  @Input() subtitle?: string;
  @Input() eyebrow?: string;
}
