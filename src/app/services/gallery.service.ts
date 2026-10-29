import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
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
  isFavorite: boolean;
  isHidden: boolean;
}

export interface GalleryFolder {
  albumId: string;
  title: string;
  email: string;
  createdAt?: string;
  isDefault?: boolean;
}

export interface B2StorageStatus {
  configured: boolean;
  connected: boolean;
  bucketName: string;
  region: string;
  storedBytes: number;
  reservedBytes: number;
  limitBytes: number;
}

export interface GallerySession {
  id: string;
  title: string;
  eventDate: string;
  description: string;
  createdAt: string;
  mediaCount: number;
}

export interface GalleryMedia {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
  url: string;
  downloadUrl: string;
  isFavorite: boolean;
  isHidden: boolean;
}

export interface MultipartUpload {
  uploadToken: string;
  mediaId: string;
  partSize: number;
  totalParts: number;
}

export interface MultipartPartUrl {
  partNumber: number;
  url: string;
}

@Injectable({
  providedIn: 'root'
})
export class GalleryService {
  private http = inject(HttpClient);
  private auth = inject(Auth);
  private apiUrl = `${environment.apiUrl}/api`;

  provisioningErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 404) {
        return 'El backend publicado todavía no tiene la creación automática de carpetas. ' +
          'Despliega la última versión de backend-agenda en Render.';
      }
      if (typeof error.error?.error === 'string') {
        return error.error.error;
      }
      if (error.status === 0) {
        return 'No se pudo conectar con el backend. Comprueba que el servicio de Render esté disponible.';
      }
    }
    return 'No se pudo crear o recuperar tu carpeta personal de Google Photos.';
  }

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

  ensureOwnFolder(email?: string): Observable<GalleryFolder> {
    return this.authorizationHeaders().pipe(
      switchMap(headers =>
        this.http.post<GalleryFolder>(
          `${this.apiUrl}/gallery/ensure-own-folder`,
          email ? { email } : {},
          { headers }
        )
      )
    );
  }

  checkB2Storage(): Observable<B2StorageStatus> {
    return this.authorizationHeaders().pipe(
      switchMap(headers =>
        this.http.get<B2StorageStatus>(`${this.apiUrl}/gallery/storage-status`, { headers })
      )
    );
  }

  getSessions(email?: string): Observable<GallerySession[]> {
    return this.authorizationHeaders().pipe(
      switchMap(headers => {
        const params = email ? new HttpParams().set('email', email) : undefined;
        return this.http.get<GallerySession[]>(`${this.apiUrl}/gallery/sessions`, { headers, params });
      })
    );
  }

  createSession(session: {
    email: string;
    title: string;
    eventDate: string;
    description: string;
  }): Observable<GallerySession> {
    return this.authorizationHeaders().pipe(
      switchMap(headers =>
        this.http.post<GallerySession>(`${this.apiUrl}/gallery/sessions`, session, { headers })
      )
    );
  }

  getSessionMedia(sessionId: string, email?: string): Observable<GalleryMedia[]> {
    return this.authorizationHeaders().pipe(
      switchMap(headers => {
        const params = email ? new HttpParams().set('email', email) : undefined;
        return this.http.get<GalleryMedia[]>(
          `${this.apiUrl}/gallery/sessions/${encodeURIComponent(sessionId)}/media`,
          { headers, params }
        );
      })
    );
  }

  initiateMediaUpload(
    sessionId: string,
    email: string,
    file: File
  ): Observable<MultipartUpload> {
    const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    const mimeType = file.type || (
      ['.dng', '.cr2', '.cr3', '.nef', '.arw', '.orf', '.rw2', '.raf'].includes(extension)
        ? 'application/octet-stream'
        : ''
    );
    return this.authorizationHeaders().pipe(
      switchMap(headers =>
        this.http.post<MultipartUpload>(
          `${this.apiUrl}/gallery/sessions/${encodeURIComponent(sessionId)}/uploads/initiate`,
          { email, filename: file.name, mimeType, size: file.size },
          { headers }
        )
      )
    );
  }

  getMultipartPartUrls(
    uploadToken: string,
    partNumbers: number[]
  ): Observable<{ urls: MultipartPartUrl[] }> {
    return this.authorizationHeaders().pipe(
      switchMap(headers =>
        this.http.post<{ urls: MultipartPartUrl[] }>(
          `${this.apiUrl}/gallery/uploads/${encodeURIComponent(uploadToken)}/part-urls`,
          { partNumbers },
          { headers }
        )
      )
    );
  }

  completeMediaUpload(
    uploadToken: string,
    parts: Array<{ partNumber: number; etag: string }>
  ): Observable<Pick<GalleryMedia, 'id' | 'filename' | 'mimeType' | 'size' | 'createdAt'>> {
    return this.authorizationHeaders().pipe(
      switchMap(headers =>
        this.http.post<Pick<GalleryMedia, 'id' | 'filename' | 'mimeType' | 'size' | 'createdAt'>>(
          `${this.apiUrl}/gallery/uploads/${encodeURIComponent(uploadToken)}/complete`,
          { parts },
          { headers }
        )
      )
    );
  }

  abortMediaUpload(uploadToken: string): Observable<{ message: string }> {
    return this.authorizationHeaders().pipe(
      switchMap(headers =>
        this.http.post<{ message: string }>(
          `${this.apiUrl}/gallery/uploads/${encodeURIComponent(uploadToken)}/abort`,
          {},
          { headers }
        )
      )
    );
  }

  updateSessionMediaPreference(
    sessionId: string,
    mediaId: string,
    preference: Pick<GalleryMedia, 'isFavorite' | 'isHidden'>
  ): Observable<{ mediaId: string } & Pick<GalleryMedia, 'isFavorite' | 'isHidden'>> {
    return this.authorizationHeaders().pipe(
      switchMap(headers =>
        this.http.put<{ mediaId: string } & Pick<GalleryMedia, 'isFavorite' | 'isHidden'>>(
          `${this.apiUrl}/gallery/sessions/${encodeURIComponent(sessionId)}/media/${encodeURIComponent(mediaId)}/preference`,
          preference,
          { headers }
        )
      )
    );
  }

  deleteSessionMedia(
    sessionId: string,
    mediaId: string,
    email: string
  ): Observable<{ message: string }> {
    return this.authorizationHeaders().pipe(
      switchMap(headers =>
        this.http.delete<{ message: string }>(
          `${this.apiUrl}/gallery/sessions/${encodeURIComponent(sessionId)}/media/${encodeURIComponent(mediaId)}`,
          { headers, params: new HttpParams().set('email', email) }
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

  updatePhotoPreference(
    albumId: string,
    photoId: string,
    preference: Pick<Photo, 'isFavorite' | 'isHidden'>
  ): Observable<{ photoId: string } & Pick<Photo, 'isFavorite' | 'isHidden'>> {
    return this.authorizationHeaders().pipe(
      switchMap(headers =>
        this.http.put<{ photoId: string } & Pick<Photo, 'isFavorite' | 'isHidden'>>(
          `${this.apiUrl}/gallery/photo-preferences`,
          { albumId, photoId, ...preference },
          { headers }
        )
      )
    );
  }

  uploadPhotos(
    targetEmail: string,
    files: File[]
  ): Observable<{ message: string }> {
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
