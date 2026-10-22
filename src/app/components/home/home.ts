import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CartService } from '../../services/cart.service';
import { PRESUPUESTO_QUINCE } from '../../services/catalogo-servicios';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './home.html',
  styleUrls: ['./home.css', './wedding.css'],
})
export class HomeComponent {
  private cart = inject(CartService);
  readonly presupuestoQuince = PRESUPUESTO_QUINCE;
  serviciosQuince = computed(() =>
    this.cart.serviciosDisponibles().filter((servicio) => servicio.categoria === '15_años'),
  );
  serviciosBodas = computed(() =>
    this.cart.serviciosDisponibles().filter((servicio) => servicio.categoria === 'bodas'),
  );

  formatearPrecio(precio: number): string {
    return `$ ${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(precio)}`;
  }

  get precioEfectivo(): number {
    return this.presupuestoQuince.precioLista * (1 - this.presupuestoQuince.descuentoEfectivoPorcentaje / 100);
  }

  get descuentoEfectivo(): number {
    return this.presupuestoQuince.precioLista - this.precioEfectivo;
  }

  get reservaLista(): number {
    return this.presupuestoQuince.precioLista * (this.presupuestoQuince.reservaPorcentaje / 100);
  }

  get saldoLista(): number {
    return this.presupuestoQuince.precioLista * (this.presupuestoQuince.saldoPorcentaje / 100);
  }

  get reservaEfectivo(): number {
    return this.precioEfectivo * (this.presupuestoQuince.reservaPorcentaje / 100);
  }

  get saldoEfectivo(): number {
    return this.precioEfectivo * (this.presupuestoQuince.saldoPorcentaje / 100);
  }
}