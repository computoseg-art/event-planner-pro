import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Auth } from '@angular/fire/auth';
import { Observable, defer, switchMap } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Photo {
  id: string;
  baseUrl: string;
  thumbnailUrl: string;
  downloadUrl: string;
  filename?: string;
  mimeType?: string;
}

interface GalleryResponse {
  message: string;
  albumId: string;
  email: string;
}

@Injectable({
  providedIn: 'root'
})
export class GalleryService {
  private http = inject(HttpClient);
  private auth = inject(Auth);
  private apiUrl = `${environment.apiUrl}/api`;

  private authorizationHeaders(): Observable<HttpHeaders> {
    return defer(async () => {
      const currentUser = this.auth.currentUser;
      if (!currentUser) {
        throw new Error('Debes iniciar sesión para acceder a la galería.');
      }
      const token = await currentUser.getIdToken();
      return new HttpHeaders({ Authorization: `Bearer ${token}` });
    });
  }

  // Obtener fotos del álbum de Google Photos por email
  getPhotosByEmail(email: string): Observable<Photo[]> {
    return this.authorizationHeaders().pipe(
      switchMap(headers =>
        this.http.get<Photo[]>(`${this.apiUrl}/gallery/${encodeURIComponent(email)}`, { headers })
      )
    );
  }

  // Asegurar o crear álbum para un usuario
  ensureAlbum(email: string): Observable<GalleryResponse> {
    return this.authorizationHeaders().pipe(
      switchMap(headers =>
        this.http.post<GalleryResponse>(`${this.apiUrl}/ensure-album`, { email }, { headers })
      )
    );
  }

  // Subir fotos a la galería de un usuario
  uploadPhotos(targetEmail: string, files: File[]): Observable<{ message: string }> {
    const formData = new FormData();
    formData.append('targetEmail', targetEmail);
    files.forEach(file => formData.append('photos', file));

    return this.authorizationHeaders().pipe(
      switchMap(headers =>
        this.http.post<{ message: string }>(`${this.apiUrl}/upload-photos`, formData, { headers })
      )
    );
  }

  // Eliminar foto del álbum
  deletePhoto(photoId: string, email: string): Observable<{ message: string }> {
    return this.authorizationHeaders().pipe(
      switchMap(headers =>
        this.http.post<{ message: string }>(
          `${this.apiUrl}/delete-photo/${encodeURIComponent(photoId)}`,
          { email },
          { headers }
        )
      )
    );
  }
}
