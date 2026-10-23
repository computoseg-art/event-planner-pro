// src/app/guards/auth.guard.ts

//Este guardia protege las rutas que requieren autenticación en la aplicación.
//Si el usuario no está autenticado, se le redirige al login.
//Utiliza Firebase Authentication para verificar el estado del usuario y Angular Router 
// para la navegación.

import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth, user } from '@angular/fire/auth';
import { map, take } from 'rxjs';

export const authGuard: CanActivateFn = (route, state) => {
  const auth = inject(Auth);
  const router = inject(Router);

  // Observamos el estado del usuario de Firebase
  return user(auth).pipe(
    take(1), // Tomamos el primer valor emitido
    map((currUser) => {
      if (currUser) {
        return true; // Hay usuario, permite el paso
      } else {
        return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
      }
    }),
  );
};
