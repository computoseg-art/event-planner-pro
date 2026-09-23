import { Injectable, computed, inject, NgZone, Injector, runInInjectionContext } from '@angular/core';
import {
  Auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  user,
  GoogleAuthProvider, // <-- Importar proveedor de Google
  signInWithPopup     // <-- Importar función de popup
} from '@angular/fire/auth';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private auth = inject(Auth);
  private router = inject(Router);
  private zone = inject(NgZone);
  private injector = inject(Injector);

  user$ = user(this.auth);
  userSignal = toSignal(this.user$);

  usuarioLogueado = computed(() => this.userSignal()?.email?.toLowerCase() || null);

  esAdmin = computed(() => {
    const email = this.usuarioLogueado();
    return email === 'admin@gmail.com' || email === 'estebangarriga@gmail.com';
  });

  // --- NUEVO MÉTODO: LOGIN / REGISTRO CON GOOGLE ---
  async loginConGoogle() {
    try {
      const provider = new GoogleAuthProvider();
      
      await runInInjectionContext(this.injector, async () => {
        await signInWithPopup(this.auth, provider);
      });

      // Redirige automáticamente a la carátula de eventos
      this.zone.run(() => this.router.navigate(['/eventos']));
    } catch (e: any) {
      console.error('Error al iniciar sesión con Google:', e);
      if (e.code !== 'auth/popup-closed-by-user') {
        alert('No se pudo iniciar sesión con Google. Inténtalo de nuevo.');
      }
    }
  }

  async login(email: string, pass: string) {
    try {
      await runInInjectionContext(this.injector, async () => {
        await signInWithEmailAndPassword(this.auth, email, pass);
      });

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
        this.router.navigate(['/home']);
      });
    });
  }
}