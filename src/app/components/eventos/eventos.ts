// src/app/components/eventos/eventos.ts

//Este componente maneja la sección de eventos en la aplicación.
//Proporciona un botón para navegar a la agenda de reservas de eventos.
//También verifica si el usuario está logueado para permitir el acceso a la agenda.

import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-eventos',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './eventos.html',
  styleUrl: './eventos.css'
})
export class Eventos {
  private router = inject(Router);
  public authService = inject(AuthService);

  irAgenda() {
    this.router.navigate(['/agenda']);
  }
}
