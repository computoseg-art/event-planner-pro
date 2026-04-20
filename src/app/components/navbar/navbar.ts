import { CommonModule } from '@angular/common'; // Para @for, @if, etc.
import { RouterLink, RouterLinkActive } from '@angular/router'; // <--- ESTO ES LO QUE FALTA
import { Component, inject, HostListener } from '@angular/core';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink, // Importante para [routerLink]
    RouterLinkActive, // Importante para [routerLinkActive]
  ],
  templateUrl: './navbar.html',
  styleUrls: ['./navbar.css'],
})
export class Navbar {
  // Usamos inject para seguir el estilo de tu servicio
  public authService = inject(AuthService);

  isScrolled = false;

  @HostListener('window:scroll', [])
  onWindowScroll() {
    this.isScrolled = window.scrollY > 50;
  }

  async onLogout() {
    await this.authService.logout();
  }
}
