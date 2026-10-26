import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import {
  DetallePagoReserva,
  PagoHistorial,
  Reserva,
  ReservaService,
} from '../../services/reserva.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './profile.html',
  styleUrl: './profile.css',
})
export class ProfileComponent {
  private readonly auth = inject(AuthService);
  private readonly reservasService = inject(ReservaService);

  readonly usuario = this.auth.userSignal;
  readonly email = this.auth.usuarioLogueado;
  readonly comprobanteSeleccionado = signal<PagoHistorial | null>(null);

  readonly misPagos = computed(() => {
    const email = this.email();
    if (!email) return [];
    return this.reservasService
      .historial()
      .filter((pago) => pago.usuario?.trim().toLowerCase() === email)
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  });

  readonly misReservas = computed(() => {
    const email = this.email();
    if (!email) return [];
    return this.reservasService
      .reservas()
      .filter((reserva) => reserva.usuario?.trim().toLowerCase() === email)
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  });

  readonly totalPagado = computed(() =>
    this.misPagos().reduce((total, pago) => total + Number(pago.monto || 0), 0),
  );

  formatoMonto(monto: number, moneda = 'UYU'): string {
    return new Intl.NumberFormat('es-UY', {
      style: 'currency',
      currency: moneda,
      minimumFractionDigits: 2,
    }).format(Number(monto) || 0);
  }

  esSenia(pago: PagoHistorial): boolean {
    return pago.tipoPago === 'senia' || /seña|senia/i.test(pago.descripcion || '');
  }

  etiquetaEstado(reserva: Reserva): string {
    if (reserva.estado === 'caducada') return 'Cancelada';
    if (Number(reserva.total) > 0 && Number(reserva.pagado || 0) >= Number(reserva.total)) {
      return 'Pagada';
    }
    return 'Pendiente';
  }

  saldoPendiente(reserva: Reserva): number {
    return Math.max(0, Number(reserva.total) - Number(reserva.pagado || 0));
  }

  descripcionServicios(detalle: DetallePagoReserva): string {
    if (!detalle.servicios?.length) return 'Servicios de la reserva';
    return detalle.servicios
      .map((servicio) => {
        if (typeof servicio === 'string') return servicio;
        return `${servicio.nombre} — ${this.formatoMonto(servicio.precio)}`;
      })
      .join(', ');
  }

  descargarComprobante(pago: PagoHistorial): void {
    this.comprobanteSeleccionado.set(pago);
    window.setTimeout(() => window.print(), 100);
  }
}
