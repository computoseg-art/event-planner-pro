import { Injectable, signal, computed } from '@angular/core';
import { CATALOGO_SERVICIOS } from './catalogo-servicios';
import type { CategoriaServicio, ServicioExtra } from './catalogo-servicios';

@Injectable({ providedIn: 'root' })
export class CartService {
  // Catálogo agrupado por tipo de evento
  readonly serviciosDisponibles = signal<ServicioExtra[]>([...CATALOGO_SERVICIOS]);

  categoriaSeleccionada = signal<CategoriaServicio>('extras');
  serviciosSeleccionados = signal<ServicioExtra[]>([]);

  // Filtra los servicios según la categoría que el usuario clickea
  serviciosFiltrados = computed(() =>
    this.serviciosDisponibles().filter((s) => s.categoria === this.categoriaSeleccionada()),
  );

  totalCarrito = computed(() =>
    this.serviciosSeleccionados().reduce((acc, s) => acc + s.precio, 0),
  );

  montoSenia = computed(() => this.totalCarrito() * 0.3);

  todosLosServicios = computed(() => this.serviciosDisponibles());

  setCategoria(cat: CategoriaServicio) {
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
