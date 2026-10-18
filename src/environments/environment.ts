// src/environments/environment.prod.ts
export const environment = {
  production: false,
  // Backend local corriendo con Express (Node.js)
  apiUrl: 'http://localhost:3000',
  
  // Configuración de Firebase
  firebase: {
    apiKey: "AIzaSyC6h5sZScNZIWxj_y38EU_Po6fvz3GpzRY",
    authDomain: "fotos-44002.firebaseapp.com",
    databaseURL: "https://fotos-44002-default-rtdb.firebaseio.com",
    projectId: "fotos-44002",
    storageBucket: "fotos-44002.firebasestorage.app",
    messagingSenderId: "25999828890",
    appId: "1:25999828890:web:ff4f03161067d297c03c23",
    measurementId: "G-N1D0RPXJ50"
  }
};
