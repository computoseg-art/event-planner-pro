import { Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router'; // Importamos para usar [routerLink] y [routerLinkActive]

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    RouterLink, // Importante para [routerLink]
    RouterLinkActive, // Importante para [routerLinkActive]
  ],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class HomeComponent {
  // Datos tipados para el nuevo @for de Angular 19
  services = [
    {
      id: 1,
      title: 'Casamientos',
      desc: 'Capturamos el "sí, quiero" para siempre.',
      img: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?q=80&w=1000',
    },
    {
      id: 2,
      title: 'XV Años',
      desc: 'Tu noche mágica, inmortalizada.',
      img: 'https://images.unsplash.com/photo-1549417229-aa67d3263c09?q=80&w=1000',
    },
    {
      id: 3,
      title: 'Sesiones Personales',
      desc: 'Tu mejor perfil profesional o artístico.',
      img: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=1000',
    },
  ];
}
