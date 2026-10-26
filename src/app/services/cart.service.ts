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

  subtotalCarrito = computed(() =>
    this.serviciosSeleccionados().reduce((acc, s) => acc + s.precio, 0),
  );

  descuentoCarrito = computed(() =>
    this.calcularDescuento(this.serviciosSeleccionados()),
  );

  totalCarrito = computed(() =>
    Math.round((this.subtotalCarrito() - this.descuentoCarrito()) * 100) / 100,
  );

  montoSenia = computed(() => this.totalCarrito() * 0.3);

  todosLosServicios = computed(() => this.serviciosDisponibles());

  categoriaSeleccionadaCompleta = computed(() => {
    const serviciosCategoria = this.serviciosFiltrados();
    const idsSeleccionados = new Set(this.serviciosSeleccionados().map((servicio) => servicio.id));
    return (
      serviciosCategoria.length > 0 &&
      serviciosCategoria.every((servicio) => idsSeleccionados.has(servicio.id))
    );
  });

  setCategoria(cat: CategoriaServicio) {
    this.categoriaSeleccionada.set(cat);
  }

  toggleServicio(servicio: ServicioExtra) {
    this.serviciosSeleccionados.update((actuales) => {
      const existe = actuales.find((s) => s.id === servicio.id);
      return existe ? actuales.filter((s) => s.id !== servicio.id) : [...actuales, servicio];
    });
  }

  toggleTodosServiciosCategoria() {
    const idsCategoria = new Set(this.serviciosFiltrados().map((servicio) => servicio.id));
    if (this.categoriaSeleccionadaCompleta()) {
      this.serviciosSeleccionados.update((seleccionados) =>
        seleccionados.filter((servicio) => !idsCategoria.has(servicio.id)),
      );
      return;
    }

    this.serviciosSeleccionados.update((seleccionados) => {
      const seleccionadosFueraCategoria = seleccionados.filter(
        (servicio) => !idsCategoria.has(servicio.id),
      );
      return [...seleccionadosFueraCategoria, ...this.serviciosFiltrados()];
    });
  }

  calcularDescuento(servicios: Pick<ServicioExtra, 'id' | 'precio' | 'categoria'>[]): number {
    const seleccionadosPorId = new Map(servicios.map((servicio) => [servicio.id, servicio]));
    const catalogoPorCategoria = this.serviciosDisponibles().reduce(
      (categorias, servicio) => {
        const serviciosCategoria = categorias.get(servicio.categoria) || [];
        serviciosCategoria.push(servicio);
        categorias.set(servicio.categoria, serviciosCategoria);
        return categorias;
      },
      new Map<CategoriaServicio, ServicioExtra[]>(),
    );

    const descuento = [...catalogoPorCategoria.entries()].reduce((total, [categoria, catalogo]) => {
      if (!catalogo.length || !catalogo.every((servicio) => seleccionadosPorId.has(servicio.id))) {
        return total;
      }

      const subtotalCategoria = catalogo.reduce(
        (subtotal, servicio) => subtotal + Number(seleccionadosPorId.get(servicio.id)?.precio || 0),
        0,
      );
      return total + subtotalCategoria * 0.1;
    }, 0);

    return Math.round(descuento * 100) / 100;
  }

  reset() {
    this.serviciosSeleccionados.set([]);
    this.categoriaSeleccionada.set('extras');
  }
}
