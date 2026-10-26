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

export const PRECIO_PRUEBA_SERVICIO = 1;

export const PRESUPUESTO_QUINCE = {
  precioLista: 52000,
  descuentoEfectivoPorcentaje: 10,
  reservaPorcentaje: 30,
  saldoPorcentaje: 70,
  fechaLimiteSaldo: 'hasta 3 días antes del evento',
} as const;

export const CATALOGO_SERVICIOS: ServicioExtra[] = [
  {
    id: '15-foto-exteriores',
    nombre: 'Fotografía - Exteriores',
    detalle: 'Sesión fotográfica en exteriores previa al evento.',
    precioPromocional: 4000,
    precio: PRECIO_PRUEBA_SERVICIO,
    icono: '📸',
    categoria: '15_años',
  },
  {
    id: '15-foto-aprontes',
    nombre: 'Fotografía - Aprontes',
    detalle: 'Captura de preparativos y sesión exclusiva con el vestido antes del ingreso al salón.',
    precioPromocional: 4000,
    precio: PRECIO_PRUEBA_SERVICIO,
    icono: '📸',
    categoria: '15_años',
  },
  {
    id: '15-foto-fiesta',
    nombre: 'Fotografía - Fiesta',
    detalle: 'Cobertura fotográfica completa de toda la fiesta de 15 años.',
    precioPromocional: 13000,
    precio: PRECIO_PRUEBA_SERVICIO,
    icono: '📸',
    categoria: '15_años',
  },
  {
    id: '15-video-exteriores',
    nombre: 'Video - Exteriores',
    detalle: 'Filmación en exteriores previa al evento para video cronológico o de presentación.',
    precioPromocional: 8500,
    precio: PRECIO_PRUEBA_SERVICIO,
    icono: '🎬',
    categoria: '15_años',
  },
  {
    id: '15-video-aprontes',
    nombre: 'Video - Aprontes',
    detalle: 'Filmación de preparativos y tomas cinematográficas con el vestido antes de la entrada.',
    precioPromocional: 6500,
    precio: PRECIO_PRUEBA_SERVICIO,
    icono: '🎬',
    categoria: '15_años',
  },
  {
    id: '15-video-fiesta',
    nombre: 'Video - Fiesta',
    detalle: 'Cobertura fílmica completa y edición final de la fiesta de 15 años.',
    precioPromocional: 16500,
    precio: PRECIO_PRUEBA_SERVICIO,
    icono: '🎬',
    categoria: '15_años',
  },
  {
    id: 'b-1',
    nombre: 'Boda: Civil & Brindis',
    detalle: 'Una cobertura íntima para acompañar la ceremonia civil y el brindis.',
    precio: PRECIO_PRUEBA_SERVICIO,
    icono: '🥂',
    categoria: 'bodas',
  },
  {
    id: 'b-2',
    nombre: 'Boda: Fiesta Completa',
    detalle: 'Cobertura de los momentos más importantes de la celebración y la fiesta.',
    precio: PRECIO_PRUEBA_SERVICIO,
    icono: '💍',
    categoria: 'bodas',
  },
  {
    id: 'b-3',
    nombre: 'Cobertura Civil',
    detalle: 'Registro fotográfico de la ceremonia civil y sus momentos especiales.',
    precio: PRECIO_PRUEBA_SERVICIO,
    icono: '📷',
    categoria: 'bodas',
  },
  {
    id: 'b-4',
    nombre: 'Sesión de Exteriores',
    detalle: 'Una sesión de fotos en exteriores para celebrar su historia.',
    precio: PRECIO_PRUEBA_SERVICIO,
    icono: '🌿',
    categoria: 'bodas',
  },
  {
    id: 'b-5',
    nombre: 'Cobertura de Fiesta',
    detalle: 'Fotografías de la fiesta, los invitados y cada instante de la celebración.',
    precio: PRECIO_PRUEBA_SERVICIO,
    icono: '✨',
    categoria: 'bodas',
  },
  {
    id: 'b-6',
    nombre: 'Fotos de Preparativos (Getting Ready)',
    detalle: 'Registro de los preparativos y de los momentos previos a la ceremonia.',
    precio: PRECIO_PRUEBA_SERVICIO,
    icono: '💐',
    categoria: 'bodas',
  },
  {
    id: 'b-7',
    nombre: 'Video Highlights',
    detalle: 'Un resumen en video para volver a disfrutar los momentos destacados de su boda.',
    precio: PRECIO_PRUEBA_SERVICIO,
    icono: '🎬',
    categoria: 'bodas',
  },
  {
    id: 'e-1',
    nombre: 'Alquiler Luces Pro',
    precio: PRECIO_PRUEBA_SERVICIO,
    icono: '💡',
    categoria: 'extras',
  },
  {
    id: 'e-2',
    nombre: 'DJ y Sonido',
    precio: PRECIO_PRUEBA_SERVICIO,
    icono: '🎧',
    categoria: 'extras',
  },
  {
    id: 'e-3',
    nombre: 'Fotografía & Video',
    precio: PRECIO_PRUEBA_SERVICIO,
    icono: '📸',
    categoria: 'extras',
  },
  {
    id: 'e-4',
    nombre: 'Limpieza Post-Fiesta',
    precio: PRECIO_PRUEBA_SERVICIO,
    icono: '🧹',
    categoria: 'extras',
  },
  {
    id: 'e-5',
    nombre: 'Decoración Básica',
    precio: PRECIO_PRUEBA_SERVICIO,
    icono: '🌸',
    categoria: 'extras',
  },
];
