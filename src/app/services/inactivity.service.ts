// src/app/services/inactivity.service.ts
import { Injectable, inject, NgZone } from '@angular/core';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class InactivityService {
  private auth = inject(AuthService);
  private ngZone = inject(NgZone);

  // Límite de inactividad: 15 minutos (15 * 60 * 1000 ms)
  private readonly TIEMPO_INACTIVIDAD = 15 * 60 * 1000;
  private timeoutId: any;

  constructor() {
    this.auth.user$.subscribe((usuario) => {
      if (usuario) {
        this.iniciarMonitoreo();
      } else {
        this.detenerMonitoreo();
      }
    });
  }

  private iniciarMonitoreo() {
    this.reiniciarTemporizador();
    this.ngZone.runOutsideAngular(() => {
      window.addEventListener('mousemove', this.resetListener);
      window.addEventListener('click', this.resetListener);
      window.addEventListener('keydown', this.resetListener);
      window.addEventListener('scroll', this.resetListener);
    });
  }

  private detenerMonitoreo() {
    if (this.timeoutId) clearTimeout(this.timeoutId);
    window.removeEventListener('mousemove', this.resetListener);
    window.removeEventListener('click', this.resetListener);
    window.removeEventListener('keydown', this.resetListener);
    window.removeEventListener('scroll', this.resetListener);
  }

  private resetListener = () => this.reiniciarTemporizador();

  private reiniciarTemporizador() {
    if (this.timeoutId) clearTimeout(this.timeoutId);

    this.timeoutId = setTimeout(() => {
      this.ngZone.run(() => {
        alert('Tu sesión ha finalizado por inactividad.');
        this.auth.logout();
      });
    }, this.TIEMPO_INACTIVIDAD);
  }
}
