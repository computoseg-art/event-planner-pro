import { Component } from '@angular/core';

interface Aliado {
  nombre: string;
  rubro: string;
  icono: string;
  descripcion: string;
  contacto: string;
}

@Component({
  selector: 'app-aliados',
  standalone: true,
  templateUrl: './aliados.html',
  styleUrl: './aliados.css',
})
export class AliadosComponent {
  aliados: Aliado[] = [
    { nombre: 'Salón Los Álamos', rubro: 'Lugares de fiestas', icono: '🏛️', descripcion: 'Salones y quintas para todo tipo de celebraciones.', contacto: 'https://example.com/alamos' },
    { nombre: 'TransEventos', rubro: 'Transporte', icono: '🚌', descripcion: 'Traslado seguro de invitados, buses y combis.', contacto: 'https://example.com/transeventos' },
    { nombre: 'Limpieza Total', rubro: 'Limpieza', icono: '🧹', descripcion: 'Limpieza antes y después de tu evento.', contacto: 'https://example.com/limpieza' },
    { nombre: 'Sabores & Co.', rubro: 'Catering', icono: '🍰', descripcion: 'Banquetes, mesas dulces y bartenders.', contacto: 'https://example.com/sabores' },
  ];
}
