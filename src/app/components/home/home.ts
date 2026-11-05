import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CartService } from '../../services/cart.service';
import { GaleriaComponent } from '../galeria/galeria';
import { AliadosComponent } from '../aliados/aliados';
import { PromoCarouselComponent } from '../promo-carousel/promo-carousel';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink, GaleriaComponent, AliadosComponent, PromoCarouselComponent],
  templateUrl: './home.html',
  styleUrls: ['./home.css', './wedding.css'],
})
export class HomeComponent {
  private cart = inject(CartService);
  serviciosBodas = computed(() =>
    this.cart.serviciosDisponibles().filter((servicio) => servicio.categoria === 'bodas'),
  );
}