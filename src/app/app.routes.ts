import { Routes } from '@angular/router';
import { HomeComponent } from './components/home/home';
import { Login } from './components/login/login';
import { ContactoComponent } from './components/contacto/contacto';
import { AgendaComponent } from './components/agenda/agenda';
import { Eventos } from './components/eventos/eventos'; // Nomenclatura moderna sin 'Component'
import { authGuard } from './guards/auth.guard';
import { guestGuard } from './guards/guest.guard';
import { GalleryComponent } from './components/gallery/gallery'; // Importa la clase Gallery

export const routes: Routes = [
  { path: 'home', component: HomeComponent, canActivate: [guestGuard] },
  { path: 'login', component: Login, canActivate: [guestGuard] },
  { path: 'contacto', component: ContactoComponent },
  { path: 'eventos', component: Eventos, canActivate: [authGuard] }, // Nueva carátula protegida
  { path: 'agenda', component: AgendaComponent, canActivate: [authGuard] },
  { path: 'galeria', component: GalleryComponent, canActivate: [authGuard] },
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: '**', redirectTo: 'home' }
];
