import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthStore } from './auth.store';

/** Protected pages require a session; otherwise go to /login and come back afterwards. */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  const status = auth.status() ?? (await auth.refresh().catch(() => undefined));
  if (status?.authenticated) return true;
  return router.createUrlTree(['/login'], { queryParams: { volver: state.url } });
};

/** A 401 anywhere (expired session) sends the user back to the login page. */
export const sessionExpiredInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  return next(req).pipe(
    catchError((error: unknown) => {
      const isAuthCall = req.url.includes('/auth/');
      if (error instanceof HttpErrorResponse && error.status === 401 && !isAuthCall) {
        auth.markSignedOut();
        void router.navigate(['/login'], { queryParams: { volver: router.url } });
      }
      return throwError(() => error);
    }),
  );
};
