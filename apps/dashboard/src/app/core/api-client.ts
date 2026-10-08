import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { API_PREFIX, type Problem } from '@tiklive/contracts';
import { firstValueFrom, type Observable } from 'rxjs';

/** Error with the server's RFC 9457 details translated for display. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fieldErrors: readonly { path: string; message: string }[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function toApiError(error: unknown): ApiError {
  if (!(error instanceof HttpErrorResponse)) return new ApiError(0, String(error));
  if (error.status === 0) return new ApiError(0, 'No se pudo contactar al servidor');
  const problem = error.error as Partial<Problem> | null;
  return new ApiError(error.status, problem?.title ?? error.message, problem?.errors ?? []);
}

/** Thin typed wrapper over HttpClient for /api/v1; every call resolves or throws ApiError. */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);

  get<T>(path: string): Promise<T> {
    return this.call(this.http.get<T>(`${API_PREFIX}${path}`));
  }

  post<T>(path: string, body: unknown = {}): Promise<T> {
    return this.call(this.http.post<T>(`${API_PREFIX}${path}`, body));
  }

  put<T>(path: string, body: unknown): Promise<T> {
    return this.call(this.http.put<T>(`${API_PREFIX}${path}`, body));
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return this.call(this.http.patch<T>(`${API_PREFIX}${path}`, body));
  }

  delete<T = void>(path: string): Promise<T> {
    return this.call(this.http.delete<T>(`${API_PREFIX}${path}`));
  }

  private async call<T>(request: Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(request);
    } catch (error) {
      throw toApiError(error);
    }
  }
}
