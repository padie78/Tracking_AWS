import { Component, Input } from '@angular/core';

@Component({
  standalone: true,
  selector: 'ta-page-header',
  template: `
    <header class="ta-page__head">
      <div>
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
      .ta-page__eyebrow {
        font-size: 0.72rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--ta-accent);
        font-weight: 700;
        margin-bottom: 0.35rem;
      }
      .ta-page__actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.55rem;
        align-items: center;
      }
    `,
  ],
})
export class PageHeaderComponent {
  @Input({ required: true }) title!: string;
  @Input() subtitle?: string;
  @Input() eyebrow?: string;
}
