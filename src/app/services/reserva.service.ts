import { Injectable, computed, inject, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { Database, ref, set, push, objectVal, remove, get } from '@angular/fire/database';
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

export interface PagoHistorial {
  id?: string;
  fecha: string;
  monto: number;
  paymentId: string;
  descripcion: string;
  usuario: string;
}

@Injectable({ providedIn: 'root' }) // registrar el servicio como singleton en toda la aplicación. El singleton es importante para que las señales y observables se compartan entre componentes.
export class ReservaService {
  private db = inject(Database);
  private auth = inject(AuthService);
  private injector = inject(EnvironmentInjector); // Inyectar EnvironmentInjector para usar runInInjectionContext y mantener el contexto de inyección de dependencias en los observables.
                                                  // en pocas palabras, permite que los observables tengan acceso a los servicios inyectados como AuthService y Database.

  // --- STREAM DE DATOS: RESERVAS ---
  private todasLasReservas$ = this.auth.user$.pipe(
    switchMap((u) => {  // switchMap permite cambiar de un observable a otro, en este caso, de user$ a la lista de reservas del usuario.
      if (!u || !u.email) return of([]); // Si no hay usuario logueado, retorna un observable de lista vacía. sirve para evitar errores cuando el usuario no está logueado y se intenta acceder a sus reservas.

      const esAdmin = this.auth.esAdmin();
      const emailSanitizado = u.email.replace(/\./g, ','); // Remplaza los puntos en el email por comas para usarlo como clave en Firebase, ya que Firebase no permite puntos en las claves de los nodos.
      const dbPath = esAdmin ? 'reservas' : `reservas/${emailSanitizado}`; // Si el usuario es admin, se accede a todas las reservas, si no, solo a las reservas del usuario logueado.

      return runInInjectionContext(this.injector, () => { // runInInjectionContext permite ejecutar el observable dentro del contexto de inyección de dependencias,
                                                          // asegurando que los servicios inyectados estén disponibles dentro del observable.
                                                          // Esto es importante porque los observables pueden ejecutarse fuera del contexto de Angular,
                                                          // y sin esto, los servicios inyectados podrían no estar disponibles.
        return (objectVal(ref(this.db, dbPath)) as Observable<any>).pipe( // objectVal obtiene el valor del nodo de Firebase como un observable,
                                                                          // y ref crea una referencia al nodo especificado en la base de datos.
          map((data) => {
            if (!data) return []; // Si no hay datos, retorna una lista vacía.
            const listaPlana: Reserva[] = [];

            if (esAdmin) {
              Object.keys(data).forEach((userKey) => { // iterar sobre cada usuario en el nodo de reservas, ya que los admins pueden ver todas las reservas de todos los usuarios.
                const nodoUsuario = data[userKey];
                if (nodoUsuario && typeof nodoUsuario === 'object') { // Verifica que el nodo del usuario exista y sea un objeto antes de iterar sobre sus reservas.
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

  // --- STREAM DE DATOS: HISTORIAL DE PAGOS ---
  private todoElHistorial$ = this.auth.user$.pipe(
    switchMap((u) => {
      if (!u || !u.email) return of([]);

      const esAdmin = this.auth.esAdmin();
      const emailSanitizado = u.email.replace(/\./g, ',');
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

            // Ordenar por fecha descendente (los más recientes primero)
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
    const email = this.auth.usuarioLogueado();
    const todas = this.reservas();
    if (!email) return [];
    if (this.auth.esAdmin()) return todas;
    return todas.filter((r) => r.usuario?.toLowerCase() === email.toLowerCase());
  });

  historialVisibles = computed(() => {
    const email = this.auth.usuarioLogueado();
    const todos = this.historial();
    if (!email) return [];
    if (this.auth.esAdmin()) return todos;
    return todos.filter((h) => h.usuario?.toLowerCase() === email.toLowerCase());
  });

  deudaTotal = computed(() => {
    return this.reservasVisibles().reduce((acc, res) => {
      return acc + (res.total - (res.pagado || 0));
    }, 0);
  });

  fechasOcupadas = computed(() => new Set(this.reservas().map((r) => r.fecha)));

  // --- MÉTODOS CRUD DE RESERVAS ---

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

  // --- MÉTODOS DE PAGO E HISTORIAL ---

  async registrarEnHistorial(email: string, monto: number, paymentId: string, descripcion: string) {
    const userPath = email.replace(/\./g, ',');
    const historialRef = push(ref(this.db, `historial_pagos/${userPath}`));

    const pago: PagoHistorial = {
      id: historialRef.key || undefined,
      fecha: new Date().toISOString(), // Guarda en ISO UTC para mejores prácticas
      monto: Number(monto),
      paymentId: paymentId || 'manual',
      descripcion,
      usuario: email,
    };

    return set(historialRef, pago);
  }

  // Método para pagar una reserva individual específica
async procesarPagoReservaIndividual(reserva: Reserva) {
  const pendiente = Number(reserva.total) - Number(reserva.pagado || 0);
  
  if (pendiente <= 0) {
    alert('Esta reserva ya se encuentra totalmente saldada.');
    return;
  }

  try {
    const body = {
      total: pendiente,
      id: reserva.id,
      descripcion: `Pago de Reserva: ${reserva.tipoEvento === '15_años' ? '15 Años' : 'Boda'} - ${reserva.fecha}`,
      usuario: reserva.usuario
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
    console.error('Error al procesar pago individual:', error);
    alert('Error al conectar con el servidor de pagos.');
  }
}

  async saldarDeudaUsuario(email: string, paymentId: string) {
    if (!email) return;

    const userPath = email.replace(/\./g, ',');
    const itemRef = ref(this.db, `reservas/${userPath}`);

    try {
      const snapshot = await get(itemRef);

      if (!snapshot.exists()) {
        console.warn('No se encontraron reservas registradas para este usuario.');
        return;
      }

      const data = snapshot.val();
      let montoTotalSaldado = 0;

      for (const resKey of Object.keys(data)) {
        const res = data[resKey];
        const total = Number(res.total || 0);
        const pagado = Number(res.pagado || 0);

        if (total > pagado) {
          montoTotalSaldado += total - pagado;

          const resRef = ref(this.db, `reservas/${userPath}/${resKey}`);
          await set(resRef, {
            ...res,
            pagado: total,
            estado: 'completado',
          });
        }
      }

      if (montoTotalSaldado > 0) {
        await this.registrarEnHistorial(email, montoTotalSaldado, paymentId, 'Saldado de Deuda Total');
        console.log('Deuda saldada e historial registrado con éxito');
      }
    } catch (error) {
      console.error('Error al saldar la deuda en Firebase:', error);
    }
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
}
