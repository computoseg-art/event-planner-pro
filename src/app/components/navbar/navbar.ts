import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../services/auth.service';
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

  public authService = inject(AuthService);

  user = toSignal(this.authService.user$);

  get userEmail(): string {
    return this.user()?.email || '';
  }

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
