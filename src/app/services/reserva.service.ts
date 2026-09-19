import { Injectable, computed, inject, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { Database, ref, set, push, objectVal, remove } from '@angular/fire/database';
import { AuthService } from './auth.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { Observable, map, of, catchError, switchMap } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Reserva {
  id?: string;
  usuario: string;
  fecha: string;
  descripcion: string;
  tipoEvento: '15_años' | 'bodas';
  servicios: any[];
  total: number;
  pagado: number;
  estado: string;
}

@Injectable({ providedIn: 'root' })
export class ReservaService {
  private db = inject(Database);
  private auth = inject(AuthService);
  private injector = inject(EnvironmentInjector);

  // --- STREAM DE DATOS ---
  private todasLasReservas$ = this.auth.user$.pipe(
    switchMap((u) => {
      if (!u || !u.email) return of([]);

      const esAdmin = this.auth.esAdmin();
      const emailSanitizado = u.email.replace(/\./g, ',');

      // Si es Admin lee la raíz, si es Cliente lee solo su propio nodo
      const dbPath = esAdmin ? 'reservas' : `reservas/${emailSanitizado}`;

      // Envolvemos objectVal en el contexto de inyección de Angular
      return runInInjectionContext(this.injector, () => {
        return (objectVal(ref(this.db, dbPath)) as Observable<any>).pipe(
          map((data) => {
            if (!data) return [];
            const listaPlana: Reserva[] = [];

            if (esAdmin) {
              // Estructura Admin: { 'correo,com': { 'id_reserva': { ... } } }
              Object.keys(data).forEach((userKey) => {
                const nodoUsuario = data[userKey];
                if (nodoUsuario && typeof nodoUsuario === 'object') {
                  Object.keys(nodoUsuario).forEach((resKey) => {
                    const res = nodoUsuario[resKey];
                    if (res && res.fecha) {
                      listaPlana.push({
                        ...res,
                        id: resKey,
                        usuario: userKey.replace(/,/g, '.'),
                      });
                    }
                  });
                }
              });
            } else {
              // Estructura Cliente: { 'id_reserva': { ... } }
              Object.keys(data).forEach((resKey) => {
                const res = data[resKey];
                if (res && res.fecha) {
                  listaPlana.push({
                    ...res,
                    id: resKey,
                    usuario: u.email || '',
                  });
                }
              });
            }

            return listaPlana;
          }),
          catchError((err) => {
            console.error('Error al leer reservas:', err);
            return of([]);
          })
        );
      });
    })
  );

  reservas = toSignal(this.todasLasReservas$, { initialValue: [] as Reserva[] });

  // --- SEÑALES COMPUTADAS ---

  reservasVisibles = computed(() => {
    const email = this.auth.usuarioLogueado();
    const todas = this.reservas();
    if (!email) return [];
    if (this.auth.esAdmin()) return todas;
    return todas.filter((r) => r.usuario?.toLowerCase() === email.toLowerCase());
  });

  deudaTotal = computed(() => {
    return this.reservasVisibles().reduce((acc, res) => {
      return acc + (res.total - (res.pagado || 0));
    }, 0);
  });

  fechasOcupadas = computed(() => new Set(this.reservas().map((r) => r.fecha)));

  // --- MÉTODOS CRUD ---

  async agregar(fecha: string, desc: string, total: number, servicios: any[], tipoEvento: string) {
    const email = this.auth.usuarioLogueado();
    if (!email) return;
    const userPath = email.replace(/\./g, ',');
    const nuevaRef = push(ref(this.db, `reservas/${userPath}`));

    const nuevaReserva: Reserva = {
      id: nuevaRef.key || '',
      fecha,
      descripcion: desc,
      usuario: email,
      tipoEvento: tipoEvento as '15_años' | 'bodas',
      servicios: servicios,
      total: Number(total),
      pagado: 0,
      estado: 'pendiente',
    };

    return set(nuevaRef, nuevaReserva);
  }

  async actualizar(res: Reserva) {
    if (!res.id || !res.usuario) return;
    const userPath = res.usuario.replace(/\./g, ',');
    const itemRef = ref(this.db, `reservas/${userPath}/${res.id}`);
    return set(itemRef, {
      ...res,
      total: Number(res.total),
      pagado: Number(res.pagado),
    });
  }

  async eliminar(res: Reserva) {
    if (!res.id || !res.usuario) return;
    const userPath = res.usuario.replace(/\./g, ',');
    const itemRef = ref(this.db, `reservas/${userPath}/${res.id}`);
    return remove(itemRef);
  }

  async procesarPago(monto: number, reserva?: any) {
    try {
      const body: any = {
        total: monto,
        id: reserva?.id || 'pago-general',
        descripcion: reserva?.descripcion || 'Pago de Deuda Total - Agenda',
      };

      const response = await fetch(`${environment.apiUrl}/create_preference`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (data.init_point) {
        window.location.href = data.init_point;
      }
    } catch (error) {
      console.error('Error en pago:', error);
      alert('Error al conectar con el servidor de pagos.');
    }
  }

  // --- MÉTODOS DE HISTORIAL Y PAGO ---

// 1. Guardar en el historial de pagos
async registrarEnHistorial(email: string, monto: number, paymentId: string, descripcion: string) {
  const userPath = email.replace(/\./g, ',');
  const historialRef = push(ref(this.db, `historial_pagos/${userPath}`));

  const pago = {
    id: historialRef.key,
    fecha: new Date().toISOString(),
    monto: Number(monto),
    paymentId: paymentId || 'manual',
    descripcion,
    usuario: email
  };

  return set(historialRef, pago);
}

// 2. Saldar deuda de las reservas del usuario
async saldarDeudaUsuario(email: string, paymentId: string) {
  const reservasDelUsuario = this.reservasVisibles();

  if (reservasDelUsuario.length === 0) return;

  let montoTotalSaldado = 0;

  for (const res of reservasDelUsuario) {
    const deudaPendiente = res.total - (res.pagado || 0);
    if (deudaPendiente > 0) {
      montoTotalSaldado += deudaPendiente;
      // Actualizamos la reserva para que quede pagada al 100%
      await this.actualizar({
        ...res,
        pagado: res.total,
        estado: 'completado'
      });
    }
  }

  // Si se saldó algo, se registra en el historial
  if (montoTotalSaldado > 0) {
    await this.registrarEnHistorial(email, montoTotalSaldado, paymentId, 'Saldado de Deuda Total');
  }
}

}
