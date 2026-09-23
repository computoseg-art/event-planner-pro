import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class HomeComponent {
  auth = inject(AuthService);

  nombreUsuario = signal('');
  passwordUsuario = signal('');
  esRegistro = signal(false);

  accionPrincipal() {
    const email = this.nombreUsuario().trim();
    const pass = this.passwordUsuario().trim();

    if (email.length > 0 && pass.length >= 6) {
      if (this.esRegistro()) {
        this.auth.registrar(email, pass);
      } else {
        this.auth.login(email, pass);
      }
    } else {
      alert('Por favor, ingresa un correo y una contraseña (mínimo 6 caracteres).');
    }
  }

  // --- NUEVO MÉTODO PARA GOOGLE ---
  ingresarConGoogle() {
    this.auth.loginConGoogle();
  }
}