import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';

import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.loadCurrentUser().pipe(
    map((user) =>
      user
        ? true
        : router.createUrlTree(['/ingresar'], { queryParams: { returnUrl: state.url } }),
    ),
    catchError(() =>
      of(router.createUrlTree(['/ingresar'], { queryParams: { authError: 'unavailable' } })),
    ),
  );
};

export const adminGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.loadCurrentUser().pipe(
    map((user) => {
      if (!user) {
        return router.createUrlTree(['/ingresar'], {
          queryParams: { returnUrl: state.url },
        });
      }
      return user.role === 'ADMIN' ? true : router.createUrlTree(['/']);
    }),
    catchError(() =>
      of(
        router.createUrlTree(['/ingresar'], {
          queryParams: { authError: 'unavailable' },
        }),
      ),
    ),
  );
};
