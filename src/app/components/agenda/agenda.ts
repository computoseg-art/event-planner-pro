// src/app/components/agenda/agenda.ts

//Este componente maneja la agenda de reservas de eventos en la aplicación.
//Proporciona funcionalidades para seleccionar fechas, agregar y actualizar reservas, 
//procesar pagos y verificar el estado de las reservas.
//También incluye validaciones para bloquear días ocupados o con menos de 3 días de anticipación, 
// y para determinar si una reserva está pagada o caducada.

import { Component, signal, computed, inject, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ReservaService, Reserva } from '../../services/reserva.service';
import { AuthService } from '../../services/auth.service';
import { CartService } from '../../services/cart.service';
import { take } from 'rxjs';

@Component({
  selector: 'app-agenda',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './agenda.html',
  styleUrls: ['./agenda.css', './agenda-modal.css'],
})
export class AgendaComponent implements OnInit {
  rs = inject(ReservaService);
  auth = inject(AuthService);
  cart = inject(CartService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  fechaSeleccionada = signal<string | null>(null);
  miDescripcion = signal<string>('');
  reservaExpandida = signal<string | null>(null);
  fechaHoy = signal<Date>(new Date());
  readonly fechaMaximaReservas = this.calcularFechaMaxima();
  categoriaPrevia = signal<'15_años' | 'bodas' | null>(null);
  categoriaServicios = signal<'15_años' | 'bodas' | 'extras' | null>(null);
  estaCerrando = signal<boolean>(false);

  totalParaReserva = computed(() => this.cart.totalCarrito());
  pagoSenia = computed(() => this.cart.montoSenia());

  ngOnInit() {
    this.route.queryParams.pipe(take(1)).subscribe((params) => {
      const paymentId = params['payment_id'] || params['collection_id'];
      const externalReference = params['external_reference'];

      if (paymentId && externalReference) {
        this.confirmarRetornoPago(String(paymentId), String(externalReference));
      }
    });
  }

  private async confirmarRetornoPago(paymentId: string, externalReference: string) {
    try {
      const result = await this.rs.confirmarPago(paymentId, externalReference);
      if (result.status === 'approved') {
        alert('¡Pago confirmado por Mercado Pago!');
      } else {
        alert('El pago todavía está pendiente de confirmación. La agenda se actualizará cuando Mercado Pago lo apruebe.');
      }
    } catch (error) {
      console.error('No se pudo verificar el pago:', error);
      alert(error instanceof Error ? error.message : 'No se pudo verificar el pago con Mercado Pago.');
    } finally {
      await this.router.navigate([], { queryParams: {}, replaceUrl: true });
    }
  }

  // --- VALIDACIONES DE FECHA Y SEGURIDAD ---

  esDiaOcupado(fecha: string): boolean {
    if (!fecha) return false;
    const fechaLimpia = fecha.split('T')[0];
    return this.rs.fechasOcupadas().has(fechaLimpia);
  }

  // REGLA 1: Verificar si un día está deshabilitado (ocupado o con menos de 3 días de anticipación)
  esDiaBloqueado(dia: string): boolean {
    if (!dia) return true;

    const [year, month, day] = dia.split('T')[0].split('-').map(Number);
    const fechaEvaluada = new Date(year, month - 1, day);
    fechaEvaluada.setHours(0, 0, 0, 0);
    const fechaMaxima = new Date(this.fechaMaximaReservas);
    fechaMaxima.setHours(0, 0, 0, 0);
    if (fechaEvaluada > fechaMaxima) return true;

    // 1. Si ya está ocupado
    if (this.esDiaOcupado(dia)) return true;

    // 2. Control de los 3 días mínimos de anticipación
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const diffTiempo = fechaEvaluada.getTime() - hoy.getTime();
    const diffDias = diffTiempo / (1000 * 60 * 60 * 24);

    return diffDias < 3;
  }

  // REGLA 2: Verificar si una reserva caducó por no saldarse/pagarse 2 días antes del evento
  esReservaCaducada(reserva: Reserva): boolean {
    const total = Number(reserva.total || 0);
    const pagado = Number(reserva.pagado || 0);

    // Si ya está 100% saldada, no caduca
    if (pagado >= total) return false;
    if (reserva.estado === 'caducada') return true;

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const [year, month, day] = reserva.fecha.split('T')[0].split('-').map(Number);
    const fechaEvento = new Date(year, month - 1, day);
    fechaEvento.setHours(0, 0, 0, 0);

    // Fecha límite de pago = 2 días antes del evento
    const fechaLimite = new Date(fechaEvento);
    fechaLimite.setDate(fechaEvento.getDate() - 2);

    return hoy > fechaLimite;
  }

  estadoVisible(reserva: Reserva): 'pendiente' | 'pagado' | 'caducada' {
    if (this.esReservaCaducada(reserva)) return 'caducada';

    const total = Number(reserva.total || 0);
    const pagado = Number(reserva.pagado || 0);
    return total > 0 && pagado >= total ? 'pagado' : 'pendiente';
  }

  // REGLA 3: Verificar si una reserva está completada o caducada (bloqueada para edición)
  esReservaBloqueada(res: Reserva): boolean {
    const esCompletada =
      res.estado === 'pagado' ||
      res.estado === 'completado' ||
      (res.total > 0 && (res.pagado || 0) >= res.total);
    const esCaducada = this.esReservaCaducada(res);

    // Los clientes no pueden editar si está completada o caducada. Los admin conservan permisos.
    return (esCompletada || esCaducada) && !this.auth.esAdmin();
  }

  // --- NAVEGACIÓN Y CALENDARIO ---

  getFechaCabecera() {
    return this.fechaHoy();
  }

  private calcularFechaMaxima(): Date {
    const fechaMaxima = new Date();
    fechaMaxima.setFullYear(fechaMaxima.getFullYear() + 2);
    fechaMaxima.setHours(0, 0, 0, 0);
    return fechaMaxima;
  }

  limiteSuperiorAlcanzado(): boolean {
    const fechaActual = this.fechaHoy();
    return (
      fechaActual.getFullYear() > this.fechaMaximaReservas.getFullYear() ||
      (fechaActual.getFullYear() === this.fechaMaximaReservas.getFullYear() &&
        fechaActual.getMonth() >= this.fechaMaximaReservas.getMonth())
    );
  }

  cambiarMes(delta: number) {
    if (delta > 0 && this.limiteSuperiorAlcanzado()) return;

    const fechaActual = this.fechaHoy();
    const nuevaFecha = new Date(fechaActual.getFullYear(), fechaActual.getMonth() + delta, 1);
    this.fechaHoy.set(nuevaFecha);
  }

  diasEnBlanco() {
    const fecha = this.fechaHoy();
    const primerDia = new Date(fecha.getFullYear(), fecha.getMonth(), 1).getDay();
    return primerDia === 0 ? 6 : primerDia - 1;
  }

  diasDelMes(): string[] {
    const fecha = this.fechaHoy();
    const año = fecha.getFullYear();
    const mes = fecha.getMonth();
    const cantidadDias = new Date(año, mes + 1, 0).getDate();

    return Array.from({ length: cantidadDias }, (_, i) => {
      const d = new Date(año, mes, i + 1);
      const y = d.getFullYear();
      const m = (d.getMonth() + 1).toString().padStart(2, '0');
      const day = d.getDate().toString().padStart(2, '0');
      return `${y}-${m}-${day}`;
    });
  }

  esMiReserva(dia: string): boolean {
    const reserva = this.rs.reservas().find((r: Reserva) => {
      const fechaReserva = r.fecha.split('T')[0];
      return fechaReserva === dia;
    });
    return !!reserva && reserva.usuario === this.auth.usuarioLogueado();
  }

  seleccionarDia(dia: string) {
    if (this.esDiaBloqueado(dia)) {
      this.cerrarConAnimacion();
      return;
    }

    if (this.fechaSeleccionada() === dia) {
      this.cerrarConAnimacion();
    } else {
      this.estaCerrando.set(false);
      this.cart.reset();
      this.miDescripcion.set('');
      this.categoriaPrevia.set(null);
      this.categoriaServicios.set(null);
      this.fechaSeleccionada.set(dia);
    }
  }

  seleccionarCategoria(categoria: '15_años' | 'bodas' | 'extras'): void {
    this.categoriaServicios.set(categoria);
    if (categoria !== 'extras') {
      if (this.categoriaPrevia() && this.categoriaPrevia() !== categoria) {
        this.cart.serviciosSeleccionados.update((seleccionados) =>
          seleccionados.filter((servicio) => servicio.categoria === 'extras'),
        );
      }
      this.categoriaPrevia.set(categoria);
    }
    this.cart.setCategoria(categoria);
  }

  @HostListener('document:keydown.escape')
  cerrarModalConEscape(): void {
    if (this.fechaSeleccionada()) {
      this.cerrarConAnimacion();
    }
  }

  cerrarConAnimacion() {
    if (!this.fechaSeleccionada() || this.estaCerrando()) return;

    this.estaCerrando.set(true);

    setTimeout(() => {
      this.fechaSeleccionada.set(null);
      this.estaCerrando.set(false);
    }, 250);
  }

  toggleEditar(id: string) {
    const res = this.rs.reservas().find((r) => r.id === id);

    // Impedir desplegar el panel de edición si está completada o caducada
    if (res && this.esReservaBloqueada(res)) {
      return;
    }

    this.reservaExpandida.update((v) => (v === id ? null : id));
  }

  estaSeleccionado(res: Reserva, servicioId: string): boolean {
    return res.servicios?.some((s: any) => s.id === servicioId) || false;
  }

  toggleServicioEnReserva(res: Reserva, servicio: any) {
    if (this.esReservaBloqueada(res)) return;

    if (!res.servicios) res.servicios = [];

    const index = res.servicios.findIndex((s: any) => s.id === servicio.id);
    if (index > -1) {
      res.servicios.splice(index, 1);
    } else {
      res.servicios.push(servicio);
    }

    res.total = res.servicios.reduce((acc: number, s: any) => acc + (s.precio || 0), 0);
  }

  async confirmar() {
    if (
      !this.fechaSeleccionada() ||
      !this.miDescripcion().trim() ||
      !this.categoriaPrevia() ||
      this.totalParaReserva() === 0
    ) {
      alert('Faltan datos obligatorios');
      return;
    }

    if (this.esDiaBloqueado(this.fechaSeleccionada()!)) {
      alert('La reserva debe realizarse con al menos 3 días de anticipación.');
      return;
    }

    try {
      await this.rs.agregar(
        this.fechaSeleccionada()!,
        this.miDescripcion(),
        this.totalParaReserva(),
        [...this.cart.serviciosSeleccionados()],
        this.categoriaPrevia()!
      );
      this.cart.reset();
      this.miDescripcion.set('');
      this.categoriaPrevia.set(null);
      this.categoriaServicios.set(null);
      alert('¡Reserva confirmada!');
      this.cerrarConAnimacion();
    } catch (e) {
      console.error('Error al confirmar:', e);
    }
  }

  async actualizar(res: Reserva) {
    if (this.esReservaBloqueada(res)) {
      alert('Esta reserva está completada o caducada y no se puede modificar.');
      return;
    }

    const sinServicios = !res.servicios || res.servicios.length === 0;
    if (sinServicios && res.total === 0) {
      if (confirm('La reserva no tiene servicios. ¿Deseas eliminarla para liberar el día?')) {
        await this.eliminar(res);
        return;
      }
    }

    try {
      await this.rs.actualizar(res);
      this.reservaExpandida.set(null);
      alert('Cambios guardados');
    } catch (e) {
      console.error('Error al actualizar:', e);
    }
  }

  async pagarReservaIndividual(res: Reserva) {
    if (this.esReservaCaducada(res)) {
      alert('Esta reserva ha caducado por superar la fecha límite de pago (2 días antes del evento).');
      return;
    }

    const pendiente = res.total - (res.pagado || 0);
    if (pendiente <= 0) {
      alert('Esta reserva ya está totalmente saldada.');
      return;
    }

    try {
      await this.rs.procesarPago(res);
    } catch (e) {
      console.error('Error al procesar el pago:', e);
    }
  }

  async eliminar(res: Reserva) {
    if (!res.id) return;

    if (this.esReservaBloqueada(res)) {
      alert('No se pueden eliminar reservas completadas o caducadas.');
      return;
    }

    try {
      await this.rs.eliminar(res);
      this.reservaExpandida.set(null);

      if (this.fechaSeleccionada() === res.fecha) {
        this.fechaSeleccionada.set(null);
      }
    } catch (e) {
      console.error('Error al eliminar:', e);
    }
  }
}