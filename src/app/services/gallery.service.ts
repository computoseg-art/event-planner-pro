import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Photo {
  id: string;
  baseUrl: string;
  rawBaseUrl?: string;
  filename?: string;
  mimeType?: string;
}

@Injectable({
  providedIn: 'root'
})
export class GalleryService {
  private http = inject(HttpClient);
  private apiUrl = 'http://localhost:3000/api'; // Ajustar si el backend cambia de puerto u host

  // Obtener fotos del álbum de Google Photos por email
  getPhotosByEmail(email: string): Observable<Photo[]> {
    return this.http.get<Photo[]>(`${this.apiUrl}/gallery/${encodeURIComponent(email)}`);
  }

  // Asegurar o crear álbum para un usuario
  ensureAlbum(email: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/ensure-album`, { email });
  }

  // Subir fotos a la galería de un usuario
  uploadPhotos(targetEmail: string, files: File[]): Observable<any> {
    const formData = new FormData();
    formData.append('targetEmail', targetEmail);
    files.forEach(file => formData.append('photos', file));

    return this.http.post(`${this.apiUrl}/upload-photos`, formData);
  }

  // Eliminar foto del álbum
  deletePhoto(photoId: string, email: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/delete-photo/${photoId}`, { email });
  }
}
