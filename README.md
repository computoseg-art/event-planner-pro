# 📅 BSfotografia & Videografia — Sistema de Gestión de Reservas

![Angular](https://img.shields.io/badge/Angular-19+-DD0031?style=for-the-badge&logo=angular&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-Realtime%20DB-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)

**BSfotografia & Videografia** es una aplicación de gestión de reservas para servicios de fotografía, video y celebraciones. Permite a los clientes reservar fechas y servicios de forma intuitiva, mientras que ofrece a los administradores control sobre la agenda y el estado financiero de cada evento.

---

## 🌟 Características Principales

### 🔐 Autenticación Segura

- Registro e inicio de sesión integrados con **Firebase Auth**.
- Diferenciación de roles entre **Clientes** y **Administradores**.

### 📅 Calendario Inteligente e Interactivo

- **Bloqueo Automático:** Las fechas ocupadas se marcan visualmente para evitar duplicados.
- **Visualización Diferenciada:** Los clientes pueden identificar sus propias reservas (en color verde) frente a fechas ocupadas por terceros (en rojo).
- **Formatos Estandarizados:** Manejo preciso de fechas para evitar errores de zona horaria.

### 🛒 Catálogo y Carrito Dinámico

- **Selección por Categorías:** El usuario elige primero el tipo de evento (Bodas, 15 Años, etc.) para filtrar los servicios compatibles.
- **Cálculo en Tiempo Real:** Cálculo automático de totales, montos de seña mínima y saldos pendientes.
- **Servicios Extras:** Posibilidad de añadir complementos generales a cualquier tipo de reserva.

### 👤 Panel Administrativo (Admin Mode)

- **Identificación de Clientes:** Los administradores pueden ver el email del usuario que realizó cada reserva.
- **Control de Pagos:** Herramientas para actualizar montos abonados y supervisar la deuda total del sistema.
- **Sincronización Instantánea:** Gracias a Firebase Realtime Database, cualquier cambio se refleja sin recargar la página.

---

## 🛠️ Tecnologías Utilizadas

- **Frontend:** [Angular 19+](https://angular.io/) utilizando **Signals** para una reactividad eficiente, RxJS Interop y componentes Standalone.
- **Backend / DB:** [Firebase Realtime Database](https://firebase.google.com/products/realtime-database).
- **Autenticación:** Firebase Authentication (Email/Password).
- **Estilos:** CSS3 nativo con metodología modular y diseño responsivo.

---

## 🚀 Instalación y Configuración

Sigue estos pasos para ejecutar el proyecto en tu entorno local:

1.  **Clonar el repositorio:**

    ```bash
    git clone [https://github.com/tu-usuario/event-planner-pro.git](https://github.com/tu-usuario/event-planner-pro.git)
    cd event-planner-pro
    ```

2.  **Instalar dependencias:**

    ```bash
    npm install
    ```

3.  **Configurar Firebase:**
    Asegúrate de configurar tus credenciales en el archivo `src/environments/environment.ts`:

    ```typescript
    export const environment = {
      firebase: {
        apiKey: 'TU_API_KEY',
        authDomain: 'TU_PROYECTO.firebaseapp.com',
        databaseURL: 'https://TU_PROYECTO.firebaseio.com',
        projectId: 'TU_PROYECTO_ID',
        storageBucket: 'TU_PROYECTO.appspot.com',
        messagingSenderId: 'TU_SENDER_ID',
        appId: 'TU_APP_ID',
      },
    };
    ```

4.  **Ejecutar servidor de desarrollo:**
    ```bash
    ng serve
    ```
    Navega a `http://localhost:4200/`.

---

## 📂 Estructura de Datos (Firebase)

El proyecto utiliza una estructura anidada por usuario para optimizar la seguridad y velocidad:

```json
{
  "reservas": {
    "usuario_codificado": {
      "reserva_id": {
        "fecha": "YYYY-MM-DD",
        "descripcion": "Boda de Maria",
        "tipoEvento": "bodas",
        "servicios": [...],
        "total": 15000,
        "pagado": 5000,
        "usuario": "cliente@correo.com"
      }
    }
  }
}
```
