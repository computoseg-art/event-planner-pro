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
    { url: 'https://picsum.photos/seed/boda1/600/450', titulo: 'Boda en jardín', categoria: 'Bodas' },
    { url: 'https://picsum.photos/seed/quince2/600/450', titulo: 'Vals de quince', categoria: '15 años' },
    { url: 'https://picsum.photos/seed/boda3/600/450', titulo: 'Ceremonia', categoria: 'Bodas' },
    { url: 'https://picsum.photos/seed/quince4/600/450', titulo: 'Entrada al salón', categoria: '15 años' },
    { url: 'https://picsum.photos/seed/boda5/600/450', titulo: 'Primer baile', categoria: 'Bodas' },
    { url: 'https://picsum.photos/seed/quince6/600/450', titulo: 'Sesión previa', categoria: '15 años' },
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
