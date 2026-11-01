import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom, take } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import {
  GalleryMedia,
  GalleryService,
  GallerySession,
  MultipartUpload,
} from '../../services/gallery.service';

const maxMediaSizeBytes = 9_000_000_000;
const allowedRawExtensions = new Set([
  '.dng', '.cr2', '.cr3', '.nef', '.arw', '.orf', '.rw2', '.raf',
]);
const partUrlBatchSize = 12;
const uploadConcurrency = 3;

function isSupportedMedia(file: File): boolean {
  if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
    return true;
  }
  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  return allowedRawExtensions.has(extension);
}

@Component({
  selector: 'app-gallery',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './gallery.html',
  styleUrls: ['./gallery.css']
})
export class GalleryComponent implements OnInit, OnDestroy {
  private galleryService = inject(GalleryService);
  private route = inject(ActivatedRoute);
  auth = inject(AuthService);

  sessions: GallerySession[] = [];
  media: GalleryMedia[] = [];
  userEmail = '';
  targetEmail = '';
  selectedSessionId = '';
  sessionTitle = '';
  sessionDate = '';
  sessionDescription = '';
  selectedFiles: File[] = [];
  uploadProgress = '';
  errorMessage = '';
  b2StorageStatus = '';
  activeCollection: 'gallery' | 'favorites' | 'hidden' = 'gallery';
  currentMediaIndex = 0;
  isLoading = false;
  isCreatingSession = false;
  isUploading = false;
  isDeletingMedia = false;
  isSavingPreference = false;
  isCheckingB2Storage = false;
  private readonly uploadControllers = new Set<AbortController>();
  private readonly pendingUploadTokens = new Set<string>();

  get selectedSession(): GallerySession | undefined {
    return this.sessions.find(session => session.id === this.selectedSessionId);
  }

  get visibleMedia(): GalleryMedia[] {
    switch (this.activeCollection) {
      case 'favorites':
        return this.media.filter(item => item.isFavorite && !item.isHidden);
      case 'hidden':
        return this.media.filter(item => item.isHidden);
      default:
        return this.auth.esAdminGaleria()
          ? this.media
          : this.media.filter(item => !item.isHidden);
    }
  }

  get currentMedia(): GalleryMedia | undefined {
    return this.visibleMedia[this.currentMediaIndex];
  }

  get visibleMediaCount(): number {
    return this.media.filter(item => !item.isHidden).length;
  }

  get favoriteMediaCount(): number {
    return this.media.filter(item => item.isFavorite && !item.isHidden).length;
  }

  get hiddenMediaCount(): number {
    return this.media.filter(item => item.isHidden).length;
  }

  get isCurrentVideo(): boolean {
    return this.currentMedia?.mimeType.startsWith('video/') === true;
  }

  formatStorage(bytes: number): string {
    return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
  }

  async ngOnInit(): Promise<void> {
    this.isLoading = true;
    try {
      const currentUser = await firstValueFrom(this.auth.user$.pipe(take(1)));
      const currentEmail = currentUser?.email?.trim().toLowerCase();
      if (!currentEmail) {
        this.errorMessage = 'Inicia sesión para ver tus galerías.';
        this.isLoading = false;
        return;
      }

      const requestedEmail = this.route.snapshot.queryParamMap.get('email');
      this.userEmail = this.auth.esAdminGaleria()
        ? requestedEmail?.trim().toLowerCase() || ''
        : currentEmail;
      this.targetEmail = this.userEmail;
      if (this.userEmail) {
        this.loadSessions();
      } else {
        this.isLoading = false;
      }
    } catch (error) {
      console.error('No se pudo comprobar la sesión para cargar la galería:', error);
      this.errorMessage = 'No se pudo comprobar tu sesión. Intenta iniciar sesión nuevamente.';
      this.isLoading = false;
    }
  }

  ngOnDestroy(): void {
    this.uploadControllers.forEach(controller => controller.abort());
    this.uploadControllers.clear();
    this.pendingUploadTokens.forEach(uploadToken => {
      void firstValueFrom(this.galleryService.abortMediaUpload(uploadToken)).catch(error => {
        console.error('No se pudo cancelar una carga al salir de la galería:', error);
      });
    });
    this.pendingUploadTokens.clear();
  }

  openTargetGallery(): void {
    const email = this.targetEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      this.errorMessage = 'Ingresa un correo válido para abrir las galerías del cliente.';
      return;
    }
    this.userEmail = email;
    this.selectedSessionId = '';
    this.sessions = [];
    this.media = [];
    this.loadSessions();
  }

  checkB2Storage(): void {
    if (this.isCheckingB2Storage || !this.auth.esAdminGaleria()) return;
    this.isCheckingB2Storage = true;
    this.b2StorageStatus = '';
    this.galleryService.checkB2Storage().subscribe({
      next: status => {
        this.b2StorageStatus =
          `Conexión correcta con ${status.bucketName} (${status.region}). ` +
          `Uso reservado/almacenado: ${this.formatStorage(status.storedBytes + status.reservedBytes)} / ` +
          `${this.formatStorage(status.limitBytes)}.`;
        this.isCheckingB2Storage = false;
      },
      error: error => {
        console.error('No se pudo verificar la conexión a Backblaze B2:', error);
        this.b2StorageStatus =
          error.error?.error || 'No se pudo conectar con B2. Revisa las variables del backend.';
        this.isCheckingB2Storage = false;
      }
    });
  }

  loadSessions(): void {
    if (!this.userEmail) return;
    this.isLoading = true;
    this.errorMessage = '';
    this.galleryService.getSessions(
      this.auth.esAdminGaleria() ? this.userEmail : undefined
    ).subscribe({
      next: sessions => {
        this.sessions = sessions;
        this.isLoading = false;
        if (!sessions.some(session => session.id === this.selectedSessionId)) {
          this.selectedSessionId = '';
          this.media = [];
        }
      },
      error: error => {
        console.error('No se pudieron cargar las sesiones de la galería:', error);
        this.errorMessage =
          error.error?.error || 'No se pudieron cargar las sesiones de la galería.';
        this.isLoading = false;
      }
    });
  }

  createSession(): void {
    if (
      !this.auth.esAdminGaleria() ||
      !this.userEmail ||
      !this.sessionTitle.trim() ||
      this.isCreatingSession
    ) {
      return;
    }
    this.isCreatingSession = true;
    this.errorMessage = '';
    this.galleryService.createSession({
      email: this.userEmail,
      title: this.sessionTitle.trim(),
      eventDate: this.sessionDate,
      description: this.sessionDescription.trim(),
    }).subscribe({
      next: session => {
        this.sessions = [session, ...this.sessions];
        this.sessionTitle = '';
        this.sessionDate = '';
        this.sessionDescription = '';
        this.isCreatingSession = false;
        this.selectSession(session.id);
      },
      error: error => {
        console.error('No se pudo crear la sesión de la galería:', error);
        this.errorMessage =
          error.error?.error || 'No se pudo crear la sesión. Intenta nuevamente.';
        this.isCreatingSession = false;
      }
    });
  }

  selectSession(sessionId: string): void {
    this.selectedSessionId = sessionId;
    this.activeCollection = 'gallery';
    this.currentMediaIndex = 0;
    this.loadSessionMedia();
  }

  loadSessionMedia(): void {
    if (!this.selectedSessionId) {
      this.media = [];
      return;
    }
    this.isLoading = true;
    this.errorMessage = '';
    this.galleryService.getSessionMedia(
      this.selectedSessionId,
      this.auth.esAdminGaleria() ? this.userEmail : undefined
    ).subscribe({
      next: media => {
        this.media = media;
        this.currentMediaIndex = 0;
        this.isLoading = false;
        this.sessions = this.sessions.map(session =>
          session.id === this.selectedSessionId
            ? { ...session, mediaCount: media.length }
            : session
        );
      },
      error: error => {
        console.error('No se pudo cargar la galería de la sesión:', error);
        this.media = [];
        this.errorMessage =
          error.error?.error || 'No se pudo cargar la galería. Intenta nuevamente.';
        this.isLoading = false;
      }
    });
  }

  setSelectedFiles(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const files = Array.from(input.files || []);
    if (files.some(file => file.size > maxMediaSizeBytes)) {
      this.selectedFiles = [];
      this.errorMessage = 'El límite gratuito de esta galería es 9 GB en total para todas las sesiones.';
    } else if (files.some(file => !isSupportedMedia(file))) {
      this.selectedFiles = [];
      this.errorMessage = 'Elige fotos o videos compatibles (por ejemplo JPG, PNG, WebP, MP4 o WebM).';
    } else {
      this.selectedFiles = files;
      this.errorMessage = '';
    }
    input.value = '';
  }

  async uploadMedia(): Promise<void> {
    if (
      !this.auth.esAdminGaleria() ||
      !this.userEmail ||
      !this.selectedSessionId ||
      this.selectedFiles.length === 0 ||
      this.isUploading
    ) {
      return;
    }

    this.isUploading = true;
    this.errorMessage = '';
    const files = [...this.selectedFiles];
    let uploadedBytes = 0;
    const totalBytes = files.reduce((total, file) => total + file.size, 0);

    for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
      const file = files[fileIndex];
      let upload: MultipartUpload | undefined;
      try {
        upload = await firstValueFrom(
          this.galleryService.initiateMediaUpload(this.selectedSessionId, this.userEmail, file)
        );
        this.pendingUploadTokens.add(upload.uploadToken);
        const parts: Array<{ partNumber: number; etag: string }> = [];
        for (let firstPart = 1; firstPart <= upload.totalParts; firstPart += partUrlBatchSize) {
          const partNumbers = Array.from(
            { length: Math.min(partUrlBatchSize, upload.totalParts - firstPart + 1) },
            (_value, offset) => firstPart + offset
          );
          const { urls } = await firstValueFrom(
            this.galleryService.getMultipartPartUrls(upload.uploadToken, partNumbers)
          );
          const uploadedParts = await this.uploadPartBatch(file, upload, urls, uploadedBytes, totalBytes);
          parts.push(...uploadedParts);
          uploadedBytes += uploadedParts.reduce((total, part) => {
            const start = (part.partNumber - 1) * upload!.partSize;
            return total + Math.min(upload!.partSize, file.size - start);
          }, 0);
          this.uploadProgress =
            `${fileIndex + 1}/${files.length} archivos · ${Math.round(uploadedBytes / totalBytes * 100)}%`;
        }
        await firstValueFrom(this.galleryService.completeMediaUpload(upload.uploadToken, parts));
        this.pendingUploadTokens.delete(upload.uploadToken);
      } catch (error) {
        console.error(`No se pudo cargar "${file.name}" a B2:`, error);
        if (upload) {
          try {
            await firstValueFrom(this.galleryService.abortMediaUpload(upload.uploadToken));
          } catch (abortError) {
            console.error('No se pudo cancelar la carga parcial a B2:', abortError);
          }
          this.pendingUploadTokens.delete(upload.uploadToken);
        }
        const detail = error instanceof HttpErrorResponse && typeof error.error?.error === 'string'
          ? error.error.error
          : error instanceof Error ? error.message : 'Intenta nuevamente.';
        this.errorMessage = `No se pudo subir "${file.name}". ${detail}`;
        this.isUploading = false;
        this.uploadProgress = '';
        this.loadSessionMedia();
        return;
      }
    }

    this.selectedFiles = [];
    this.isUploading = false;
    this.uploadProgress = '';
    this.loadSessionMedia();
  }

  private async uploadPartBatch(
    file: File,
    upload: MultipartUpload,
    partUrls: Array<{ partNumber: number; url: string }>,
    uploadedBytes: number,
    totalBytes: number
  ): Promise<Array<{ partNumber: number; etag: string }>> {
    const results: Array<{ partNumber: number; etag: string }> = [];
    let nextIndex = 0;
    const workers = Array.from(
      { length: Math.min(uploadConcurrency, partUrls.length) },
      async () => {
        while (nextIndex < partUrls.length) {
          const partUrl = partUrls[nextIndex++];
          const start = (partUrl.partNumber - 1) * upload.partSize;
          const end = Math.min(start + upload.partSize, file.size);
          const body = file.slice(start, end);
          let lastError: unknown;
          for (let attempt = 1; attempt <= 3; attempt++) {
            const controller = new AbortController();
            this.uploadControllers.add(controller);
            try {
              const response = await fetch(partUrl.url, {
                method: 'PUT',
                body,
                signal: controller.signal,
              });
              if (!response.ok) {
                throw new Error(`B2 respondió HTTP ${response.status} al subir una parte.`);
              }
              const etag = response.headers.get('ETag');
              if (!etag) {
                throw new Error('B2 no expuso el encabezado ETag. Revisa la regla CORS del bucket.');
              }
              results.push({ partNumber: partUrl.partNumber, etag });
              const progressBytes = uploadedBytes + body.size;
              this.uploadProgress =
                `${Math.round(progressBytes / totalBytes * 100)}% subiendo archivo`;
              lastError = undefined;
              break;
            } catch (error) {
              if (controller.signal.aborted) {
                throw error;
              }
              lastError = error;
              if (attempt < 3) {
                await new Promise(resolve => setTimeout(resolve, attempt * 1000));
              }
            } finally {
              this.uploadControllers.delete(controller);
            }
          }
          if (lastError) throw lastError;
        }
      }
    );
    await Promise.all(workers);
    return results.sort((a, b) => a.partNumber - b.partNumber);
  }

  setCollection(collection: 'gallery' | 'favorites' | 'hidden'): void {
    this.activeCollection = collection;
    this.currentMediaIndex = 0;
  }

  selectMedia(index: number): void {
    this.currentMediaIndex = index;
  }

  previousMedia(): void {
    if (this.visibleMedia.length > 1) {
      this.currentMediaIndex =
        (this.currentMediaIndex - 1 + this.visibleMedia.length) % this.visibleMedia.length;
    }
  }

  nextMedia(): void {
    if (this.visibleMedia.length > 1) {
      this.currentMediaIndex = (this.currentMediaIndex + 1) % this.visibleMedia.length;
    }
  }

  toggleFavorite(): void {
    if (this.currentMedia) {
      this.saveMediaPreference(this.currentMedia, !this.currentMedia.isFavorite, this.currentMedia.isHidden);
    }
  }

  toggleHidden(): void {
    if (this.currentMedia) {
      this.saveMediaPreference(this.currentMedia, this.currentMedia.isFavorite, !this.currentMedia.isHidden);
    }
  }

  private saveMediaPreference(media: GalleryMedia, isFavorite: boolean, isHidden: boolean): void {
    if (this.isSavingPreference || !this.selectedSessionId) return;
    this.isSavingPreference = true;
    this.errorMessage = '';
    this.galleryService.updateSessionMediaPreference(this.selectedSessionId, media.id, {
      isFavorite,
      isHidden,
    }).subscribe({
      next: preference => {
        Object.assign(media, preference);
        this.isSavingPreference = false;
        this.currentMediaIndex = Math.min(
          this.currentMediaIndex,
          Math.max(0, this.visibleMedia.length - 1)
        );
      },
      error: error => {
        console.error('No se pudo guardar la preferencia del archivo:', error);
        this.isSavingPreference = false;
        this.errorMessage =
          error.error?.error || 'No se pudo guardar la preferencia. Intenta nuevamente.';
      }
    });
  }

  deleteCurrentMedia(): void {
    const current = this.currentMedia;
    if (
      !current ||
      this.isDeletingMedia ||
      !this.auth.esAdminGaleria() ||
      !this.userEmail ||
      !this.selectedSessionId
    ) {
      return;
    }
    if (!confirm(`¿Eliminar "${current.filename}" de esta galería? Esta acción no se puede deshacer.`)) {
      return;
    }
    this.isDeletingMedia = true;
    this.galleryService.deleteSessionMedia(this.selectedSessionId, current.id, this.userEmail).subscribe({
      next: () => {
        this.isDeletingMedia = false;
        this.loadSessionMedia();
      },
      error: error => {
        console.error('No se pudo eliminar el archivo de B2:', error);
        this.isDeletingMedia = false;
        this.errorMessage =
          error.error?.error || 'No se pudo eliminar el archivo. Intenta nuevamente.';
      }
    });
  }
}
