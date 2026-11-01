import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  private auth = inject(AuthService);
  email = signal('');
  password = signal('');
  esRegistro = signal(false);
  enviandoRecuperacion = signal(false);
  mensajeRecuperacion = signal('');

  accionPrincipal() {
    const email = this.email().trim();
    const password = this.password().trim();

    if (!email || password.length < 6) {
      alert('Por favor, ingresa un correo y una contraseña (mínimo 6 caracteres).');
      return;
    }

    if (this.esRegistro()) {
      this.auth.registrar(email, password);
    } else {
      this.auth.login(email, password);
    }
  }

  ingresarConGoogle() {
    this.auth.loginConGoogle();
  }

  async recuperarContrasena() {
    const email = this.email().trim();
    this.mensajeRecuperacion.set('');

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.mensajeRecuperacion.set('Ingresa un correo válido para enviarte el enlace.');
      return;
    }

    this.enviandoRecuperacion.set(true);
    try {
      await this.auth.recuperarContrasena(email);
      this.mensajeRecuperacion.set(
        'Si existe una cuenta con ese correo, recibirás un enlace para restablecer la contraseña. Revisa también spam.'
      );
    } catch (error) {
      console.error('No se pudo enviar el enlace para restablecer la contraseña:', error);
      const code = (error as { code?: string })?.code;
      this.mensajeRecuperacion.set(
        code === 'auth/invalid-email'
          ? 'El formato del correo no es válido.'
          : code === 'auth/too-many-requests'
            ? 'Se realizaron demasiados intentos. Espera unos minutos e inténtalo otra vez.'
            : 'No se pudo enviar el enlace. Revisa el correo e inténtalo nuevamente.'
      );
    } finally {
      this.enviandoRecuperacion.set(false);
    }
  }
}
