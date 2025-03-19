// Importa la configuración de Firebase desde firebase-config.js
import { db } from "./firebase-config.js";
import {
  collection,
  query,
  orderBy,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

/**
 * Función para cargar los usuarios desde Firestore y llenar el select.
 */
async function loadUsers() {
  try {
    const usuariosRef = collection(db, "usuarios");
    const q = query(usuariosRef, orderBy("username"));
    const snapshot = await getDocs(q);

    const userSelect = document.getElementById("userSelect");
    userSelect.innerHTML = "";
    snapshot.forEach((docSnap) => {
      const user = docSnap.data();
      // Se asume que el campo 'username' existe en cada documento
      const option = document.createElement("option");
      option.value = user.username;
      option.textContent = user.username;
      userSelect.appendChild(option);
    });
  } catch (error) {
    console.error("Error al cargar usuarios:", error);
    Swal.fire("Error", "Error al cargar usuarios: " + error.message, "error");
  }
}

/**
 * Función para manejar el login.
 */
async function handleLogin() {
  const selectedUser = document.getElementById("userSelect").value;
  const passwordInput = document.getElementById("passwordInput").value;

  try {
    const usuariosRef = collection(db, "usuarios");
    const q = query(usuariosRef, where("username", "==", selectedUser));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      Swal.fire("Error", "Usuario no encontrado.", "error");
      return;
    }

    let userData;
    querySnapshot.forEach((docSnap) => {
      userData = docSnap.data();
    });

    if (!userData) {
      Swal.fire("Error", "Usuario no encontrado.", "error");
      return;
    }

    if (userData.password !== passwordInput) {
      Swal.fire("Error", "Contraseña incorrecta.", "error");
      return;
    }

    // Login exitoso: guardar datos en localStorage
    localStorage.setItem("loggedUser", userData.username);
    localStorage.setItem("loggedUserRole", userData.rol || "");
    localStorage.setItem("loggedUserStore", userData.tienda || "");

    // Redirigir a la página principal (index.html)
    window.location.href = "index.html";
  } catch (error) {
    console.error("Error en login:", error);
    Swal.fire("Error", "Error en login: " + error.message, "error");
  }
}

// Al cargar la página, cargar la lista de usuarios y asignar eventos
document.addEventListener("DOMContentLoaded", () => {
  loadUsers();
  document.getElementById("btnLogin").addEventListener("click", handleLogin);
});
