@echo off
REM Script para preparar el ambiente de desarrollo local (Windows)
REM Uso: setup-dev.bat

echo.
echo 🚀 Configurando Firebase Functions - Event Planner Pro
echo ==================================================
echo.

REM Verificar Node.js
echo Verificando Node.js...
where /q node
if errorlevel 1 (
  echo ❌ Node.js no está instalado. Instálalo desde https://nodejs.org/
  exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo ✓ Node.js versión: %NODE_VERSION%

REM Verificar Firebase CLI
echo Verificando Firebase CLI...
where /q firebase
if errorlevel 1 (
  echo ⚠️ Firebase CLI no encontrado. Instalando...
  call npm install -g firebase-tools
)

for /f "tokens=*" %%i in ('firebase --version') do set FB_VERSION=%%i
echo ✓ Firebase CLI versión: %FB_VERSION%

REM Instalar dependencias
echo.
echo 📦 Instalando dependencias en functions/...
cd functions
call npm ci

REM Verificar .env
echo.
echo 🔐 Configurando variables de entorno...
if not exist .env (
  echo ⚠️ Archivo .env no encontrado.
  echo    Copiando .env.example -^> .env
  copy .env.example .env
  echo.
  echo ⚠️ IMPORTANTE: Edita .env con credenciales locales de prueba
  echo    Abre con: notepad .env
) else (
  echo ✓ Archivo .env ya existe
)

REM Compilar TypeScript
echo.
echo 🔨 Compilando TypeScript...
call npm run build

REM Listar versiones
echo.
echo ✓ Versiones instaladas:
call npm list firebase-admin firebase-functions express --depth=0

REM Resumen
echo.
echo ✅ SETUP COMPLETO
echo ==================================================
echo.
echo Próximos pasos:
echo.
echo 1️⃣  Inicia el emulador:
echo    firebase emulators:start --only functions
echo.
echo 2️⃣  En otra terminal, prueba la API:
echo    curl http://localhost:5001/fotos-44002/us-central1/api
echo.
echo 3️⃣  Para desplegar a staging:
echo    firebase deploy --only functions --project fotos-44002
echo.
echo 4️⃣  Ver logs en tiempo real:
echo    firebase functions:log --follow
echo.
echo 📖 Más info: type README.md
echo ==================================================
echo.
cd ..
