export interface Servicio {
  id: string;
  nombre: string;
  precio: number;
  categoria: '15_años' | 'bodas' | 'extras';
}

export const catalogoServicios: Servicio[] = [
  { id: '15-foto-exteriores', nombre: 'Fotografía - Exteriores', precio: 1, categoria: '15_años' },
  { id: '15-foto-aprontes', nombre: 'Fotografía - Aprontes', precio: 1, categoria: '15_años' },
  { id: '15-foto-fiesta', nombre: 'Fotografía - Fiesta', precio: 1, categoria: '15_años' },
  { id: '15-video-exteriores', nombre: 'Video - Exteriores', precio: 1, categoria: '15_años' },
  { id: '15-video-aprontes', nombre: 'Video - Aprontes', precio: 1, categoria: '15_años' },
  { id: '15-video-fiesta', nombre: 'Video - Fiesta', precio: 1, categoria: '15_años' },
  { id: 'b-1', nombre: 'Boda: Civil & Brindis', precio: 1, categoria: 'bodas' },
  { id: 'b-2', nombre: 'Boda: Fiesta Completa', precio: 1, categoria: 'bodas' },
  { id: 'b-3', nombre: 'Cobertura Civil', precio: 1, categoria: 'bodas' },
  { id: 'b-4', nombre: 'Sesión de Exteriores', precio: 1, categoria: 'bodas' },
  { id: 'b-5', nombre: 'Cobertura de Fiesta', precio: 1, categoria: 'bodas' },
  { id: 'b-6', nombre: 'Fotos de Preparativos (Getting Ready)', precio: 1, categoria: 'bodas' },
  { id: 'b-7', nombre: 'Video Highlights', precio: 1, categoria: 'bodas' },
  { id: 'e-1', nombre: 'Alquiler Luces Pro', precio: 1, categoria: 'extras' },
  { id: 'e-2', nombre: 'DJ y Sonido', precio: 1, categoria: 'extras' },
  { id: 'e-3', nombre: 'Fotografía & Video', precio: 1, categoria: 'extras' },
  { id: 'e-4', nombre: 'Limpieza Post-Fiesta', precio: 1, categoria: 'extras' },
  { id: 'e-5', nombre: 'Decoración Básica', precio: 1, categoria: 'extras' },
];

export function validateReservationInput(input: any) {
  const fecha = typeof input?.fecha === 'string' ? input.fecha.split('T')[0] : '';
  const descripcion = typeof input?.descripcion === 'string' ? input.descripcion.trim() : '';
  const requestedServices = input?.servicios;
  const serviceIds = Array.isArray(requestedServices)
    ? requestedServices.map((service) => service?.id)
    : [];
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(fecha) ||
    !descripcion ||
    descripcion.length > 2000 ||
    !['15_años', 'bodas'].includes(input?.tipoEvento) ||
    !Array.isArray(requestedServices) ||
    requestedServices.length > 30 ||
    serviceIds.some((id) => typeof id !== 'string') ||
    new Set(serviceIds).size !== serviceIds.length
  ) return null;

  const services = serviceIds.map((id) => catalogoServicios.find((service) => service.id === id));
  if (
    services.some(
      (service) => !service ||
        (service.categoria !== 'extras' && service.categoria !== input.tipoEvento),
    )
  ) return null;
  const selected = services as Servicio[];
  const subtotal = selected.reduce((sum, service) => sum + service.precio, 0);
  const selectedIds = new Set(selected.map((service) => service.id));
  const categories = [...new Set(catalogoServicios.map((service) => service.categoria))];
  const discount = categories.reduce((sum, category) => {
    const categoryServices = catalogoServicios.filter((service) => service.categoria === category);
    return categoryServices.every((service) => selectedIds.has(service.id))
      ? sum + categoryServices.reduce((total, service) => total + service.precio, 0) * 0.1
      : sum;
  }, 0);
  const roundedDiscount = Math.round(discount * 100) / 100;
  return {
    fecha,
    descripcion,
    tipoEvento: input.tipoEvento,
    servicios: selected,
    total: Math.round((subtotal - roundedDiscount) * 100) / 100,
    descuento: roundedDiscount,
  };
}
