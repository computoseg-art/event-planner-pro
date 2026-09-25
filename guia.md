## Hosting Firebase
https://fotos-44002.web.app

## Servidor Backend 
https://dashboard.render.com/

## Alojado en esta url (Render)
https://event-planner-pro-k978.onrender.com/

## Compilar para producción:
ng build --configuration production

## Subir los archivos compilados a Firebase:
firebase deploy --only hosting

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