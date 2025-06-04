import { db } from "./firebase-config.js";
import {
  collection,
  query,
  orderBy,
  where,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  doc
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

/************ VARIABLES GLOBALES ************/
let users = [];
let roles = [];
let stores = [];

// Se definen los permisos de usuario de forma fija
let userPermissions = {
  crearUsuario: true,
  editarUsuario: true,
  eliminarUsuario: true,
  toggleUsuario: true,
  administrarRoles: true
};

/************ FUNCIONES AUXILIARES ************/
function showUserForm() {
  const form = document.getElementById("userForm");
  form.reset();

  // Asegurarnos de que el checkbox de ingreso de productos esté en false al crear
  document.getElementById("permIngresoProductosUser").checked = false;

  document.getElementById("userId").value = "";
  document.getElementById("userModalLabel").textContent = "Crear Usuario";
  document.getElementById("userStore").disabled = false;
  document.getElementById("userRole").disabled = false;
  new bootstrap.Modal(document.getElementById("userModal")).show();
}
window.showUserForm = showUserForm;

async function loadStores() {
  try {
    const tiendasRef = collection(db, "tiendas");
    const qTiendas = query(tiendasRef, orderBy("nombre"));
    const snapshot = await getDocs(qTiendas);
    stores = [];
    const storeSelect = document.getElementById("userStore");
    storeSelect.innerHTML = "<option value=''>Seleccione tienda</option>";
    snapshot.forEach((docSnap) => {
      const store = docSnap.data();
      store.id = docSnap.id;
      stores.push(store);
      const option = document.createElement("option");
      option.value = store.nombre;
      option.textContent = store.nombre;
      storeSelect.appendChild(option);
    });
  } catch (error) {
    console.error("Error al cargar tiendas:", error);
    Swal.fire("Error", "Error al cargar tiendas: " + error.message, "error");
  }
}

/************ FUNCIONES PARA ROLES ************/
async function ensureAdminRole() {
  try {
    const rolesRef = collection(db, "roles");
    const qRoles = query(rolesRef, where("roleName", "==", "admin"));
    const snapshot = await getDocs(qRoles);
    if (snapshot.empty) {
      await addDoc(rolesRef, {
        roleName: "admin",
        roleDescription: "Rol de administrador con todos los permisos",
        permissions: {
          listaProductos: {
            habilitado: true,
            botones: {
              crearProducto: true,
              editarProducto: true,
              eliminarProducto: true,
              modificarStock: true,
              cargarTexto: true
            }
          },
          entradas: true,
          movimientos: true,
          salidas: true,
          usuarios: true,
          tiendas: true,
          ventasGenerales: true,
          historialVentas: true,
          preventas: true
        }
      });
    }
  } catch (error) {
    console.error("Error asegurando rol admin:", error);
  }
}

/**
 * Se asegura de que exista un rol “bodega” con permisos
 * solo para crear/editar/eliminar/stock en inventario y “Ingreso de productos”.
 */
async function ensureBodegaRole() {
  try {
    const rolesRef = collection(db, "roles");
    const qBodega = query(rolesRef, where("roleName", "==", "bodega"));
    const snapshot = await getDocs(qBodega);

    if (snapshot.empty) {
      await addDoc(rolesRef, {
        roleName: "bodega",
        roleDescription: "Rol de Bodega: solo crear/editar/eliminar/stock en inventario",
        permissions: {
          listaProductos: {
            habilitado: true,
            botones: {
              crearProducto:    true,
              editarProducto:   true,
              eliminarProducto: true,
              modificarStock:   true,
              cargarTexto:      false
            }
          },
          ingresoProductos: true,
          entradas:         false,
          movimientos:      false,
          salidas:          false,
          usuarios:         false,
          tiendas:          false,
          ventasGenerales:  false,
          historialVentas:  false,
          preventas:        false
        }
      });
      console.log("Se creó el rol ‘bodega’ en Firestore con los permisos correctos.");
    }
  } catch (error) {
    console.error("Error asegurando rol bodega:", error);
  }
}

async function loadRoles() {
  try {
    // Primero nos aseguramos de que existan los roles "admin" y "bodega"
    await ensureAdminRole();
    await ensureBodegaRole();

    const rolesRef = collection(db, "roles");
    const qRoles = query(rolesRef, orderBy("roleName"));
    const snapshot = await getDocs(qRoles);
    roles = [];
    const roleSelect = document.getElementById("userRole");
    roleSelect.innerHTML = "<option value=''>Seleccione rol</option>";
    snapshot.forEach((docSnap) => {
      const role = docSnap.data();
      role.id = docSnap.id;
      roles.push(role);
      const option = document.createElement("option");
      option.value = role.roleName;
      option.textContent = role.roleName;
      roleSelect.appendChild(option);
    });
    loadRolesTable();
  } catch (error) {
    console.error("Error al cargar roles:", error);
    Swal.fire("Error", "Error al cargar roles: " + error.message, "error");
  }
}

function loadRolesTable() {
  const tbody = document.querySelector("#rolesTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  roles.forEach((role) => {
    const row = tbody.insertRow();
    row.insertCell(0).textContent = role.roleName;

    // Construir el listado de permisos
    const perms = [];
    if (role.permissions) {
      // Manejo de listaProductos y sus botones
      if (role.permissions.listaProductos?.habilitado) {
        const btns = [];
        const lp = role.permissions.listaProductos.botones || {};
        if (lp.crearProducto)    btns.push("CrearProducto");
        if (lp.editarProducto)   btns.push("EditarProducto");
        if (lp.eliminarProducto) btns.push("EliminarProducto");
        if (lp.modificarStock)   btns.push("ModificarStock");
        if (btns.length) {
          perms.push(`ListaProductos(${btns.join("|")})`);
        } else {
          perms.push("ListaProductos");
        }
      }
      // Permiso de Ingreso de Productos
      if (role.permissions.ingresoProductos) perms.push("IngresoProductos");
      // Permisos generales
      if (role.permissions.entradas)        perms.push("Entradas");
      if (role.permissions.movimientos)     perms.push("Movimientos");
      if (role.permissions.salidas)         perms.push("Salidas");
      if (role.permissions.usuarios)        perms.push("Usuarios");
      if (role.permissions.tiendas)         perms.push("Tiendas");
      // ventasGenerales, historialVentas y preventas se asumen false
    }
    row.insertCell(1).textContent = perms.join(", ");

    const cellActions = row.insertCell(2);
    cellActions.innerHTML = `
      <button class="btn btn-sm btn-primary me-1" onclick="editRole('${role.id}')">Editar</button>
      <button class="btn btn-sm btn-danger" onclick="deleteRole('${role.id}')">Eliminar</button>
    `;
  });
}

function showRoleForm() {
  document.getElementById("roleForm").reset();
  document.getElementById("roleId").value = "";
  document.getElementById("roleEditModalLabel").textContent = "Crear Rol";
  new bootstrap.Modal(document.getElementById("roleEditModal")).show();
}
window.showRoleForm = showRoleForm;

function showRoleModal() {
  loadRoles();
  new bootstrap.Modal(document.getElementById("roleModal")).show();
}

document.getElementById("roleForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const roleId = document.getElementById("roleId").value;
  const roleName = document.getElementById("roleName").value.trim();
  if (!roleName) {
    Swal.fire("Error", "Ingrese un nombre de rol.", "error");
    return;
  }

  // Construcción del objeto de permisos, con las llaves que coinciden con Firestore
  const rolePerms = {
    listaProductos: {
      habilitado: document.getElementById("permListaProductosRole").checked,
      botones: {
        crearProducto:    document.getElementById("permLPCrearRole").checked,
        editarProducto:   document.getElementById("permLPEditarRole").checked,
        eliminarProducto: document.getElementById("permLPEliminarRole").checked,
        modificarStock:   document.getElementById("permLPStockRole").checked,
        cargarTexto:      document.getElementById("permLPCargarTextoRole")
                          ? document.getElementById("permLPCargarTextoRole").checked
                          : false
      }
    },
    ingresoProductos: document.getElementById("permIngresoProductosRole")
                       ? document.getElementById("permIngresoProductosRole").checked
                       : false,
    entradas:        document.getElementById("permEntradasRole").checked,
    movimientos:     document.getElementById("permMovimientosRole").checked,
    salidas:         document.getElementById("permSalidasRole").checked,
    usuarios:        document.getElementById("permUsuariosRole").checked,
    tiendas:         document.getElementById("permTiendasRole").checked,
    ventasGenerales: false,
    historialVentas: false,
    preventas:       false
  };

  try {
    if (roleId) {
      // Actualizar rol existente
      await updateDoc(doc(db, "roles", roleId), {
        roleName,
        permissions: rolePerms
      });
      Swal.fire("Éxito", "Rol actualizado.", "success");
    } else {
      // Crear nuevo rol
      await addDoc(collection(db, "roles"), {
        roleName,
        permissions: rolePerms
      });
      Swal.fire("Éxito", "Rol creado.", "success");
    }
    bootstrap.Modal.getInstance(document.getElementById("roleEditModal")).hide();
    loadRoles();
  } catch (error) {
    console.error("Error al guardar rol:", error);
    Swal.fire("Error", "Error al guardar rol: " + error.message, "error");
  }
});

window.editRole = async function (roleId) {
  try {
    const roleDocRef = doc(db, "roles", roleId);
    const docSnap = await getDoc(roleDocRef);
    if (!docSnap.exists()) {
      Swal.fire("Error", "Rol no encontrado.", "error");
      return;
    }
    const roleData = docSnap.data();
    document.getElementById("roleId").value = roleId;
    document.getElementById("roleName").value = roleData.roleName || "";

    // Cargar permisos de listaProductos
    document.getElementById("permListaProductosRole").checked =
      !!roleData.permissions?.listaProductos?.habilitado;
    document.getElementById("permLPCrearRole").checked =
      !!roleData.permissions?.listaProductos?.botones.crearProducto;
    document.getElementById("permLPEditarRole").checked =
      !!roleData.permissions?.listaProductos?.botones.editarProducto;
    document.getElementById("permLPEliminarRole").checked =
      !!roleData.permissions?.listaProductos?.botones.eliminarProducto;
    document.getElementById("permLPStockRole").checked =
      !!roleData.permissions?.listaProductos?.botones.modificarStock;
    if (document.getElementById("permLPCargarTextoRole")) {
      document.getElementById("permLPCargarTextoRole").checked =
        !!roleData.permissions?.listaProductos?.botones.cargarTexto;
    }

    // Cargar permiso de ingresoProductos
    if (document.getElementById("permIngresoProductosRole")) {
      document.getElementById("permIngresoProductosRole").checked =
        !!roleData.permissions?.ingresoProductos;
    }

    // Cargar permisos generales
    document.getElementById("permEntradasRole").checked =
      !!roleData.permissions?.entradas;
    document.getElementById("permMovimientosRole").checked =
      !!roleData.permissions?.movimientos;
    document.getElementById("permSalidasRole").checked =
      !!roleData.permissions?.salidas;
    document.getElementById("permUsuariosRole").checked =
      !!roleData.permissions?.usuarios;
    document.getElementById("permTiendasRole").checked =
      !!roleData.permissions?.tiendas;

    document.getElementById("roleEditModalLabel").textContent = "Editar Rol";
    new bootstrap.Modal(document.getElementById("roleEditModal")).show();
  } catch (error) {
    console.error("Error al cargar rol:", error);
    Swal.fire("Error", "Error al cargar rol: " + error.message, "error");
  }
};

window.deleteRole = async function (roleId) {
  const result = await Swal.fire({
    title: "¿Está seguro?",
    text: "Esta acción eliminará el rol de forma permanente.",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Sí, eliminar",
    cancelButtonText: "Cancelar"
  });
  if (!result.isConfirmed) return;
  try {
    await deleteDoc(doc(db, "roles", roleId));
    Swal.fire("Éxito", "Rol eliminado.", "success");
    loadRoles();
  } catch (error) {
    console.error("Error al eliminar rol:", error);
    Swal.fire("Error", "Error al eliminar rol: " + error.message, "error");
  }
};

/************ FUNCIONES PARA USUARIOS (CREAR/EDITAR) ************/
async function loadUsers() {
  try {
    const usuariosRef = collection(db, "usuarios");
    const qUsuarios = query(usuariosRef, orderBy("username"));
    const snapshot = await getDocs(qUsuarios);
    users = [];
    const tbody = document.querySelector("#usersTable tbody");
    tbody.innerHTML = "";
    snapshot.forEach((docSnap) => {
      const user = docSnap.data();
      user.id = docSnap.id;
      users.push(user);
      const row = tbody.insertRow();
      row.insertCell(0).textContent = user.username;

      // Contraseña enmascarada
      const cellPassword = row.insertCell(1);
      const spanPassword = document.createElement("span");
      spanPassword.textContent = "******";
      spanPassword.id = `pwd_${user.id}`;
      cellPassword.appendChild(spanPassword);
      const btnToggle = document.createElement("button");
      btnToggle.textContent = "Ver";
      btnToggle.classList.add(
        "btn",
        "btn-sm",
        "btn-outline-secondary",
        "ms-2",
        "btn-toggle-password"
      );
      btnToggle.addEventListener("click", () => {
        const span = document.getElementById(`pwd_${user.id}`);
        if (span.textContent === "******") {
          span.textContent = user.password;
          btnToggle.textContent = "Ocultar";
        } else {
          span.textContent = "******";
          btnToggle.textContent = "Ver";
        }
      });
      cellPassword.appendChild(btnToggle);

      // Tienda y rol
      row.insertCell(2).textContent =
        user.rol && user.rol.toLowerCase() === "admin" ? "-" : user.tienda || "";
      row.insertCell(3).textContent = user.rol || "";
      row.insertCell(4).textContent = user.enabled ? "Sí" : "No";

      // Acciones
      const cellActions = row.insertCell(5);
      let actionsHTML = "";
      if (userPermissions.editarUsuario) {
        actionsHTML += `<button class="btn btn-sm btn-primary me-1" onclick="editUser('${user.id}')">Editar</button>`;
      }
      if (userPermissions.eliminarUsuario) {
        actionsHTML += `<button class="btn btn-sm btn-danger me-1" onclick="deleteUser('${user.id}')">Eliminar</button>`;
      }
      if (userPermissions.toggleUsuario) {
        actionsHTML += `<button class="btn btn-sm btn-warning" onclick="toggleUser('${user.id}', ${user.enabled})">
          ${user.enabled ? "Deshabilitar" : "Habilitar"}
        </button>`;
      }
      cellActions.innerHTML = actionsHTML;
    });
  } catch (error) {
    console.error("Error al cargar usuarios:", error);
    Swal.fire("Error", "Error al cargar usuarios: " + error.message, "error");
  }
}

window.editUser = async function (userId) {
  try {
    const userDocRef = doc(db, "usuarios", userId);
    const docSnap = await getDoc(userDocRef);
    if (!docSnap.exists()) {
      Swal.fire("Error", "Usuario no encontrado.", "error");
      return;
    }
    const user = docSnap.data();
    document.getElementById("userId").value = userId;
    document.getElementById("username").value = user.username;
    document.getElementById("password").value = "";
    document.getElementById("userEnabled").value = user.enabled ? "true" : "false";

    if (
      (user.rol && user.rol.toLowerCase() === "admin") ||
      user.username.toLowerCase() === "admin"
    ) {
      document.getElementById("userStore").value = "";
      document.getElementById("userStore").disabled = true;
      document.getElementById("userRole").value = "admin";
      document.getElementById("userRole").disabled = true;
    } else {
      document.getElementById("userStore").disabled = false;
      document.getElementById("userRole").disabled = false;
      document.getElementById("userStore").value = user.tienda || "";
      document.getElementById("userRole").value = user.rol || "";
    }

    // Cargar permisos existentes
    document.getElementById("permListaProductos").checked =
      !!user.permissions?.listaProductos?.habilitado;
    document.getElementById("permLPCrear").checked =
      !!user.permissions?.listaProductos?.botones.crearProducto;
    document.getElementById("permLPEditar").checked =
      !!user.permissions?.listaProductos?.botones.editarProducto;
    document.getElementById("permLPEliminar").checked =
      !!user.permissions?.listaProductos?.botones.eliminarProducto;
    document.getElementById("permLPStock").checked =
      !!user.permissions?.listaProductos?.botones.modificarStock;
    document.getElementById("permLPCargarTexto").checked =
      !!user.permissions?.listaProductos?.botones.cargarTexto;

    // NUEVO: permIngresoProductosUser
    document.getElementById("permIngresoProductosUser").checked =
      !!user.permissions?.ingresoProductos;

    document.getElementById("permEntradasUser").checked =
      !!user.permissions?.entradas;
    document.getElementById("permMovimientosUser").checked =
      !!user.permissions?.movimientos;
    document.getElementById("permSalidasUser").checked =
      !!user.permissions?.salidas;
    document.getElementById("permUsuariosUser").checked =
      !!user.permissions?.usuarios;
    document.getElementById("permTiendasUser").checked =
      !!user.permissions?.tiendas;
    document.getElementById("permEmpleadosUser").checked =
      !!user.permissions?.empleados;

    document.getElementById("userModalLabel").textContent = "Editar Usuario";
    new bootstrap.Modal(document.getElementById("userModal")).show();
  } catch (error) {
    console.error("Error al cargar usuario:", error);
    Swal.fire("Error", "Error al cargar usuario: " + error.message, "error");
  }
};

window.deleteUser = async function (userId) {
  const result = await Swal.fire({
    title: "¿Está seguro?",
    text: "Esta acción eliminará el usuario de forma permanente.",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Sí, eliminar",
    cancelButtonText: "Cancelar"
  });
  if (!result.isConfirmed) return;
  try {
    await deleteDoc(doc(db, "usuarios", userId));
    Swal.fire("Éxito", "Usuario eliminado.", "success");
    loadUsers();
  } catch (error) {
    console.error("Error al eliminar usuario:", error);
    Swal.fire("Error", "Error al eliminar usuario: " + error.message, "error");
  }
};

window.toggleUser = async function (userId, currentStatus) {
  try {
    await updateDoc(doc(db, "usuarios", userId), { enabled: !currentStatus });
    Swal.fire("Éxito", "Estado del usuario actualizado.", "success");
    loadUsers();
  } catch (error) {
    console.error("Error al actualizar estado:", error);
    Swal.fire("Error", "Error al actualizar estado: " + error.message, "error");
  }
};

/************ INICIALIZACIÓN DE LA PÁGINA ************/
document.addEventListener("DOMContentLoaded", async () => {
  await loadStores();
  await loadRoles();
  loadUsers();

  const btnCrearUsuario = document.getElementById("btnCrearUsuario");
  if (!userPermissions.crearUsuario) {
    btnCrearUsuario.style.display = "none";
  } else {
    btnCrearUsuario.addEventListener("click", showUserForm);
  }

  const btnAdministrarRoles = document.getElementById("btnAdministrarRoles");
  if (!userPermissions.administrarRoles && btnAdministrarRoles) {
    btnAdministrarRoles.style.display = "none";
  } else if (btnAdministrarRoles) {
    btnAdministrarRoles.addEventListener("click", showRoleModal);
  }

  const btnCrearRol = document.getElementById("btnCrearRol");
  if (btnCrearRol) {
    btnCrearRol.addEventListener("click", showRoleForm);
  }
});

// Listener para toggle de contraseña y control del select de rol
document.addEventListener("DOMContentLoaded", () => {
  const togglePassword = document.getElementById("togglePassword");
  if (togglePassword) {
    togglePassword.addEventListener("click", function () {
      const passwordInput = document.getElementById("password");
      const icon = this.querySelector("i");
      if (passwordInput.type === "password") {
        passwordInput.type = "text";
        icon.classList.remove("fa-eye");
        icon.classList.add("fa-eye-slash");
      } else {
        passwordInput.type = "password";
        icon.classList.remove("fa-eye-slash");
        icon.classList.add("fa-eye");
      }
    });
  }

  document.getElementById("userRole").addEventListener("change", function () {
    const storeSelect = document.getElementById("userStore");
    if (this.value.toLowerCase() === "admin") {
      storeSelect.value = "";
      storeSelect.disabled = true;
    } else {
      storeSelect.disabled = false;
    }
  });
});

// Manejo del submit del formulario de usuario
document.getElementById("userForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const userId   = document.getElementById("userId").value;
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();
  const tienda   = document.getElementById("userStore").value;
  const rol      = document.getElementById("userRole").value;
  const enabled  = document.getElementById("userEnabled").value === "true";

  const permisos = {
    listaProductos: {
      habilitado: document.getElementById("permListaProductos").checked,
      botones: {
        crearProducto:    document.getElementById("permLPCrear").checked,
        editarProducto:   document.getElementById("permLPEditar").checked,
        eliminarProducto: document.getElementById("permLPEliminar").checked,
        modificarStock:   document.getElementById("permLPStock").checked,
        cargarTexto:      document.getElementById("permLPCargarTexto").checked
      }
    },
    ingresoProductos: document.getElementById("permIngresoProductosUser").checked,
    ventasGenerales:  true,
    historialVentas:  true,
    preventas:        true,
    empleados:        document.getElementById("permEmpleadosUser")?.checked || false,
    entradas:         document.getElementById("permEntradasUser").checked,
    movimientos:      document.getElementById("permMovimientosUser").checked,
    salidas:          document.getElementById("permSalidasUser").checked,
    usuarios:         document.getElementById("permUsuariosUser").checked,
    tiendas:          document.getElementById("permTiendasUser").checked
  };

  if (!username || !password) {
    Swal.fire("Error", "Debe ingresar usuario y contraseña.", "error");
    return;
  }

  try {
    if (userId) {
      await updateDoc(doc(db, "usuarios", userId), {
        username,
        ...(password && { password }),
        tienda: rol.toLowerCase() === "admin" ? "" : tienda,
        rol,
        enabled,
        permissions: permisos
      });
      Swal.fire("Éxito", "Usuario actualizado.", "success");
    } else {
      await addDoc(collection(db, "usuarios"), {
        username,
        password,
        tienda: rol.toLowerCase() === "admin" ? "" : tienda,
        rol,
        enabled,
        permissions: permisos
      });
      Swal.fire("Éxito", "Usuario creado.", "success");
    }
    bootstrap.Modal.getInstance(document.getElementById("userModal")).hide();
    loadUsers();
  } catch (error) {
    console.error("Error al guardar usuario:", error);
    Swal.fire("Error", "Error al guardar usuario: " + error.message, "error");
  }
});

window.loadUsers = loadUsers;
