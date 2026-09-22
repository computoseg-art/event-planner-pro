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
  user$= user(this.auth); // user$ es un Observable que emite el estado del usuario (null si no hay sesión)
  userSignal = toSignal(this.user$); // userSignal es la versión señal de user$, para usarla directamente en templates y lógica reactiva

  usuarioLogueado = computed(() => this.userSignal()?.email?.toLowerCase() || null); // Computed que devuelve el email del usuario logueado o null si no hay sesión

  // Helper para saber si es Admin
  esAdmin = computed(() => {
    const email = this.usuarioLogueado();
    return email === 'admin@gmail.com' || email === 'estebangarriga@gmail.com';
  });

  async login(email: string, pass: string) {
    try {
      // Envolver dentro de runInInjectionContext elimina el warning
      await runInInjectionContext(this.injector, async () => {
        await signInWithEmailAndPassword(this.auth, email, pass);
      });

      // Redirección a la carátula de eventos tras loguearse
      this.zone.run(() => this.router.navigate(['/eventos']));
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

      // Redirección a la carátula de eventos tras registrarse
      this.zone.run(() => this.router.navigate(['/eventos']));
    } catch (e: any) {
      let mensaje = 'No se pudo completar el registro.';

      switch (e.code) {
        case 'auth/email-already-in-use':
          mensaje = 'Este correo electrónico ya está registrado. Prueba iniciando sesión.';
          break;
        case 'auth/invalid-email':
          mensaje = 'El correo electrónico ingresado no tiene un formato válido.';
          break;
        case 'auth/weak-password':
          mensaje = 'La contraseña debe tener al menos 6 caracteres.';
          break;
        default:
          mensaje = e.message || 'Ocurrió un error inesperado al registrar el usuario.';
      }

      alert(`Error al registrar: ${mensaje}`);
      throw e;
    }
  }

  async logout() {
    runInInjectionContext(this.injector, async () => {
      await signOut(this.auth);
      this.zone.run(() => {
        this.router.navigate(['/home']); // Redirige a /home tras cerrar sesión
      });
    });
  }
}
