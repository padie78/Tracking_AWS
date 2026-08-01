import { Injectable, computed, signal } from '@angular/core';

export type AppNotificationKind =
  | 'info'
  | 'success'
  | 'warning'
  | 'critical'
  | 'savings';

export interface AppNotification {
  id: string;
  kind: AppNotificationKind;
  title: string;
  body: string;
  createdAtIso: string;
  read: boolean;
  href?: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly _items = signal<AppNotification[]>([]);
  private readonly _toasts = signal<AppNotification[]>([]);

  readonly items = computed(() => this._items());
  readonly unreadCount = computed(
    () => this._items().filter((n) => !n.read).length,
  );
  readonly toasts = computed(() => this._toasts());

  push(input: {
    kind: AppNotificationKind;
    title: string;
    body: string;
    href?: string;
    toast?: boolean;
  }): void {
    const note: AppNotification = {
      id: crypto.randomUUID(),
      kind: input.kind,
      title: input.title,
      body: input.body,
      createdAtIso: new Date().toISOString(),
      read: false,
      href: input.href,
    };
    this._items.update((list) => [note, ...list].slice(0, 40));
    if (input.toast !== false) {
      this._toasts.update((list) => [note, ...list].slice(0, 4));
      window.setTimeout(() => this.dismissToast(note.id), 6500);
    }
  }

  markAllRead(): void {
    this._items.update((list) => list.map((n) => ({ ...n, read: true })));
  }

  markRead(id: string): void {
    this._items.update((list) =>
      list.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
  }

  dismissToast(id: string): void {
    this._toasts.update((list) => list.filter((n) => n.id !== id));
  }

  clear(): void {
    this._items.set([]);
    this._toasts.set([]);
  }
}
