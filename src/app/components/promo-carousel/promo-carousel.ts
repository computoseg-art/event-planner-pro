import { Component, DestroyRef, inject, signal } from '@angular/core';

interface PromoSlide {
  src: string;
  alt: string;
  kicker: string;
  title: string;
}

const unsplash = (id: string) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1600&q=80`;

@Component({
  selector: 'app-promo-carousel',
  standalone: true,
  templateUrl: './promo-carousel.html',
  styleUrl: './promo-carousel.css',
})
export class PromoCarouselComponent {
  private destroyRef = inject(DestroyRef);
  private timer?: ReturnType<typeof setInterval>;

  readonly slides: PromoSlide[] = [
    {
      src: unsplash('1492684223066-81342ee5ff30'),
      alt: 'Fiesta de 15 años con invitados celebrando',
      kicker: '15 AÑOS',
      title: 'La fiesta que soñaste, capturada en cada instante.',
    },
    {
      src: unsplash('1583939003579-730e3918a45a'),
      alt: 'Novios besándose entre pétalos y amigos',
      kicker: 'BODAS',
      title: 'Una historia de amor, contada con imágenes.',
    },
    {
      src: unsplash('1530103862676-de8c9debad1d'),
      alt: 'Globos de colores en una celebración',
      kicker: 'CELEBRACIONES',
      title: 'Cada detalle de tu fiesta, para recordar siempre.',
    },
    {
      src: unsplash('1469371670807-013ccf25f16a'),
      alt: 'Ceremonia al aire libre con flores',
      kicker: 'CEREMONIAS',
      title: 'Los momentos que no se repiten, bien guardados.',
    },
    {
      src: unsplash('1511795409834-ef04bbd61622'),
      alt: 'Mesa de salón decorada con flores',
      kicker: 'SALÓN',
      title: 'Cobertura completa de foto y video.',
    },
    {
      src: unsplash('1519741497674-611481863552'),
      alt: 'Novia con ramo de flores a contraluz',
      kicker: 'FOTOGRAFÍA',
      title: 'Tu gran día merece quedar para siempre.',
    },
  ];

  readonly current = signal(0);

  constructor() {
    this.start();
    this.destroyRef.onDestroy(() => this.stop());
  }

  next(): void {
    this.current.update((i) => (i + 1) % this.slides.length);
  }

  prev(): void {
    this.current.update((i) => (i - 1 + this.slides.length) % this.slides.length);
  }

  goTo(index: number): void {
    this.current.set(index);
  }

  start(): void {
    this.stop();
    this.timer = setInterval(() => this.next(), 5000);
  }

  stop(): void {
    clearInterval(this.timer);
  }
}
