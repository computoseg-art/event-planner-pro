import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { ReservaService } from './services/reserva.service';
import { filter } from 'rxjs/operators';
import { NavbarComponent } from './components/navbar/navbar';
import { InactivityService } from './services/inactivity.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, NavbarComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly title = signal('agenda');
  mostrarNavbar = signal<boolean>(true);
  public reservaService = inject(ReservaService);
  private router = inject(Router);
  private inactivity = inject(InactivityService); // Activa el monitoreo automático

  constructor() {
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event: any) => {
        // Oculta el navbar si la URL es /login o la raíz cuando redirige al login
        const esLogin = event.urlAfterRedirects.includes('/login');
        this.mostrarNavbar.set(!esLogin);
      });
  }
}
