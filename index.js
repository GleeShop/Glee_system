import { db } from "./firebase-config.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

window.applyMenuPermissions = function (userData) {
  const userRol = (userData.rol || "").toLowerCase();
  const perms = userData.permissions || {};

  const menuProductos = document.getElementById("menuProductos");
  const menuEntradas = document.getElementById("menuEntradas");
  const menuMovimientos = document.getElementById("menuMovimientos");
  const menuVentas = document.getElementById("menuVentas");
  const menuUsuarios = document.getElementById("menuUsuarios");
  const menuTiendas = document.getElementById("menuTiendas");
  const menuEmpleados = document.getElementById("menuEmpleados");

  if (userRol === "admin") {
    // Para admin se muestran todas las secciones
    if (menuProductos) menuProductos.style.display = "inline-block";
    if (menuEntradas) menuEntradas.style.display = "inline-block";
    if (menuMovimientos) menuMovimientos.style.display = "inline-block";
    if (menuVentas) menuVentas.style.display = "inline-block";
    if (menuUsuarios) menuUsuarios.style.display = "inline-block";
    if (menuTiendas) menuTiendas.style.display = "inline-block";
    if (menuEmpleados) menuEmpleados.style.display = "inline-block";
  } else {
    // Para usuarios no admin, se asignan los permisos según su objeto
    // Si no se especifica lo contrario, se muestran las secciones de ventas, tiendas y empleados.
    if (menuProductos) {
      if (perms.listaProductos && perms.listaProductos.habilitado) {
        menuProductos.style.display = "inline-block";
      } else {
        menuProductos.style.display = "none";
      }
    }
    if (menuEntradas) {
      menuEntradas.style.display = perms.entradas ? "inline-block" : "none";
    }
    if (menuMovimientos) {
      menuMovimientos.style.display = perms.movimientos ? "inline-block" : "none";
    }
    if (menuVentas) {
      // Asumimos que si no está en false, el usuario puede ver ventas
      menuVentas.style.display = (perms.ventasGenerales !== false) ? "inline-block" : "none";
    }
    if (menuUsuarios) {
      menuUsuarios.style.display = perms.usuarios ? "inline-block" : "none";
    }
    if (menuTiendas) {
      // Mostrar tiendas de vista si no se desactiva
      menuTiendas.style.display = (perms.tiendas !== false) ? "inline-block" : "none";
    }
    if (menuEmpleados) {
      // Mostrar empleados por defecto
      menuEmpleados.style.display = (perms.empleados !== false) ? "inline-block" : "none";
    }
  }
};

      window.logout = function () {
        localStorage.removeItem("loggedUser");
        window.location.href = "login.html";
      };

      document.addEventListener("DOMContentLoaded", async function () {
        const loggedUser = localStorage.getItem("loggedUser");
        if (!loggedUser) {
          window.location.href = "login.html";
        } else {
          document.getElementById("loggedUser").innerHTML = `<i class="fa-solid fa-user"></i> ${loggedUser}`;
          const usuariosRef = collection(db, "usuarios");
          const q = query(usuariosRef, where("username", "==", loggedUser));
          try {
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
              querySnapshot.forEach((doc) => {
                const userData = doc.data();
                if (userData.tienda) {
                  document.getElementById("userStore").textContent = userData.tienda;
                }
                window.applyMenuPermissions(userData);
              });
            } else {
              localStorage.removeItem("loggedUser");
              window.location.href = "login.html";
            }
          } catch (error) {
            console.error("Error fetching user data:", error);
          }
        }
      });
