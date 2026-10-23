import { Injectable, computed, inject, EnvironmentInjector, runInInjectionContext, signal } from '@angular/core';
import { Database, ref, set, push, objectVal, remove, get, update } from '@angular/fire/database';
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
  estado: 'pendiente' | 'pagado' | 'caducada' | 'completado';
}

export interface PagoHistorial {
  id?: string;
  fecha: string;
  monto: number;
  paymentId: string;
  descripcion: string;
  usuario: string;
}

@Injectable({ providedIn: 'root' })
export class ReservaService {
  private db = inject(Database);
  private auth = inject(AuthService);
  private injector = inject(EnvironmentInjector);

  // --- SEÑAL DE ESTADO DE CARGA GLOBAL DE PAGO ---
  cargandoPago = signal<boolean>(false);
  private disponibilidadMigrada = false;
  private migrandoDisponibilidad = false;

  // --- STREAM DE DATOS: RESERVAS ---
  private todasLasReservas$ = this.auth.user$.pipe(
    switchMap((u) => {
      if (!u || !u.email) return of([]);

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

            if (esAdmin) this.migrarDisponibilidadInicial(listaPlana);
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

  // --- SEÑALES COMPUTADAS ---

  reservasVisibles = computed(() => {
    const email = this.auth.usuarioLogueado()?.trim().toLowerCase();
    const todas = this.reservas();

    if (!email) return [];
    if (this.auth.esAdmin()) return todas;

    return todas.filter((r) => r.usuario?.trim().toLowerCase() === email);
  });

  historialVisibles = computed(() => {
    const email = this.auth.usuarioLogueado();
    const todos = this.historial();
    if (!email) return [];
    if (this.auth.esAdmin()) return todos;
    return todos.filter((h) => h.usuario?.toLowerCase() === email.toLowerCase());
  });

deudaTotal = computed(() => {
    const hoyStr = new Date().toLocaleDateString('sv'); // 'YYYY-MM-DD' actual

    return this.reservasVisibles().reduce((acc, res) => {
      // Verificamos si la reserva está caducada por fecha o por estado
      // (Asumiendo que las comparas con la fecha del evento o un indicador de caducidad)
      const fechaEvento = res.fecha ? res.fecha.split('T')[0].trim() : '';

      // Calculamos si ya pasó el plazo límite de pago (2 días antes del evento, igual que en tu backend)
      const [year, month, day] = fechaEvento.split('-').map(Number);
      const dEvento = new Date(year, month - 1, day);
      dEvento.setHours(0, 0, 0, 0);

      const limitePago = new Date(dEvento);
      limitePago.setDate(dEvento.getDate() - 2);

      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);

      const estaCaducada = hoy > limitePago;

      // No se suma deuda de reservas vencidas o ya saldadas.
      if (estaCaducada || ['caducada', 'pagado', 'completado'].includes(res.estado)) {
        return acc;
      }

      return acc + (Number(res.total) - Number(res.pagado || 0));
    }, 0);
  });

  fechasOcupadas = computed(() => {
    const hoyStr = new Date().toLocaleDateString('sv');
    const fechas = new Set(this.fechasOcupadasSignal());

    if (this.auth.esAdmin()) {
      this.reservas()
        .filter((r) => r && r.fecha)
        .map((r) => r.fecha.split('T')[0].trim())
        .forEach((fecha) => fechas.add(fecha));
    }

    return new Set([...fechas].filter((fecha) => fecha >= hoyStr));
  });

  // --- MÉTODOS CRUD DE RESERVAS ---

  private async migrarDisponibilidadInicial(reservas: Reserva[]) {
    if (this.disponibilidadMigrada || this.migrandoDisponibilidad) return;
    this.migrandoDisponibilidad = true;

    try {
      const cambios: Record<string, string> = {};
      for (const reserva of reservas) {
        if (!reserva.id || !reserva.fecha) continue;
        cambios[`fechas_ocupadas/${reserva.id}`] = reserva.fecha;
      }

      if (Object.keys(cambios).length > 0) {
        await update(ref(this.db), cambios);
      }
      this.disponibilidadMigrada = true;
    } catch (error) {
      console.error('Error al inicializar el índice de fechas ocupadas:', error);
    } finally {
      this.migrandoDisponibilidad = false;
    }
  }

  async agregar(fecha: string, desc: string, total: number, servicios: any[], tipoEvento: string) {
    const email = this.auth.usuarioLogueado();
    if (!email) return;
    const userPath = email.toLowerCase().replace(/\./g, ',');
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

    await set(nuevaRef, nuevaReserva);
    try {
      await set(ref(this.db, `fechas_ocupadas/${nuevaRef.key}`), nuevaReserva.fecha);
    } catch (error) {
      console.error('No se pudo actualizar la disponibilidad de la reserva nueva:', error);
      await remove(nuevaRef);
      throw error;
    }
  }

  async actualizar(res: Reserva) {
    if (!res.id || !res.usuario) return;
    const userPath = res.usuario.toLowerCase().replace(/\./g, ',');
    const itemRef = ref(this.db, `reservas/${userPath}/${res.id}`);
    const snapshot = await get(itemRef);
    const anterior = snapshot.exists() ? (snapshot.val() as Reserva) : null;
    const fechaAnterior = anterior?.fecha;
    const fechaCambio = !!fechaAnterior && fechaAnterior !== res.fecha;

    if (fechaCambio) {
      await remove(ref(this.db, `fechas_ocupadas/${res.id}`));
    }

    try {
      await set(itemRef, {
        ...res,
        total: Number(res.total),
        pagado: Number(res.pagado),
        estado:
          Number(res.total) > 0 && Number(res.pagado) >= Number(res.total)
            ? 'pagado'
            : 'pendiente',
      });

      if (fechaAnterior !== res.fecha) {
        await set(ref(this.db, `fechas_ocupadas/${res.id}`), res.fecha);
      }
    } catch (error) {
      if (fechaCambio && anterior) {
        try {
          await set(itemRef, anterior);
          await set(ref(this.db, `fechas_ocupadas/${res.id}`), anterior.fecha);
        } catch (rollbackError) {
          console.error('No se pudo restaurar la reserva tras fallar la actualización:', rollbackError);
        }
      }
      throw error;
    }
  }

  async eliminar(res: Reserva) {
    if (!res.id || !res.usuario) return;
    const userPath = res.usuario.toLowerCase().replace(/\./g, ',');
    const itemRef = ref(this.db, `reservas/${userPath}/${res.id}`);
    const disponibilidadRef = ref(this.db, `fechas_ocupadas/${res.id}`);
    await remove(disponibilidadRef);
    try {
      await remove(itemRef);
    } catch (error) {
      await set(disponibilidadRef, res.fecha);
      throw error;
    }
  }

  // --- MÉTODOS DE PAGO E HISTORIAL ---

  async registrarEnHistorial(email: string, monto: number, paymentId: string, descripcion: string) {
    const userPath = email.toLowerCase().replace(/\./g, ',');
    const historialRef = push(ref(this.db, `historial_pagos/${userPath}`));

    const pago: PagoHistorial = {
      id: historialRef.key || undefined,
      fecha: new Date().toISOString(),
      monto: Number(monto),
      paymentId: paymentId || 'manual',
      descripcion,
      usuario: email,
    };

    return set(historialRef, pago);
  }

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

  async procesarPagoReservaIndividual(reserva: Reserva) {
    const pendiente = Number(reserva.total) - Number(reserva.pagado || 0);

    if (pendiente <= 0) {
      alert('Esta reserva ya se encuentra totalmente saldada.');
      return;
    }

    this.cargandoPago.set(true);
    await new Promise((resolve) => setTimeout(resolve, 50));

    try {
      const data = await this.postPago('create_preference', { id: reserva.id });
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

  async procesarPago(reserva?: Pick<Reserva, 'id'>) {
    this.cargandoPago.set(true);
    await new Promise((resolve) => setTimeout(resolve, 50));

    try {
      const data = await this.postPago('create_preference', {
        id: reserva?.id || 'pago-general',
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
