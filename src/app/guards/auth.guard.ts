import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth, user } from '@angular/fire/auth';
import { map, take } from 'rxjs';

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(Auth);
  const router = inject(Router);

  return user(auth).pipe(
    take(1),
    map((currUser) => {
      if (currUser) {
        return true;
      } else {
        return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
      }
    }),
  );
};
