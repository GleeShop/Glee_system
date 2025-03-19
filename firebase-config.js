// firebase-config.js

// Importa las funciones base de Firebase (versión 9+)
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCqgcg0wDZWuiVHRduQet9syQXyMHR4ctY",
  authDomain: "bd-glee.firebaseapp.com",
  projectId: "bd-glee",
  storageBucket: "bd-glee.firebasestorage.app",
  messagingSenderId: "548757144603",
  appId: "1:548757144603:web:9b6b774de25294f455e4be",
  measurementId: "G-JK2EKD7MJ9"
};

// Inicializa la app de Firebase con tu configuración
const app = initializeApp(firebaseConfig);

// Obtén una instancia de Firestore
const db = getFirestore(app);

// Exporta la instancia para poder usarla en otros archivos
export { db };
