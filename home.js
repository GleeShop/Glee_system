import { db } from "./firebase-config.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

window.applyMenuPermissions = function(userData) {
  const userRol = (userData.rol || "").toLowerCase();
  const perms   = userData.permissions || {};

  const menuProductos    = document.getElementById("menuProductos");
  const menuEntradas     = document.getElementById("menuEntradas");
  const submenuEntradas  = document.getElementById("submenuEntradas");
  const menuMovimientos  = document.getElementById("menuMovimientos");
  const menuVentas       = document.getElementById("menuVentas");
  const menuUsuarios     = document.getElementById("menuUsuarios");
  const menuTiendas      = document.getElementById("menuTiendas");
  const menuEmpleados    = document.getElementById("menuEmpleados");

  if (userRol === "admin") {
    // Admin ve todo
    [menuProductos, menuEntradas, menuMovimientos, menuVentas, menuUsuarios, menuTiendas, menuEmpleados]
      .forEach(m => { if (m) m.style.display = "inline-block"; });
  }
  else if (userRol === "sucursal") {
    // --- Productos ---
    if (menuProductos) menuProductos.style.display = "inline-block";

    // --- Ingreso de productos (padre + submenú) ---
    if (submenuEntradas) {
      const entradaItem  = submenuEntradas.querySelector('a[href="entradaMercaderia.html"]')?.closest("li");
      const trasladoItem = submenuEntradas.querySelector('a[href="traslados.html"]')?.closest("li");
      const devolItem    = submenuEntradas.querySelector('a[href="devolucion.html"]')?.closest("li");

      // Mostrar sub-items según permisos
      if (entradaItem)  entradaItem.style.display  = perms.entradas    ? "list-item" : "none";
      if (trasladoItem) trasladoItem.style.display = perms.movimientos ? "list-item" : "none";
      if (devolItem)    devolItem.style.display    = perms.salidas      ? "list-item" : "none";

      // Mostrar menú padre si tiene permiso global o al menos un sub-item visible
      const anyVisible = [entradaItem, trasladoItem, devolItem]
        .some(item => item && item.style.display === "list-item");
      const showParent = perms.ingresoProductos || anyVisible;
      if (menuEntradas) menuEntradas.style.display = showParent ? "inline-block" : "none";
    }

    // --- Movimientos: siempre oculto para sucursal ---
    if (menuMovimientos) menuMovimientos.style.display = "none";

    // --- Ventas ---
    if (menuVentas) menuVentas.style.display = "inline-block";

    // --- Usuarios y Tiendas: sin acceso ---
    if (menuUsuarios) menuUsuarios.style.display = "none";
    if (menuTiendas)  menuTiendas.style.display  = "none";

    // --- Empleados ---
    if (menuEmpleados) menuEmpleados.style.display = "inline-block";
  }
  else {
    // --- Otros roles: misma lógica genérica que antes ---

    // Productos
    if (menuProductos) {
      const show = perms.listaProductos?.habilitado;
      menuProductos.style.display = show ? "inline-block" : "none";
    }

    // Ingreso de productos (padre + submenú)
    if (submenuEntradas) {
      const entradaItem  = submenuEntradas.querySelector('a[href="entradaMercaderia.html"]')?.closest("li");
      const trasladoItem = submenuEntradas.querySelector('a[href="traslados.html"]')?.closest("li");
      const devolItem    = submenuEntradas.querySelector('a[href="devolucion.html"]')?.closest("li");

      if (entradaItem)  entradaItem.style.display  = perms.entradas    ? "list-item" : "none";
      if (trasladoItem) trasladoItem.style.display = perms.movimientos ? "list-item" : "none";
      if (devolItem)    devolItem.style.display    = perms.salidas      ? "list-item" : "none";

      const anyVisible = [entradaItem, trasladoItem, devolItem]
        .some(item => item && item.style.display === "list-item");
      const showParent = perms.ingresoProductos || anyVisible;
      if (menuEntradas) menuEntradas.style.display = showParent ? "inline-block" : "none";
    }

    // Movimientos
    if (menuMovimientos) {
      menuMovimientos.style.display = perms.movimientos ? "inline-block" : "none";
    }

    // Ventas
    if (menuVentas) {
      const show = perms.ventasGenerales !== false;
      menuVentas.style.display = show ? "inline-block" : "none";
    }

    // Usuarios
    if (menuUsuarios) {
      menuUsuarios.style.display = perms.usuarios ? "inline-block" : "none";
    }

    // Tiendas
    if (menuTiendas) {
      const show = perms.tiendas !== false;
      menuTiendas.style.display = show ? "inline-block" : "none";
    }

    // Empleados
    if (menuEmpleados) {
      const show = perms.empleados !== false;
      menuEmpleados.style.display = show ? "inline-block" : "none";
    }
  }
};

window.toggleSidebar = function() {
  document.getElementById("sidebar").classList.toggle("show");
};

window.logout = function() {
  localStorage.removeItem("loggedUser");
  window.location.href = "login.html";
};

document.addEventListener("DOMContentLoaded", async function() {
  const loggedUser = localStorage.getItem("loggedUser");
  if (!loggedUser) {
    return window.location.href = "login.html";
  }

  document.getElementById("loggedUser").innerHTML =
    `<i class="fa-solid fa-user"></i> ${loggedUser}`;

  const usuariosRef = collection(db, "usuarios");
  const q = query(usuariosRef, where("username", "==", loggedUser));

  try {
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      localStorage.removeItem("loggedUser");
      return window.location.href = "login.html";
    }
    snapshot.forEach(docSnap => {
      const userData = docSnap.data();
      if (userData.tienda) {
        document.getElementById("userStore").textContent = userData.tienda;
      }
      applyMenuPermissions(userData);
    });
  } catch (err) {
    console.error("Error fetching user data:", err);
  }
});
