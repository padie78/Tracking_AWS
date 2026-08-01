import { Component, Input } from '@angular/core';

@Component({
  standalone: true,
  selector: 'ta-status-badge',
  template: `
    <span class="ta-badge" [attr.data-status]="status">{{ label || status }}</span>
  `,
  styles: [
    `
      .ta-badge {
        display: inline-flex;
        align-items: center;
        padding: 0.28rem 0.6rem;
        border-radius: 999px;
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        border: 1px solid var(--ta-border);
        color: var(--ta-text-muted);
        background: var(--ta-bg-panel);
        white-space: nowrap;
      }
      .ta-badge[data-status='completed'],
      .ta-badge[data-status='active'],
      .ta-badge[data-status='ok'] {
        color: var(--ta-success);
        border-color: color-mix(in srgb, var(--ta-success) 40%, transparent);
        background: color-mix(in srgb, var(--ta-success) 12%, transparent);
      }
      .ta-badge[data-status='failed'],
      .ta-badge[data-status='error'] {
        color: var(--ta-danger);
        border-color: color-mix(in srgb, var(--ta-danger) 40%, transparent);
        background: color-mix(in srgb, var(--ta-danger) 12%, transparent);
      }
      .ta-badge[data-status='queued'],
      .ta-badge[data-status='assuming_role'],
      .ta-badge[data-status='running'],
      .ta-badge[data-status='aggregating'],
      .ta-badge[data-status='pending'] {
        color: var(--ta-warning);
        border-color: color-mix(in srgb, var(--ta-warning) 40%, transparent);
        background: color-mix(in srgb, var(--ta-warning) 12%, transparent);
      }
    `,
  ],
})
export class StatusBadgeComponent {
  @Input({ required: true }) status!: string;
  @Input() label?: string;
}
