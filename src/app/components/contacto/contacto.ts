import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-contacto',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './contacto.html',
  styleUrl: './contacto.css',
})
export class ContactoComponent {
  // Definimos el estado del formulario con un Signal
  // En Angular 20, esto permite que la UI reaccione instantáneamente
  nombre = signal(''); // Inicializamos el estado del formulario con valores vacíos
  email = signal('');
  mensaje = signal('');

  enviarFormulario() {
    const datos = {
      nombre: this.nombre().trim(),
      email: this.email().trim(),
      mensaje: this.mensaje().trim(),
    };

    console.log('Datos enviados:', datos);

    // Limpieza de formulario
    this.nombre.set('');
    this.email.set('');
    this.mensaje.set('');
  }
}
