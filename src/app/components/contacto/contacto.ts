import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../environments/environment';

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

    this.http.post<{ message: string }>(`${this.apiUrl}/contact`, datos).subscribe({
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
        this.estadoEnvio.set(
          error.error?.error || 'No se pudo enviar tu mensaje. Inténtalo nuevamente más tarde.'
        );
        this.enviando.set(false);
      }
    });
  }
}
