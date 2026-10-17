## Hosting Firebase
https://fotos-44002.web.app

## Servidor Backend 
https://dashboard.render.com/

## Alojado en esta url (Render)
https://event-planner-pro-k978.onrender.com/

## Compilar para producción:
ng build --configuration production

## Proyecto Firebase de la agenda:
fotos-44002

## Publicar las reglas de Realtime Database:
firebase deploy --only database --project fotos-44002

## Subir los archivos compilados a Firebase Hosting:
ng build --configuration production
firebase deploy --only hosting --project fotos-44002

## Antes de probar el acceso:
- Habilita en Firebase Authentication de fotos-44002 los mismos proveedores de inicio de sesión.
- Comprueba que admin@gmail.com exista en Authentication de fotos-44002.
- Los archivos src/environments/environment.ts y environment.prod.ts están excluidos de Git; configura en ambos el Firebase config de fotos-44002 antes de compilar.
- CLIENT_URL en Render debe ser la URL pública de Hosting de fotos-44002 para que los pagos vuelvan a la agenda publicada.

# 1. Guardar y respaldar en GitHub (Rama actual: fotos)
git add .
git commit -m "feat: actualización x"
git push origin fotos

# ------------------------------------------------------------------------------
# FUSIONAR CAMBIOS A LA RAMA PRINCIPAL (si corresponde)
# 1. Cambia a tu rama principal o de producción
git checkout main

# 2. Trae los cambios de la rama fotos a main
git merge fotos

# 3. Sube la rama principal actualizada a GitHub
git push origin main

# 4. Regresa a tu rama de trabajo
git checkout fotos
# -------------------------------------------------------------------------------

# Despliegue rápido a producción en Firebase Hosting:
ng build --configuration production
firebase deploy --only hosting --project fotos-44002
# -------------------------------------------------------------------------------
