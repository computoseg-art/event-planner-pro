import { Injectable, computed, inject, NgZone, Injector, runInInjectionContext } from '@angular/core';
import {
  Auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  user,
} from '@angular/fire/auth';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private auth = inject(Auth); // Inyectamos el servicio de autenticación de Firebase
  private router = inject(Router); // Para redireccionar después de login/logout
  private zone = inject(NgZone); // Para asegurar que las redirecciones ocurran dentro del Angular Zone
  private injector = inject(Injector);

  // Estado del usuario (Base de toda la app)
  user$ = user(this.auth); // user$ es un Observable que emite el estado del usuario (null si no hay sesión)
  userSignal = toSignal(this.user$); // userSignal es la versión señal de user$, para usarla directamente en templates y lógica reactiva

  usuarioLogueado = computed(() => this.userSignal()?.email?.toLowerCase() || null); // Computed que devuelve el email del usuario logueado o null si no hay sesión

  // Helper para saber si es Admin
  // computed es una función que crea una señal computada, que se actualiza automáticamente cuando las señales que usa cambian.
  // En este caso, se actualiza cuando cambia el usuario logueado.
  esAdmin = computed(() => {
    const email = this.usuarioLogueado();
    return email === 'admin@gmail.com' || email === 'estebangarriga@gmail.com';
  });

  async login(email: string, pass: string) {
      try {
        // ✅ Envolver dentro de runInInjectionContext elimina el warning
        await runInInjectionContext(this.injector, async () => {
          await signInWithEmailAndPassword(this.auth, email, pass);
        });

        this.zone.run(() => this.router.navigate(['/agenda']));
      } catch (e: any) {
        let mensaje = 'Error al iniciar sesión.';

        switch (e.code) {
          case 'auth/invalid-credential':
          case 'auth/wrong-password':
          case 'auth/user-not-found':
            mensaje = 'Correo o contraseña incorrectos.';
            break;
          case 'auth/invalid-email':
            mensaje = 'El formato del correo no es válido.';
            break;
          case 'auth/too-many-requests':
            mensaje = 'Demasiados intentos fallidos. Inténtalo más tarde.';
            break;
        }

        alert(mensaje);
      }
  }

  async registrar(email: string, pass: string) {
    try {
      await createUserWithEmailAndPassword(this.auth, email, pass);
      this.zone.run(() => this.router.navigate(['/agenda']));
    } catch (e: any) {
      alert('Error al registrar: ' + e.message);
      throw e;
    }
  }


  async logout() {
    runInInjectionContext(this.injector, async () => {
      await signOut(this.auth);
      this.zone.run(() => {
        this.router.navigate(['/login']); // Redirige a la ruta que corresponda
      });
    });
  }

}
