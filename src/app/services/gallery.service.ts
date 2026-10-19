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

export interface GalleryFolder {
  albumId: string;
  title: string;
  email: string;
  createdAt?: string;
  isDefault?: boolean;
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

  getFolders(email: string): Observable<GalleryFolder[]> {
    return this.authorizationHeaders().pipe(
      switchMap(headers =>
        this.http.get<GalleryFolder[]>(
          `${this.apiUrl}/gallery/${encodeURIComponent(email)}/folders`,
          { headers, params: { _refresh: Date.now() } }
        )
      )
    );
  }

  createFolder(email: string, title: string): Observable<GalleryFolder> {
    return this.authorizationHeaders().pipe(
      switchMap(headers =>
        this.http.post<GalleryFolder>(
          `${this.apiUrl}/gallery/folders`,
          { email, title },
          { headers }
        )
      )
    );
  }

  assignFolderToUser(email: string, albumId: string): Observable<GalleryFolder> {
    return this.authorizationHeaders().pipe(
      switchMap(headers =>
        this.http.post<GalleryFolder>(
          `${this.apiUrl}/gallery/folders/assign`,
          { email, albumId },
          { headers }
        )
      )
    );
  }

  getPhotos(email: string, albumId: string): Observable<Photo[]> {
    return this.authorizationHeaders().pipe(
      switchMap(headers =>
        this.http.get<Photo[]>(
          `${this.apiUrl}/gallery/${encodeURIComponent(email)}`,
          { headers, params: { albumId, _refresh: Date.now() } }
        )
      )
    );
  }

  uploadPhotos(
    targetEmail: string,
    albumId: string,
    files: File[]
  ): Observable<{ message: string }> {
    const formData = new FormData();
    formData.append('targetEmail', targetEmail);
    formData.append('albumId', albumId);
    files.forEach(file => formData.append('photos', file));

    return this.authorizationHeaders().pipe(
      switchMap(headers =>
        this.http.post<{ message: string }>(`${this.apiUrl}/upload-photos`, formData, { headers })
      )
    );
  }

  // Eliminar foto del álbum
  deletePhoto(photoId: string, email: string, albumId: string): Observable<{ message: string }> {
    return this.authorizationHeaders().pipe(
      switchMap(headers =>
        this.http.post<{ message: string }>(
          `${this.apiUrl}/delete-photo/${encodeURIComponent(photoId)}`,
          { email, albumId },
          { headers }
        )
      )
    );
  }
}
