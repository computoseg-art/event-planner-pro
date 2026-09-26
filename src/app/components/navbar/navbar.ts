import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service'; // Asegúrate de ajustar la ruta si difiere
import { ReservaService } from '../../services/reserva.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css'
})
export class NavbarComponent {
  public auth = inject(AuthService);
  public reservaService = inject(ReservaService);
  private router = inject(Router);

  // Control para el menú desplegable en móviles

 menuAbierto = signal<boolean>(false);

  toggleMenu() {
    this.menuAbierto.update(v => !v);
  }

  cerrarMenu() {
    this.menuAbierto.set(false);
  }

  async logout() {
    await this.auth.logout();
    this.router.navigate(['/login']);
  }
}
