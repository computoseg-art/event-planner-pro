/**
 * Catalog service for event types and pricing.
 * Shared between frontend and backend.
 */

export interface Servicio {
  id: string;
  nombre: string;
  precio: number;
  promocional?: number;
  activo: boolean;
  categorias: string[];
}

export interface CatalogoServicios {
  tiposEventos: string[];
  servicios: Servicio[];
  descuentoPorCategoria: number;
  descuentoMinServicios: number;
  seña: {
    porcentaje: number;
    diasMinimos: number;
    diasMaximosPago: number;
  };
}

export const catalogoServicios: CatalogoServicios = {
  tiposEventos: ['bodas', 'quince_anos', 'eventos_corporativos', 'otros'],
  servicios: [
    {
      id: 'fotografia_boda',
      nombre: 'Fotografía de Boda',
      precio: 1,
      activo: true,
      categorias: ['bodas'],
    },
    {
      id: 'video_boda',
      nombre: 'Video de Boda',
      precio: 1,
      activo: true,
      categorias: ['bodas'],
    },
    {
      id: 'fotografia_quince',
      nombre: 'Fotografía de 15 Años',
      precio: 1,
      activo: true,
      categorias: ['quince_anos'],
    },
    {
      id: 'video_quince',
      nombre: 'Video de 15 Años',
      precio: 1,
      activo: true,
      categorias: ['quince_anos'],
    },
    {
      id: 'fotografia_adicional',
      nombre: 'Hora Adicional de Fotografía',
      precio: 1,
      activo: true,
      categorias: ['bodas', 'quince_anos', 'eventos_corporativos', 'otros'],
    },
  ],
  descuentoPorCategoria: 0.1,
  descuentoMinServicios: 2,
  seña: {
    porcentaje: 0.3,
    diasMinimos: 5,
    diasMaximosPago: 3,
  },
};

/**
 * Calculate total price with discounts
 */
export function calcularTotal(
  servicios: Servicio[],
  tipoEvento: string
): {
  subtotal: number;
  descuento: number;
  total: number;
} {
  const subtotal = servicios.reduce((sum, s) => sum + s.precio, 0);
  
  const serviciosPorCategoria = servicios.filter(s =>
    s.categorias.includes(tipoEvento)
  ).length;
  
  const categoriaPorCompleto = serviciosPorCategoria >=
    catalogoServicios.descuentoMinServicios;
  
  const descuento = categoriaPorCompleto
    ? Math.round(subtotal * catalogoServicios.descuentoPorCategoria)
    : 0;
  
  return {
    subtotal,
    descuento,
    total: subtotal - descuento,
  };
}

/**
 * Validate services belong to event type
 */
export function validarServicios(
  servicios: Servicio[],
  tipoEvento: string
): boolean {
  return servicios.every(s => s.categorias.includes(tipoEvento));
}
