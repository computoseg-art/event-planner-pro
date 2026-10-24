// src/app/services/auth.service.ts

//Este servicio maneja la autenticación de usuarios en la aplicación, incluyendo inicio de sesión,
//registro y cierre de sesión. Por google, email y contraseña. 
//También proporciona señales reactivas para el estado del usuario y verifica si el usuario es admin.

import { Injectable, computed, inject, NgZone, Injector, runInInjectionContext } from '@angular/core';
import {
  Auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  user,
  GoogleAuthProvider,
  signInWithPopup,
  setPersistence,
  browserSessionPersistence
} from '@angular/fire/auth';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { GalleryService } from './gallery.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private auth = inject(Auth);
  private router = inject(Router);
  private zone = inject(NgZone);
  private injector = inject(Injector);
  private galleryService = inject(GalleryService);

  user$ = user(this.auth);
  userSignal = toSignal(this.user$);

  usuarioLogueado = computed(() => this.userSignal()?.email?.toLowerCase() || null);

  async obtenerIdToken(): Promise<string> {
    const currentUser = this.auth.currentUser || (await firstValueFrom(this.user$));
    if (!currentUser) {
      throw new Error('Debes iniciar sesión para continuar con el pago.');
    }
    return currentUser.getIdToken();
  }

  esAdmin = computed(() => {
    const email = this.usuarioLogueado();
    return email === 'admin@gmail.com' || email === 'estebangarriga@gmail.com';
  });

  // --- LOGIN CON GOOGLE ---
  async loginConGoogle() {
    try {
      await setPersistence(this.auth, browserSessionPersistence);

      await runInInjectionContext(this.injector, async () => {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(this.auth, provider);
      });

      this.afterAuthentication();
    } catch (e: any) {
      console.error('Error al iniciar sesión con Google:', e);
      if (e.code !== 'auth/popup-closed-by-user') {
        alert('No se pudo iniciar sesión con Google. Inténtalo de nuevo.');
      }
    }
  }

  // --- LOGIN CON EMAIL / CONTRASEÑA ---
  async login(email: string, pass: string) {
    try {
      // 1. Configurar la persistencia antes de autenticar
      await setPersistence(this.auth, browserSessionPersistence);

      // 2. Iniciar sesión
      await runInInjectionContext(this.injector, async () => {
        await signInWithEmailAndPassword(this.auth, email, pass);
      });

      this.afterAuthentication();
    } catch (e: any) {
      console.error('Error exacto de Firebase Auth:', e); // Imprime el error real en consola

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
      await setPersistence(this.auth, browserSessionPersistence);

      await runInInjectionContext(this.injector, async () => {
        await createUserWithEmailAndPassword(this.auth, email, pass);
      });

      this.afterAuthentication();
    } catch (e: any) {
      console.error('Error al registrar:', e);
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

  async recuperarContrasena(email: string): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      sendPasswordResetEmail(this.auth, email.trim())
    );
  }

  async logout() {
    runInInjectionContext(this.injector, async () => {
      await signOut(this.auth);
      this.zone.run(() => {
        this.router.navigate(['/login']);
      });
    });
  }

  private afterAuthentication(): void {
    const returnUrl = this.router.parseUrl(this.router.url).queryParams['returnUrl'];
    const destination =
      typeof returnUrl === 'string' && returnUrl.startsWith('/') && !returnUrl.startsWith('//')
        ? returnUrl
        : '/eventos';

    this.zone.run(() => {
      void this.router.navigateByUrl(destination);
    });
    void this.provisionGalleryFolder();
  }

  private async provisionGalleryFolder(): Promise<void> {
    try {
      await firstValueFrom(this.galleryService.ensureOwnFolder());
    } catch (error) {
      console.error('No se pudo crear o recuperar la carpeta personal de Google Photos:', error);
    }
  }
}
