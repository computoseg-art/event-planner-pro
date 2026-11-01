import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../environments/environment';
import { TimeoutError, timeout } from 'rxjs';

@Component({
  selector: 'app-contacto',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './contacto.html',
  styleUrl: './contacto.css',
})
export class ContactoComponent {
  private http = inject(HttpClient);

  nombre = signal('');
  email = signal('');
  mensaje = signal('');
  enviando = signal(false);
  estadoEnvio = signal('');
  errorEnvio = signal(false);
  private readonly apiUrl = `${environment.apiUrl}/api`;
  private readonly errorServidorNoDisponible = environment.production
    ? 'No se pudo conectar con el servidor de contacto. Inténtalo nuevamente en unos minutos.'
    : `No se pudo conectar con el backend local (${environment.apiUrl}). Inicia backend-agenda con las variables configuradas en backend-agenda/.env y vuelve a intentarlo.`;

  enviarFormulario() {
    if (this.enviando()) return;

    const datos = {
      name: this.nombre().trim(),
      email: this.email().trim(),
      message: this.mensaje().trim(),
    };
    this.enviando.set(true);
    this.estadoEnvio.set('');
    this.errorEnvio.set(false);

    this.http.post<{ message: string }>(`${this.apiUrl}/contact`, datos).pipe(
      timeout({ first: 30000 })
    ).subscribe({
      next: response => {
        this.estadoEnvio.set(response.message);
        this.nombre.set('');
        this.email.set('');
        this.mensaje.set('');
        this.enviando.set(false);
      },
      error: (error: HttpErrorResponse) => {
        console.error('No se pudo enviar el formulario de contacto:', error);
        this.errorEnvio.set(true);
        const serverMessage = typeof error.error?.error === 'string'
          ? error.error.error
          : undefined;
        this.estadoEnvio.set(
          error instanceof TimeoutError
            ? 'El servidor tardó demasiado en responder. Tu mensaje puede no haberse enviado; espera un momento antes de volver a intentarlo.'
            : serverMessage
              || (error.status === 0
                ? this.errorServidorNoDisponible
                : `No se pudo enviar el mensaje (error ${error.status}). Revisa los registros del backend e inténtalo nuevamente.`)
        );
        this.enviando.set(false);
      }
    });
  }
}
