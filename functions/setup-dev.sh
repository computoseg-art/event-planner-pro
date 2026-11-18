#!/bin/bash
# Script para preparar el ambiente de desarrollo local
# Uso: ./setup-functions-dev.sh

set -e

echo "🚀 Configurando Firebase Functions - Event Planner Pro"
echo "=================================================="

# Verificar dependencias
echo "✓ Verificando Node.js..."
if ! command -v node &> /dev/null; then
  echo "❌ Node.js no está instalado. Instálalo desde https://nodejs.org/"
  exit 1
fi

echo "✓ Node.js versión: $(node --version)"

echo "✓ Verificando Firebase CLI..."
if ! command -v firebase &> /dev/null; then
  echo "⚠️ Firebase CLI no encontrado. Instalando..."
  npm install -g firebase-tools
fi

echo "✓ Firebase CLI versión: $(firebase --version)"

# Instalar dependencias en functions
echo ""
echo "📦 Instalando dependencias en functions/..."
cd functions
npm ci

# Verificar archivo .env
echo ""
echo "🔐 Configurando variables de entorno..."
if [ ! -f .env ]; then
  echo "⚠️ Archivo .env no encontrado."
  echo "   Copiando .env.example → .env"
  cp .env.example .env
  echo ""
  echo "⚠️ IMPORTANTE: Edita .env con credenciales locales de prueba"
  echo "   Vi: nano .env"
  echo "   O: code .env"
else
  echo "✓ Archivo .env ya existe"
fi

# Compilar TypeScript
echo ""
echo "🔨 Compilando TypeScript..."
npm run build

# Listar versiones de paquetes clave
echo ""
echo "✓ Versiones instaladas:"
npm list firebase-admin firebase-functions express --depth=0

# Resumen
echo ""
echo "✅ SETUP COMPLETO"
echo "=================================================="
echo ""
echo "Próximos pasos:"
echo ""
echo "1️⃣  Inicia el emulador:"
echo "   firebase emulators:start --only functions"
echo ""
echo "2️⃣  En otra terminal, prueba la API:"
echo "   curl http://localhost:5001/fotos-44002/us-central1/api"
echo ""
echo "3️⃣  Para desplegar a staging:"
echo "   firebase deploy --only functions --project fotos-44002"
echo ""
echo "4️⃣  Ver logs en tiempo real:"
echo "   firebase functions:log --follow"
echo ""
echo "📖 Más info: cat README.md"
echo "=================================================="
