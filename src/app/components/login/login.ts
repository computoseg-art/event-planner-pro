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
}
