import { Component, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReservaService, Reserva } from '../../services/reserva.service';
import { AuthService } from '../../services/auth.service';
import { CartService } from '../../services/cart.service';

@Component({
  selector: 'app-agenda',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './agenda.html',
  styleUrls: ['./agenda.css'],
})
export class AgendaComponent {
  rs = inject(ReservaService);
  auth = inject(AuthService);
  cart = inject(CartService);

  fechaSeleccionada = signal<string | null>(null);
  miDescripcion = signal<string>('');
  reservaExpandida = signal<string | null>(null);
  fechaHoy = signal<Date>(new Date());
  categoriaPrevia = signal<'15_años' | 'bodas' | null>(null);

  totalParaReserva = computed(() => this.cart.totalCarrito());
  pagoSenia = computed(() => this.cart.montoSenia());

  // ✅ CORREGIDO: Maneja strings de forma segura para no romper con toISOString()
  esDiaOcupado(fecha: string): boolean {
    if (!fecha) return false;
    const fechaLimpia = fecha.split('T')[0];

    return Array.from(this.rs.fechasOcupadas()).some((f: any) => {
      const fStr = typeof f === 'string' ? f.split('T')[0] : new Date(f).toISOString().split('T')[0];
      return fStr === fechaLimpia;
    });
  }

  getFechaCabecera() {
    return this.fechaHoy();
  }

  cambiarMes(delta: number) {
    const nuevaFecha = new Date(this.fechaHoy());
    nuevaFecha.setMonth(nuevaFecha.getMonth() + delta);
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

  // ✅ CORREGIDO: 'dia' llega como string desde diasDelMes()
  seleccionarDia(dia: string) {
    if (this.esDiaOcupado(dia)) {
      this.fechaSeleccionada.set(null);
      return;
    }

    this.fechaSeleccionada.set(dia);
  }

  toggleEditar(id: string) {
    this.reservaExpandida.update((v) => (v === id ? null : id));
  }

  estaSeleccionado(res: Reserva, servicioId: string): boolean {
    return res.servicios?.some((s: any) => s.id === servicioId) || false;
  }

  toggleServicioEnReserva(res: Reserva, servicio: any) {
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
    if (!this.fechaSeleccionada() || !this.miDescripcion() || !this.categoriaPrevia()) {
      alert('Faltan datos obligatorios');
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
      this.fechaSeleccionada.set(null);
      this.miDescripcion.set('');
      this.cart.reset();
      alert('¡Reserva confirmada!');
    } catch (e) {
      console.error('Error al confirmar:', e);
    }
  }

  async actualizar(res: Reserva) {
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

  async eliminar(res: Reserva) {
    if (!res.id) return;

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
