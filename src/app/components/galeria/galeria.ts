import { Component, signal } from '@angular/core';

interface FotoEvento {
  url: string;
  titulo: string;
  categoria: string;
}

interface ServicioDestacado {
  icono: string;
  titulo: string;
  descripcion: string;
}

@Component({
  selector: 'app-galeria',
  standalone: true,
  templateUrl: './galeria.html',
  styleUrl: './galeria.css',
})
export class GaleriaComponent {
  fotos: FotoEvento[] = [
    { url: '/images/bodas/boda-jardin.jpg', titulo: 'Boda en el jardín', categoria: 'Bodas' },
    { url: '/images/quince/quince-retrato.JPG', titulo: 'Retrato de quinceañera', categoria: '15 años' },
    { url: '/images/bodas/boda-jardin-vestido.jpg', titulo: 'Celebración entre jardines', categoria: 'Bodas' },
    { url: '/images/quince/quince-sesion-noche.JPG', titulo: 'Sesión de quince años', categoria: '15 años' },
    { url: '/images/bodas/boda-ramo.jpg', titulo: 'Un día para recordar', categoria: 'Bodas' },
    { url: '/images/quince/quince-torta.JPG', titulo: 'La torta de cumpleaños', categoria: '15 años' },
  ];

  servicios: ServicioDestacado[] = [
    { icono: '📸', titulo: 'Fotografía profesional', descripcion: 'Cada momento importante, capturado con calidad y cuidado.' },
    { icono: '🎬', titulo: 'Videografía', descripcion: 'Un video cinematográfico para revivir tu gran día.' },
    { icono: '🖼️', titulo: 'Galería online', descripcion: 'Accedé, elegí y descargá tus fotos desde tu cuenta.' },
    { icono: '🎁', titulo: 'Cobertura a medida', descripcion: 'Armá el paquete ideal para tu 15 o tu boda.' },
  ];

  fotoSeleccionada = signal<FotoEvento | null>(null);

  abrir(foto: FotoEvento) {
    this.fotoSeleccionada.set(foto);
  }

  cerrar() {
    this.fotoSeleccionada.set(null);
  }
}
