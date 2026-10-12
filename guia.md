## Hosting Firebase
https://calendario-71490.web.app

## Servidor Backend 
https://dashboard.render.com/

## Alojado en esta url (Render)
https://event-planner-pro-k978.onrender.com/

## Compilar para producción:
ng build --configuration production

## Proyecto Firebase de la agenda:
calendario-71490

## Publicar las reglas de Realtime Database:
firebase deploy --only database --project calendario-71490

## Subir los archivos compilados a Firebase Hosting:
ng build --configuration production
firebase deploy --only hosting --project calendario-71490

## Antes de probar el acceso:
- Habilita en Firebase Authentication de calendario-71490 los mismos proveedores de inicio de sesión.
- Comprueba que admin@gmail.com exista en Authentication de calendario-71490.
- Los archivos src/environments/environment.ts y environment.prod.ts están excluidos de Git; configura en ambos el Firebase config de calendario-71490 antes de compilar.
- CLIENT_URL en Render debe ser la URL pública de Hosting de calendario-71490 para que los pagos vuelvan a la agenda publicada.

# 2. Guardar y respaldar en GitHub
git add .
git commit -m "feat: actualización x"
git push origin main


# ------------------------------------------------------------------------------
# 1. Cambia a tu rama principal (usa 'master' si tu rama se llama master)
git checkout main

# 2. Trae los cambios de la rama pruebas a main
git merge pruebas

# 3. Sube la rama principal actualizada a GitHub
git push origin main
# -------------------------------------------------------------------------------

# 1. Compila la aplicación para producción
ng build

# 2. Despliega en Firebase Hosting
firebase deploy
# -------------------------------------------------------------------------------