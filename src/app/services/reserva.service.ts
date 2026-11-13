import { Injectable, computed, inject, EnvironmentInjector, runInInjectionContext, signal } from '@angular/core';
import { Database, ref, objectVal } from '@angular/fire/database';
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
  descuento?: number;
  pagado: number;
  seniaConfirmadaAt?: string;
  planCuotas?: PlanCuotasReserva;
  pagosEfectivo?: Record<string, PagoEfectivoReserva>;
  estado: 'pendiente' | 'pagado' | 'caducada' | 'completado';
}

export interface CuotaReserva {
  id: string;
  numero: number;
  vencimiento: string;
  monto: number;
}

export interface PlanCuotasReserva {
  createdAt: string;
  cuotas: CuotaReserva[];
}

export interface PagoEfectivoReserva {
  id: string;
  monto: number;
  moneda: string;
  metodoPago: 'efectivo';
  estado: 'pendiente_confirmacion' | 'en_revision' | 'confirmado' | 'rechazado';
  fecha: string;
  registradoPor: string;
  usuario: string;
  reservaId: string;
  cuotaId?: string | null;
  descripcion: string;
  confirmadoAt?: string;
  reportadoAt?: string;
  motivo?: string;
  resueltoAt?: string;
  pagadoAntes?: number;
  saldoDespues?: number;
}

export interface PagoHistorial {
  id?: string;
  fecha: string;
  monto: number;
  paymentId: string;
  descripcion: string;
  usuario: string;
  externalReference?: string;
  tipoPago?: 'senia' | 'total';
  metodoPago?: 'mercado_pago' | 'efectivo';
  moneda?: string;
  reservas?: DetallePagoReserva[];
}

export interface DetallePagoReserva {
  id?: string;
  descripcion: string;
  fecha: string;
  tipoEvento?: '15_años' | 'bodas';
  monto: number;
  total: number;
  pagadoAntes: number;
  saldoDespues?: number;
  descuento?: number;
  servicios?: Array<string | DetalleServicioPago>;
}

export interface DetalleServicioPago {
  id?: string;
  nombre: string;
  categoria?: string;
  precio: number;
}

@Injectable({ providedIn: 'root' })
export class ReservaService {
  private db = inject(Database);
  private auth = inject(AuthService);
  private injector = inject(EnvironmentInjector);

  // --- SEÑAL DE ESTADO DE CARGA GLOBAL DE PAGO ---
  cargandoPago = signal<boolean>(false);
  private reservationMaintenanceUid = '';

  // --- STREAM DE DATOS: RESERVAS ---
  private todasLasReservas$ = this.auth.user$.pipe(
    switchMap((u) => {
      if (!u || !u.email) {
        this.reservationMaintenanceUid = '';
        return of([]);
      }

      this.runReservationMaintenance(u.uid);

      const esAdmin = ['admin@gmail.com', 'estebangarriga@gmail.com'].includes(
        u.email.toLowerCase()
      );
      const emailSanitizado = u.email.toLowerCase().replace(/\./g, ',');
      const dbPath = esAdmin ? 'reservas' : `reservas/${emailSanitizado}`;

      return runInInjectionContext(this.injector, () => {
        return (objectVal(ref(this.db, dbPath)) as Observable<any>).pipe(
          map((data) => {
            if (!data) return [];
            const listaPlana: Reserva[] = [];
            const usuarios = esAdmin ? data : { [emailSanitizado]: data };

            Object.keys(usuarios).forEach((userKey) => {
              const nodoUsuario = usuarios[userKey];
              if (nodoUsuario && typeof nodoUsuario === 'object') {
                Object.keys(nodoUsuario).forEach((resKey) => {
                  const res = nodoUsuario[resKey];
                  if (res && res.fecha) {
                    listaPlana.push({
                      ...res,
                      id: resKey,
                      usuario: (res.usuario || userKey.replace(/,/g, '.')).trim(),
                    });
                  }
                });
              }
            });

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

  private readonly fechasOcupadas$ = this.auth.user$.pipe(
    switchMap((u) => {
      if (!u) return of([] as string[]);

      return runInInjectionContext(this.injector, () =>
        (objectVal(ref(this.db, 'fechas_ocupadas')) as Observable<Record<string, string> | null>).pipe(
          map((data) => (data ? Object.values(data).map((fecha) => fecha.split('T')[0].trim()) : [])),
          catchError((err) => {
            console.error('Error al leer fechas ocupadas:', err);
            return of([] as string[]);
          })
        )
      );
    })
  );

  private fechasOcupadasSignal = toSignal(this.fechasOcupadas$, { initialValue: [] as string[] });

  // --- STREAM DE DATOS: HISTORIAL DE PAGOS ---
  private todoElHistorial$ = this.auth.user$.pipe(
    switchMap((u) => {
      if (!u || !u.email) return of([]);

      const esAdmin = ['admin@gmail.com', 'estebangarriga@gmail.com'].includes(
        u.email.toLowerCase()
      );
      const emailSanitizado = u.email.toLowerCase().replace(/\./g, ',');
      const dbPath = esAdmin ? 'historial_pagos' : `historial_pagos/${emailSanitizado}`;

      return runInInjectionContext(this.injector, () => {
        return (objectVal(ref(this.db, dbPath)) as Observable<any>).pipe(
          map((data) => {
            if (!data) return [];
            const lista: PagoHistorial[] = [];

            if (esAdmin) {
              Object.keys(data).forEach((userKey) => {
                const nodoUsuario = data[userKey];
                if (nodoUsuario && typeof nodoUsuario === 'object') {
                  Object.keys(nodoUsuario).forEach((pagoKey) => {
                    const item = nodoUsuario[pagoKey];
                    if (item) {
                      lista.push({ ...item, id: pagoKey });
                    }
                  });
                }
              });
            } else {
              Object.keys(data).forEach((pagoKey) => {
                const item = data[pagoKey];
                if (item) {
                  lista.push({ ...item, id: pagoKey });
                }
              });
            }

            return lista.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
          }),
          catchError((err) => {
            console.error('Error al leer historial:', err);
            return of([]);
          })
        );
      });
    })
  );

  historial = toSignal(this.todoElHistorial$, { initialValue: [] as PagoHistorial[] });
  historialCompleto = computed(() => [
    ...this.historial(),
    ...this.reservas().flatMap((reserva) =>
      Object.values(reserva.pagosEfectivo || {})
        .filter((pago) => pago.estado === 'confirmado')
        .map((pago) => ({
          id: pago.id,
          fecha: pago.confirmadoAt || pago.fecha,
          monto: pago.monto,
          paymentId: pago.id,
          descripcion: pago.descripcion,
          usuario: reserva.usuario,
          tipoPago: 'total' as const,
          metodoPago: 'efectivo' as const,
          moneda: pago.moneda,
          reservas: [{
            id: reserva.id,
            descripcion: reserva.descripcion,
            fecha: reserva.fecha,
            tipoEvento: reserva.tipoEvento,
            monto: pago.monto,
            total: reserva.total,
            pagadoAntes: pago.pagadoAntes ?? Math.max(0, Number(reserva.pagado || 0) - pago.monto),
            saldoDespues: pago.saldoDespues ?? Math.max(0, Number(reserva.total) - Number(reserva.pagado || 0)),
          }],
        })),
    ),
  ]);

  // --- SEÑALES COMPUTADAS ---

  reservasVisibles = computed(() => {
    const email = this.auth.usuarioLogueado()?.trim().toLowerCase();
    const todas = this.reservas();

    if (!email) return [];
    if (this.auth.esAdmin()) return todas;

    return todas.filter((r) => r.usuario?.trim().toLowerCase() === email);
  });

  reservasPendientesPago = computed(() =>
    this.reservasVisibles().filter(
      (reserva) =>
        reserva.estado !== 'caducada' &&
        reserva.estado !== 'completado' &&
        Number(reserva.total) > Number(reserva.pagado || 0),
    ),
  );

  historialVisibles = computed(() => {
    const email = this.auth.usuarioLogueado();
    const todos = this.historialCompleto();
    if (!email) return [];
    if (this.auth.esAdmin()) return todos;
    return todos.filter((h) => h.usuario?.toLowerCase() === email.toLowerCase());
  });

deudaTotal = computed(() => {
  return this.reservasVisibles().reduce((acc, res) => {
      // Verificamos si la reserva está caducada por fecha o por estado
      // (Asumiendo que las comparas con la fecha del evento o un indicador de caducidad)
      const fechaEvento = res.fecha ? res.fecha.split('T')[0].trim() : '';

      // El saldo debe pagarse como máximo tres días antes del evento.
      const [year, month, day] = fechaEvento.split('-').map(Number);
      const dEvento = new Date(year, month - 1, day);
      dEvento.setHours(0, 0, 0, 0);

      const limitePago = new Date(dEvento);
      limitePago.setDate(dEvento.getDate() - 3);

      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);

      const estaCaducada = hoy > limitePago;

      // No se suma deuda de reservas vencidas o ya saldadas.
      if (
        estaCaducada ||
        res.planCuotas ||
        ['caducada', 'pagado', 'completado'].includes(res.estado)
      ) {
        return acc;
      }

      const pagosEfectivoPendientes = Object.values(res.pagosEfectivo || {})
        .filter((pago) => ['pendiente_confirmacion', 'en_revision'].includes(pago.estado))
        .reduce((total, pago) => total + Number(pago.monto || 0), 0);
      return acc + Math.max(0, Number(res.total) - Number(res.pagado || 0) - pagosEfectivoPendientes);
    }, 0);
  });

  fechasOcupadas = computed(() => {
    const hoyStr = new Date().toLocaleDateString('sv');
    const fechas = new Set(this.fechasOcupadasSignal());

    if (this.auth.esAdmin()) {
      this.reservas()
        .filter((r) => r && r.fecha && r.estado !== 'caducada' && !this.fechaFueraDePlazo(r.fecha))
        .map((r) => r.fecha.split('T')[0].trim())
        .forEach((fecha) => fechas.add(fecha));
    }

    return new Set([...fechas].filter((fecha) => fecha >= hoyStr));
  });

  private fechaFueraDePlazo(fecha: string): boolean {
    const date = fecha.split('T')[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const eventTimestamp = Date.parse(`${date}T00:00:00.000Z`);
    if (!Number.isFinite(eventTimestamp)) return false;
    const todayParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Montevideo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const part = (type: string) => Number(todayParts.find((item) => item.type === type)?.value);
    const todayTimestamp = Date.UTC(part('year'), part('month') - 1, part('day'));
    return Math.floor((eventTimestamp - todayTimestamp) / 86400000) < 3;
  }

  // --- MÉTODOS CRUD DE RESERVAS ---

  private runReservationMaintenance(uid: string) {
    if (this.reservationMaintenanceUid === uid) return;
    this.reservationMaintenanceUid = uid;
    void this.requestReservationApi('/maintenance', 'POST', {}).catch((error) => {
      this.reservationMaintenanceUid = '';
      console.error('No se pudieron actualizar las reservas vencidas:', error);
    });
  }

  private async requestReservationApi<T>(
    path: string,
    method: 'POST' | 'PUT' | 'DELETE',
    body: object,
  ): Promise<T> {
    const idToken = await this.auth.obtenerIdToken();
    const response = await fetch(`${environment.apiUrl}/api/reservations${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'No se pudo completar la operación de reserva.');
    }
    return data as T;
  }

  async agregar(
    fecha: string,
    desc: string,
    total: number,
    servicios: any[],
    tipoEvento: string,
    descuento = 0,
  ) {
    const email = this.auth.usuarioLogueado();
    if (!email) {
      throw new Error('Debes iniciar sesión para crear una reserva.');
    }
    const nuevaReserva = {
      fecha,
      descripcion: desc,
      tipoEvento: tipoEvento as '15_años' | 'bodas',
      servicios: servicios,
      total: Number(total),
      descuento: Number(descuento),
    };
    const guardada = await this.requestReservationApi<Reserva & { id: string }>(
      '',
      'POST',
      nuevaReserva,
    );

    try {
      const idToken = await this.auth.obtenerIdToken();
      const response = await fetch(`${environment.apiUrl}/api/reservation-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ id: guardada.id }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'No se pudo enviar el aviso de la reserva.');
      }
      return true;
    } catch (error) {
      console.error('La reserva se guardó, pero no se pudo enviar el aviso por correo:', error);
      return false;
    }
  }

  async actualizar(res: Reserva) {
    if (!res.id || !res.usuario) return;
    await this.requestReservationApi<Reserva>(`/${encodeURIComponent(res.id)}`, 'PUT', {
      ...res,
      total: Number(res.total),
      descuento: Number(res.descuento || 0),
    });
  }

  async crearPlanCuotas(reserva: Reserva): Promise<PlanCuotasReserva> {
    if (!reserva.id) throw new Error('La reserva no tiene un identificador válido.');
    return this.requestReservationApi<PlanCuotasReserva>(
      `/${encodeURIComponent(reserva.id)}/installment-plan`,
      'POST',
      { usuario: reserva.usuario },
    );
  }

  async registrarPagoEfectivo(
    reserva: Reserva,
    monto: number,
    cuotaId?: string,
  ): Promise<PagoEfectivoReserva> {
    if (!reserva.id) throw new Error('La reserva no tiene un identificador válido.');
    return this.requestReservationApi<PagoEfectivoReserva>(
      `/${encodeURIComponent(reserva.id)}/cash-payments`,
      'POST',
      { usuario: reserva.usuario, monto, cuotaId },
    );
  }

  async actualizarPagoEfectivo(
    reserva: Reserva,
    pago: PagoEfectivoReserva,
    accion: 'confirm' | 'dispute' | 'resolve',
    decision?: 'confirm' | 'reject',
    motivo?: string,
  ): Promise<PagoEfectivoReserva> {
    if (!reserva.id || !pago.id) throw new Error('El pago no tiene un identificador válido.');
    return this.requestReservationApi<PagoEfectivoReserva>(
      `/${encodeURIComponent(reserva.id)}/cash-payments/${encodeURIComponent(pago.id)}/${accion}`,
      'POST',
      { usuario: reserva.usuario, decision, motivo },
    );
  }

  async eliminar(res: Reserva) {
    if (!res.id || !res.usuario) return;
    await this.requestReservationApi<{ id: string }>(
      `/${encodeURIComponent(res.id)}`,
      'DELETE',
      { usuario: res.usuario },
    );
  }

  // --- MÉTODOS DE PAGO E HISTORIAL ---

  private async postPago(path: string, body: object) {
    const idToken = await this.auth.obtenerIdToken();
    const response = await fetch(`${environment.apiUrl}/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'No se pudo completar la operación de pago.');
    }

    return data;
  }

  async procesarPagoReservaIndividual(reserva: Reserva, tipoPago: 'senia' | 'total' = 'total') {
    const pendiente = Number(reserva.total) - Number(reserva.pagado || 0);

    if (pendiente <= 0) {
      alert('Esta reserva ya se encuentra totalmente saldada.');
      return;
    }

    if (tipoPago === 'senia' && Number(reserva.pagado || 0) > 0) {
      alert('La seña solo está disponible antes de realizar el primer pago.');
      return;
    }

    this.cargandoPago.set(true);
    await new Promise((resolve) => setTimeout(resolve, 50));

    try {
      const data = await this.postPago('create_preference', {
        id: reserva.id,
        tipo_pago: tipoPago,
      });
      if (data.init_point) {
        window.location.href = data.init_point;
      } else {
        throw new Error('Mercado Pago no devolvió el enlace de pago.');
      }
    } catch (error) {
      console.error('Error al procesar pago individual:', error);
      this.cargandoPago.set(false);
      alert(error instanceof Error ? error.message : 'Error al conectar con el servidor de pagos.');
    }
  }

  async confirmarPago(paymentId: string, externalReference: string) {
    return this.postPago('confirm_payment', {
      payment_id: paymentId,
      external_reference: externalReference,
    });
  }

  async procesarPago(reserva?: Pick<Reserva, 'id'>, tipoPago: 'senia' | 'total' = 'total') {
    this.cargandoPago.set(true);
    await new Promise((resolve) => setTimeout(resolve, 50));

    try {
      const data = await this.postPago('create_preference', {
        id: reserva?.id || 'pago-general',
        tipo_pago: tipoPago,
      });
      if (data.init_point) {
        window.location.href = data.init_point;
      } else {
        throw new Error('Mercado Pago no devolvió el enlace de pago.');
      }
    } catch (error) {
      console.error('Error en pago:', error);
      this.cargandoPago.set(false);
      alert(error instanceof Error ? error.message : 'Error al conectar con el servidor de pagos.');
    }
  }
}
