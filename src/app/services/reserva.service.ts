import { Injectable, computed, inject, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { Database, ref, set, push, objectVal, remove } from '@angular/fire/database';
import { AuthService } from './auth.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { Observable, map, of, catchError, switchMap } from 'rxjs';

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

      const response = await fetch('http://localhost:3000/create_preference', {
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

// import { Injectable, computed, inject } from '@angular/core';
// import { Database, ref, set, push, objectVal, remove } from '@angular/fire/database';
// import { AuthService } from './auth.service';
// import { toSignal } from '@angular/core/rxjs-interop';
// import { Observable, map, of, catchError, switchMap } from 'rxjs';

// export interface Reserva {
//   id?: string;
//   usuario: string;
//   fecha: string;
//   descripcion: string;
//   tipoEvento: '15_años' | 'bodas';
//   servicios: any[];
//   total: number;
//   pagado: number;
//   estado: string;
// }

// @Injectable({ providedIn: 'root' })
// export class ReservaService {
//   private db = inject(Database);
//   private auth = inject(AuthService);

//   // --- STREAM DE DATOS ---
//   private todasLasReservas$ = this.auth.user$.pipe(
//     switchMap((u) => {
//       if (!u) return of([]);

//       // Usamos objectVal para conservar la estructura de Keys { 'usuario,com': { 'id_reserva': { ... } } }
//       return (objectVal(ref(this.db, 'reservas')) as Observable<any>).pipe(
//         map((data) => {
//           if (!data) return [];
//           const listaPlana: Reserva[] = [];

//           // Obtenemos los correos sanitizados: ['admin@gmail,com', 'esteban@gmail,com']
//           Object.keys(data).forEach((userKey) => {
//             const nodoUsuario = data[userKey];

//             if (nodoUsuario && typeof nodoUsuario === 'object') {
//               // Obtenemos los IDs de cada reserva: ['-P1KVOUyFdRaewIstgIR']
//               Object.keys(nodoUsuario).forEach((resKey) => {
//                 const res = nodoUsuario[resKey];
//                 if (res && res.fecha) {
//                   listaPlana.push({
//                     ...res,
//                     id: resKey, // Forzamos el ID real de Firebase
//                     usuario: userKey.replace(/,/g, '.'), // Convertimos 'esteban@gmail,com' a 'esteban@gmail.com'
//                   });
//                 }
//               });
//             }
//           });

//           return listaPlana;
//         }),
//         catchError((err) => {
//           console.error('Error al leer reservas:', err);
//           return of([]);
//         }),
//       );
//     }),
//   );

//   // Señal consumida por los componentes
//   reservas = toSignal(this.todasLasReservas$, { initialValue: [] as Reserva[] });

//   // --- SEÑALES COMPUTADAS ---

//   reservasVisibles = computed(() => {
//     const email = this.auth.usuarioLogueado();
//     const todas = this.reservas();
//     if (!email) return [];
//     if (this.auth.esAdmin()) return todas;
//     return todas.filter((r) => r.usuario?.toLowerCase() === email.toLowerCase());
//   });

//   deudaTotal = computed(() => {
//     return this.reservasVisibles().reduce((acc, res) => {
//       return acc + (res.total - (res.pagado || 0));
//     }, 0);
//   });

//   fechasOcupadas = computed(() => new Set(this.reservas().map((r) => r.fecha)));

//   // --- MÉTODOS CRUD ---

//   async agregar(fecha: string, desc: string, total: number, servicios: any[], tipoEvento: string) {
//     const email = this.auth.usuarioLogueado();
//     if (!email) return;
//     const userPath = email.replace(/\./g, ',');
//     const nuevaRef = push(ref(this.db, `reservas/${userPath}`));

//     const nuevaReserva: Reserva = {
//       id: nuevaRef.key || '',
//       fecha,
//       descripcion: desc,
//       usuario: email,
//       tipoEvento: tipoEvento as '15_años' | 'bodas',
//       servicios: servicios,
//       total: Number(total),
//       pagado: 0,
//       estado: 'pendiente',
//     };

//     return set(nuevaRef, nuevaReserva);
//   }

//   async actualizar(res: Reserva) {
//     if (!res.id || !res.usuario) return;
//     const userPath = res.usuario.replace(/\./g, ',');
//     const itemRef = ref(this.db, `reservas/${userPath}/${res.id}`);
//     return set(itemRef, {
//       ...res,
//       total: Number(res.total),
//       pagado: Number(res.pagado),
//     });
//   }

//   async eliminar(res: Reserva) {
//     if (!res.id || !res.usuario) return;
//     const userPath = res.usuario.replace(/\./g, ',');
//     const itemRef = ref(this.db, `reservas/${userPath}/${res.id}`);
//     return remove(itemRef);
//   }

//   async procesarPago(monto: number, reserva?: any) {
//     try {
//       const body: any = {
//         total: monto,
//         id: reserva?.id || 'pago-general',
//         descripcion: reserva?.descripcion || 'Pago de Deuda Total - Agenda',
//       };

//       const response = await fetch('http://localhost:3000/create_preference', {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify(body),
//       });

//       const data = await response.json();
//       if (data.init_point) {
//         window.location.href = data.init_point;
//       }
//     } catch (error) {
//       console.error('Error en pago:', error);
//       alert('Error al conectar con el servidor de pagos.');
//     }
//   }
// }

// import { Injectable, computed, inject } from '@angular/core';
// import { Database, ref, set, push, listVal, remove } from '@angular/fire/database';
// import { AuthService } from './auth.service';
// import { toSignal } from '@angular/core/rxjs-interop';
// import { Observable, map, of, catchError, switchMap } from 'rxjs';

// export interface Reserva {
//   id?: string;
//   usuario: string;
//   fecha: string;
//   descripcion: string;
//   tipoEvento: '15_años' | 'bodas';
//   servicios: any[];
//   total: number;
//   pagado: number;
//   estado: string;
// }

// @Injectable({ providedIn: 'root' })
// export class ReservaService {
//   private db = inject(Database);
//   private auth = inject(AuthService);

//   // --- STREAM DE DATOS ---
//   private todasLasReservas$ = this.auth.user$.pipe(
//     switchMap((u) => {
//       if (!u) return of([]);
//       // Escuchamos el nodo raíz 'reservas'
//       return (listVal(ref(this.db, 'reservas')) as Observable<any>).pipe(
//         map((data) => {
//           if (!data) return [];
//           const listaPlana: Reserva[] = [];

//           // Firebase listVal devuelve un array si los índices son numéricos
//           // o un objeto si son keys. Manejamos ambos casos:
//           const usuariosKeys = Object.keys(data);
//           usuariosKeys.forEach((userKey) => {
//             const nodoUsuario = data[userKey];
//             if (nodoUsuario && typeof nodoUsuario === 'object') {
//               Object.keys(nodoUsuario).forEach((resKey) => {
//                 const res = nodoUsuario[resKey];
//                 if (res && res.fecha) {
//                   listaPlana.push({ ...res, id: resKey });
//                 }
//               });
//             }
//           });
//           return listaPlana;
//         }),
//         catchError(() => of([])),
//       );
//     }),
//   );

//   // Esta es la señal que el componente usará como this.rs.reservas()
//   reservas = toSignal(this.todasLasReservas$, { initialValue: [] as Reserva[] });

//   // --- SEÑALES COMPUTADAS ---

//   reservasVisibles = computed(() => {
//     const email = this.auth.usuarioLogueado();
//     const todas = this.reservas(); // Usamos la señal definida arriba
//     if (!email) return [];
//     if (this.auth.esAdmin()) return todas;
//     return todas.filter((r) => r.usuario?.toLowerCase() === email.toLowerCase());
//   });

//   deudaTotal = computed(() => {
//     return this.reservasVisibles().reduce((acc, res) => {
//       return acc + (res.total - (res.pagado || 0));
//     }, 0);
//   });

//   fechasOcupadas = computed(() => new Set(this.reservas().map((r) => r.fecha)));

//   // --- MÉTODOS CRUD ---

//   async agregar(fecha: string, desc: string, total: number, servicios: any[], tipoEvento: string) {
//     const email = this.auth.usuarioLogueado();
//     if (!email) return;
//     const userPath = email.replace(/\./g, ',');
//     const nuevaRef = push(ref(this.db, `reservas/${userPath}`));

//     const nuevaReserva: Reserva = {
//       id: nuevaRef.key || '',
//       fecha,
//       descripcion: desc,
//       usuario: email,
//       tipoEvento: tipoEvento as '15_años' | 'bodas',
//       servicios: servicios,
//       total: Number(total),
//       pagado: 0,
//       estado: 'pendiente',
//     };

//     return set(nuevaRef, nuevaReserva);
//   }

//   async actualizar(res: Reserva) {
//     if (!res.id || !res.usuario) return;
//     const userPath = res.usuario.replace(/\./g, ',');
//     const itemRef = ref(this.db, `reservas/${userPath}/${res.id}`);
//     return set(itemRef, {
//       ...res,
//       total: Number(res.total),
//       pagado: Number(res.pagado),
//     });
//   }

//   async eliminar(res: Reserva) {
//     if (!res.id || !res.usuario) return;
//     const userPath = res.usuario.replace(/\./g, ',');
//     const itemRef = ref(this.db, `reservas/${userPath}/${res.id}`);
//     return remove(itemRef); // Usamos remove para borrar el nodo
//   }

//   // async procesarPago(monto: number, reserva?: Reserva) {
//   //   alert(`Redirigiendo a pasarela de pago por $${monto}...`);
//   // }

//   // Agregamos el signo "?" después de reserva para hacerlo opcional
//   async procesarPago(monto: number, reserva?: any) {
//     try {
//       const body: any = {
//         total: monto,
//         // Si hay reserva, usamos su ID y descripción, si no, es un pago general
//         id: reserva?.id || 'pago-general',
//         descripcion: reserva?.descripcion || 'Pago de Deuda Total - Agenda',
//       };

//       const response = await fetch('http://localhost:3000/create_preference', {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify(body),
//       });

//       const data = await response.json();
//       if (data.init_point) {
//         window.location.href = data.init_point;
//       }
//     } catch (error) {
//       console.error('Error en pago:', error);
//       alert('Error al conectar con el servidor de pagos.');
//     }
//   }
// }
