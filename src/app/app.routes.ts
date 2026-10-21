import { Routes } from '@angular/router';
import { HomeComponent } from './components/home/home';
import { ContactoComponent } from './components/contacto/contacto';
import { AgendaComponent } from './components/agenda/agenda';
import { Eventos } from './components/eventos/eventos'; // Nomenclatura moderna sin 'Component'
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
<<<<<<< Updated upstream
  { path: 'home', component: HomeComponent },
=======
  { path: 'home', redirectTo: 'eventos', pathMatch: 'full' },
  { path: 'login', component: HomeComponent, canActivate: [guestGuard] },
>>>>>>> Stashed changes
  { path: 'contacto', component: ContactoComponent },
  { path: 'eventos', component: Eventos },
  { path: 'agenda', component: AgendaComponent, canActivate: [authGuard] },
<<<<<<< Updated upstream
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: '**', redirectTo: 'home' }
=======
  { path: 'galeria', component: GalleryComponent, canActivate: [authGuard] },
  { path: '', redirectTo: 'eventos', pathMatch: 'full' },
  { path: '**', redirectTo: 'eventos' }
>>>>>>> Stashed changes
];
