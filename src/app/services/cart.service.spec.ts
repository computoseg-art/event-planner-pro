import { CartService } from './cart.service';
import { CATALOGO_SERVICIOS, PRECIO_PRUEBA_SERVICIO, PRESUPUESTO_QUINCE } from './catalogo-servicios';

describe('CartService', () => {
  let cart: CartService;

  beforeEach(() => {
    cart = new CartService();
  });

  it('keeps the promotional prices for the quinceañera services separate from checkout prices', () => {
    const quinceServices = cart.serviciosDisponibles().filter((servicio) => servicio.categoria === '15_años');

    expect(quinceServices.map((servicio) => servicio.precioPromocional)).toEqual([
      4000, 4000, 13000, 8500, 6500, 16500,
    ]);
    expect(quinceServices.every((servicio) => servicio.precio === PRECIO_PRUEBA_SERVICIO)).toBeTrue();
  });

  it('keeps wedding services available without advertising unconfirmed prices', () => {
    const weddingServices = cart.serviciosDisponibles().filter((servicio) => servicio.categoria === 'bodas');

    expect(weddingServices.length).toBe(7);
    expect(weddingServices.every((servicio) => servicio.precioPromocional === undefined)).toBeTrue();
    expect(weddingServices.every((servicio) => servicio.precio === PRECIO_PRUEBA_SERVICIO)).toBeTrue();
  });

  it('calculates reservation totals and deposits from test prices only', () => {
    const photo = CATALOGO_SERVICIOS.find((servicio) => servicio.id === '15-foto-fiesta')!;
    const weddingVideo = CATALOGO_SERVICIOS.find((servicio) => servicio.id === 'b-7')!;

    cart.toggleServicio(photo);
    cart.toggleServicio(weddingVideo);

    expect(cart.totalCarrito()).toBe(2);
    expect(cart.montoSenia()).toBeCloseTo(0.6);
  });

  it('applies a 10% discount when every service in the selected category is added', () => {
    const quinceServices = CATALOGO_SERVICIOS.filter((servicio) => servicio.categoria === '15_años');

    cart.setCategoria('15_años');
    quinceServices.slice(0, -1).forEach((servicio) => cart.toggleServicio(servicio));
    expect(cart.descuentoCarrito()).toBe(0);

    cart.toggleServicio(quinceServices[quinceServices.length - 1]);

    expect(cart.subtotalCarrito()).toBe(6);
    expect(cart.descuentoCarrito()).toBe(0.6);
    expect(cart.totalCarrito()).toBe(5.4);
    expect(cart.montoSenia()).toBeCloseTo(1.62);
  });

  it('selects and clears all services in a category without removing other categories', () => {
    const extra = CATALOGO_SERVICIOS.find((servicio) => servicio.categoria === 'extras')!;
    const quinceService = CATALOGO_SERVICIOS.find((servicio) => servicio.categoria === '15_años')!;

    cart.toggleServicio(quinceService);
    cart.setCategoria('extras');
    cart.toggleServicio(extra);
    cart.toggleTodosServiciosCategoria();

    expect(cart.categoriaSeleccionadaCompleta()).toBeTrue();
    expect(cart.serviciosSeleccionados().some((servicio) => servicio.id === quinceService.id)).toBeTrue();
    expect(cart.serviciosSeleccionados().filter((servicio) => servicio.categoria === 'extras').length).toBe(5);

    cart.toggleTodosServiciosCategoria();

    expect(cart.serviciosSeleccionados()).toEqual([quinceService]);
    expect(cart.descuentoCarrito()).toBe(0);
  });

  it('applies the complete-category discount to weddings and extras as well', () => {
    for (const categoria of ['bodas', 'extras'] as const) {
      const serviciosCategoria = CATALOGO_SERVICIOS.filter(
        (servicio) => servicio.categoria === categoria,
      );
      const cartCategoria = new CartService();
      cartCategoria.setCategoria(categoria);
      cartCategoria.toggleTodosServiciosCategoria();

      expect(cartCategoria.serviciosSeleccionados().length).toBe(serviciosCategoria.length);
      expect(cartCategoria.descuentoCarrito()).toBeCloseTo(serviciosCategoria.length * 0.1);
      expect(cartCategoria.totalCarrito()).toBeCloseTo(serviciosCategoria.length * 0.9);
    }
  });

  it('keeps the quinceañera promotional payment terms in the same catalog configuration', () => {
    expect(PRESUPUESTO_QUINCE.precioLista).toBe(52000);
    expect(PRESUPUESTO_QUINCE.descuentoEfectivoPorcentaje).toBe(10);
    expect(PRESUPUESTO_QUINCE.reservaPorcentaje).toBe(30);
    expect(PRESUPUESTO_QUINCE.saldoPorcentaje).toBe(70);
    expect(PRESUPUESTO_QUINCE.fechaLimiteSaldo).toBe('hasta 3 días antes del evento');
  });
});
