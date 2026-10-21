import { Routes } from '@angular/router';
import { HomeComponent } from './components/home/home';
import { ContactoComponent } from './components/contacto/contacto';
import { AgendaComponent } from './components/agenda/agenda';
import { Eventos } from './components/eventos/eventos';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: 'home', redirectTo: 'eventos', pathMatch: 'full' },
  { path: 'login', component: HomeComponent },
  { path: 'contacto', component: ContactoComponent },
  { path: 'eventos', component: Eventos },
  { path: 'agenda', component: AgendaComponent, canActivate: [authGuard] },
  { path: '', redirectTo: 'eventos', pathMatch: 'full' },
  { path: '**', redirectTo: 'eventos' },
];
