import { Injectable, inject, signal } from '@angular/core';
import type { AuthStatus } from '@tiklive/contracts';
import { ApiClient } from './api-client';

/** Session state of the dashboard; the cookie itself is HttpOnly and never touched here. */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly api = inject(ApiClient);
  readonly status = signal<AuthStatus | undefined>(undefined);

  async refresh(): Promise<AuthStatus> {
    const status = await this.api.get<AuthStatus>('/auth/status');
    this.status.set(status);
    return status;
  }

  async login(password: string): Promise<void> {
    this.status.set(await this.api.post<AuthStatus>('/auth/login', { password }));
  }

  async setup(code: string, password: string): Promise<void> {
    this.status.set(await this.api.post<AuthStatus>('/auth/setup', { code, password }));
  }

  async changePassword(current: string, next: string): Promise<void> {
    await this.api.post('/auth/password', { current, next });
  }

  async logout(): Promise<void> {
    await this.api.post('/auth/logout');
    this.markSignedOut();
  }

  markSignedOut(): void {
    const current = this.status();
    this.status.set({ authenticated: false, setupRequired: current?.setupRequired ?? false });
  }
}
