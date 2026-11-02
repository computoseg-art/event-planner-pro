import catalogoServicios from '../../../backend-agenda/catalogo-servicios.json';

export type CategoriaServicio = '15_años' | 'bodas' | 'extras';

export interface ServicioExtra {
  id: string;
  nombre: string;
  detalle?: string;
  precioPromocional?: number;
  precio: number;
  icono: string;
  categoria: CategoriaServicio;
}

export const PRECIO_PRUEBA_SERVICIO = catalogoServicios[0].precio;

export const PRESUPUESTO_QUINCE = {
  precioLista: 52000,
  descuentoEfectivoPorcentaje: 10,
  reservaPorcentaje: 30,
  saldoPorcentaje: 70,
  fechaLimiteSaldo: 'hasta 3 días antes del evento',
} as const;

export const CATALOGO_SERVICIOS = catalogoServicios as ServicioExtra[];
