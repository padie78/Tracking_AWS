import { DatePipe } from '@angular/common';
import {
  Component,
  HostListener,
  ViewEncapsulation,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { NotificationService } from '../../core/notifications/notification.service';

@Component({
  standalone: true,
  selector: 'ta-notification-center',
  encapsulation: ViewEncapsulation.None,
  imports: [RouterLink, DatePipe],
  template: `
    <div class="ta-notif">
      <button
        type="button"
        class="ta-notif__bell"
        (click)="toggle($event)"
        [attr.aria-expanded]="open()"
        title="Notificaciones"
      >
        <span aria-hidden="true">🔔</span>
        @if (notes.unreadCount() > 0) {
          <span class="ta-notif__badge">{{ notes.unreadCount() }}</span>
        }
      </button>

      @if (open()) {
        <div class="ta-notif__panel" (click)="$event.stopPropagation()">
          <div class="ta-notif__head">
            <strong>Notificaciones</strong>
            <button type="button" class="ta-btn ta-btn--ghost ta-btn--sm" (click)="notes.markAllRead()">
              Marcar leídas
            </button>
          </div>
          <ul class="ta-notif__list">
            @for (n of notes.items(); track n.id) {
              <li [class.ta-notif__item--unread]="!n.read" (click)="onItem(n.id)">
                <div class="ta-notif__kind" [attr.data-kind]="n.kind">{{ n.kind }}</div>
                <div class="ta-notif__title">{{ n.title }}</div>
                <div class="ta-notif__body">{{ n.body }}</div>
                <div class="ta-meta">{{ n.createdAtIso | date: 'short' }}</div>
                @if (n.href) {
                  <a [routerLink]="n.href" class="ta-notif__link">Ver</a>
                }
              </li>
            } @empty {
              <li class="ta-meta">Sin notificaciones todavía.</li>
            }
          </ul>
        </div>
      }
    </div>
  `,
})
export class NotificationCenterComponent {
  readonly notes = inject(NotificationService);
  readonly open = signal(false);

  toggle(ev: Event): void {
    ev.stopPropagation();
    this.open.update((v) => !v);
  }

  onItem(id: string): void {
    this.notes.markRead(id);
  }

  @HostListener('document:click')
  onDocClick(): void {
    this.open.set(false);
  }
}

@Component({
  standalone: true,
  selector: 'ta-toast-stack',
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="ta-toasts" aria-live="polite">
      @for (t of notes.toasts(); track t.id) {
        <div class="ta-toast" [attr.data-kind]="t.kind">
          <div>
            <strong>{{ t.title }}</strong>
            <div class="ta-toast__body">{{ t.body }}</div>
          </div>
          <button type="button" class="ta-toast__close" (click)="notes.dismissToast(t.id)">
            ×
          </button>
        </div>
      }
    </div>
  `,
})
export class ToastStackComponent {
  readonly notes = inject(NotificationService);
}
