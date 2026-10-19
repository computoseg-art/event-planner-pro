import { Injectable, signal, computed } from '@angular/core';

export interface ServicioExtra {
  id: string;
  nombre: string;
  precio: number;
  icono: string;
  categoria: '15_años' | 'bodas' | 'extras';
}

@Injectable({ providedIn: 'root' })
export class CartService {
  // Catálogo agrupado por tipo de evento
  serviciosDisponibles = signal<ServicioExtra[]>([
    // PAQUETES 15 AÑOS
    {
      id: '15-1',
      nombre: 'Paquete Quince: Basic',
      precio: 1,
      icono: '👑',
      categoria: '15_años',
    },
    {
      id: '15-2',
      nombre: 'Paquete Quince: Full Premium',
      precio: 1,
      icono: '💎',
      categoria: '15_años',
    },
    {
      id: '15-3',
      nombre: 'Cobertura de Cumpleaños',
      precio: 1,
      icono: '🎂',
      categoria: '15_años',
    },

    // PAQUETES BODAS
    { id: 'b-1', nombre: 'Boda: Civil & Brindis', precio: 1, icono: '🥂', categoria: 'bodas' },
    { id: 'b-2', nombre: 'Boda: Fiesta Completa', precio: 1, icono: '💍', categoria: 'bodas' },
    { id: 'b-3', nombre: 'Cobertura Civil', precio: 1, icono: '📷', categoria: 'bodas' },
    { id: 'b-4', nombre: 'Sesión de Exteriores', precio: 1, icono: '🌿', categoria: 'bodas' },
    { id: 'b-5', nombre: 'Cobertura de Fiesta', precio: 1, icono: '✨', categoria: 'bodas' },
    { id: 'b-6', nombre: 'Fotos de Preparativos (Getting Ready)', precio: 1, icono: '💐', categoria: 'bodas' },
    { id: 'b-7', nombre: 'Video Highlights', precio: 1, icono: '🎬', categoria: 'bodas' },

    // SERVICIOS EXTRAS (Generales)
    { id: 'e-1', nombre: 'Alquiler Luces Pro', precio: 1, icono: '💡', categoria: 'extras' },
    { id: 'e-2', nombre: 'DJ y Sonido', precio: 1, icono: '🎧', categoria: 'extras' },
    { id: 'e-3', nombre: 'Fotografía & Video', precio: 1, icono: '📸', categoria: 'extras' },
    { id: 'e-4', nombre: 'Limpieza Post-Fiesta', precio: 1, icono: '🧹', categoria: 'extras' },
    { id: 'e-5', nombre: 'Decoración Básica', precio: 1, icono: '🌸', categoria: 'extras' },
  ]);

  categoriaSeleccionada = signal<string>('extras'); // Por defecto muestra extras
  serviciosSeleccionados = signal<ServicioExtra[]>([]);

  // Filtra los servicios según la categoría que el usuario clickea
  serviciosFiltrados = computed(() =>
    this.serviciosDisponibles().filter((s) => s.categoria === this.categoriaSeleccionada()),
  );

  totalCarrito = computed(() =>
    this.serviciosSeleccionados().reduce((acc, s) => acc + s.precio, 0),
  );

  montoSenia = computed(() => this.totalCarrito() * 0.2);

  todosLosServicios = computed(() => this.serviciosDisponibles());

  setCategoria(cat: string) {
    this.categoriaSeleccionada.set(cat);
  }

  toggleServicio(servicio: ServicioExtra) {
    this.serviciosSeleccionados.update((actuales) => {
      const existe = actuales.find((s) => s.id === servicio.id);
      return existe ? actuales.filter((s) => s.id !== servicio.id) : [...actuales, servicio];
    });
  }

  reset() {
    this.serviciosSeleccionados.set([]);
    this.categoriaSeleccionada.set('extras');
  }
}
