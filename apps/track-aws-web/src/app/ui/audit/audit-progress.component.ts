import { Component, Input } from '@angular/core';
import type { AuditStage } from '../../core/audit/audit-live.service';

@Component({
  standalone: true,
  selector: 'ta-audit-progress',
  template: `
    <div class="ta-progress" [class.ta-progress--live]="live">
      <div class="ta-progress__head">
        <div>
          <div class="ta-progress__eyebrow">{{ eyebrow }}</div>
          <div class="ta-progress__title">{{ title }}</div>
        </div>
        <div class="ta-progress__pct">{{ percent }}%</div>
      </div>

      <div class="ta-progress__bar" aria-hidden="true">
        <div class="ta-progress__fill" [style.width.%]="percent"></div>
      </div>

      <ol class="ta-progress__stages">
        @for (stage of stages; track stage.id) {
          <li [attr.data-state]="stage.state">
            <span class="ta-progress__dot" aria-hidden="true"></span>
            <div>
              <div class="ta-progress__stage-label">{{ stage.label }}</div>
              <div class="ta-progress__stage-detail">{{ stage.detail }}</div>
            </div>
          </li>
        }
      </ol>
    </div>
  `,
  styles: [
    `
      .ta-progress {
        display: grid;
        gap: 1rem;
      }
      .ta-progress__head {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        align-items: flex-start;
      }
      .ta-progress__eyebrow {
        font-size: 0.72rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--ta-text-muted);
        font-weight: 600;
      }
      .ta-progress__title {
        font-family: var(--ta-font-display);
        font-size: 1.15rem;
        font-weight: 650;
        margin-top: 0.15rem;
      }
      .ta-progress__pct {
        font-family: var(--ta-font-mono);
        font-size: 1.1rem;
        color: var(--ta-accent);
        font-weight: 600;
      }
      .ta-progress__bar {
        height: 8px;
        border-radius: 999px;
        background: var(--ta-bg-panel);
        border: 1px solid var(--ta-border);
        overflow: hidden;
      }
      .ta-progress__fill {
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, var(--ta-accent), var(--ta-accent-2));
        transition: width 400ms ease;
      }
      .ta-progress--live .ta-progress__fill {
        animation: ta-progress-pulse 1.6s ease-in-out infinite;
      }
      .ta-progress__stages {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 0.65rem;
      }
      .ta-progress__stages li {
        display: grid;
        grid-template-columns: 18px 1fr;
        gap: 0.75rem;
        align-items: start;
      }
      .ta-progress__dot {
        width: 12px;
        height: 12px;
        margin-top: 0.3rem;
        border-radius: 50%;
        border: 2px solid var(--ta-border-strong);
        background: transparent;
      }
      .ta-progress__stages li[data-state='done'] .ta-progress__dot {
        background: var(--ta-success);
        border-color: var(--ta-success);
      }
      .ta-progress__stages li[data-state='active'] .ta-progress__dot {
        background: var(--ta-accent);
        border-color: var(--ta-accent);
        box-shadow: 0 0 0 4px var(--ta-focus);
      }
      .ta-progress__stages li[data-state='error'] .ta-progress__dot {
        background: var(--ta-danger);
        border-color: var(--ta-danger);
      }
      .ta-progress__stage-label {
        font-weight: 600;
        font-size: 0.92rem;
      }
      .ta-progress__stage-detail {
        color: var(--ta-text-muted);
        font-size: 0.8rem;
      }
      @keyframes ta-progress-pulse {
        0%,
        100% {
          filter: brightness(1);
        }
        50% {
          filter: brightness(1.15);
        }
      }
    `,
  ],
})
export class AuditProgressComponent {
  @Input({ required: true }) stages!: AuditStage[];
  @Input() percent = 0;
  @Input() title = 'Pipeline de auditoría';
  @Input() eyebrow = 'Step Functions';
  @Input() live = false;
}
