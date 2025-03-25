/********************************************
 * IMPORTACIÓN DE FIREBASE
 ********************************************/
import { db } from "./firebase-config.js"; // Ajusta la ruta a tu propio archivo de config
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  getDocs
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

console.log("Verificando db =>", db);

/********************************************
 * VARIABLES GLOBALES
 ********************************************/
let products = []; // Arreglo con todos los productos de Firestore
let currentFilteredProducts = []; // Arreglo con productos tras filtrar/buscar
let selectedProductId = null;

// Datos de usuario (localStorage)
const loggedUser      = localStorage.getItem("loggedUser") || "";
const loggedUserRole  = localStorage.getItem("loggedUserRole") || "";
const loggedUserStore = localStorage.getItem("loggedUserStore") || "DefaultStore";

// Definición de permisos según rol
let userPermissions = {
  crearProducto: false,
  editarProducto: false,
  eliminarProducto: false,
  modificarStock: false,
  cargarTexto: false
};

if (loggedUserRole.toLowerCase() === "admin") {
  userPermissions = {
    crearProducto: true,
    editarProducto: true,
    eliminarProducto: true,
    modificarStock: true,
    cargarTexto: true
  };
} else {
  // Para usuarios con tienda, solo se habilita "crearProducto"
  userPermissions = {
    crearProducto: true,
    editarProducto: false,
    eliminarProducto: false,
    modificarStock: false,
    cargarTexto: false
  };
}
console.log("Permisos de productos:", userPermissions);

// Variable para el filtrado de tienda
let currentStore = "";
const inventoryTitle = document.getElementById("inventoryTitle");

// Configuración según rol: Si es admin se muestra el filtro de tienda
if (loggedUserRole.toLowerCase() === "admin") {
  document.getElementById("adminStoreFilter").style.display = "block";
  inventoryTitle.textContent = "Inventario: Stock Total";
} else {
  currentStore = loggedUserStore;
  inventoryTitle.textContent = `Inventario de: ${currentStore}`;
}

/********************************************
 * CARGA LISTA DE TIENDAS (PARA ADMIN) Y EVENTO DE CAMBIO
 ********************************************/
async function loadStoreFilter() {
  try {
    const qStores = query(collection(db, "tiendas"), orderBy("nombre"));
    const snapshot = await getDocs(qStores);
    const storeSelect = document.getElementById("storeSelect");
    storeSelect.innerHTML = "<option value=''>Inventario: Stock Total</option>";

    snapshot.forEach((docSnap) => {
      const store = docSnap.data();
      const option = document.createElement("option");
      option.value = store.nombre;
      option.textContent = store.nombre;
      storeSelect.appendChild(option);
    });
  } catch (error) {
    console.error("Error al cargar tiendas:", error);
  }
}

if (loggedUserRole.toLowerCase() === "admin") {
  document.addEventListener("DOMContentLoaded", () => {
    loadStoreFilter();
    document.getElementById("storeSelect").addEventListener("change", function () {
      currentStore = this.value;
      inventoryTitle.textContent = currentStore
        ? `Inventario de: ${currentStore}`
        : "Inventario: Stock Total";
      // Re-render de productos
      renderProducts();
    });
  });
}

/********************************************
 * INICIALIZAR DATA TABLE
 ********************************************/
let dataTable = null; // Referencia global a la DataTable

function initDataTable() {
  dataTable = $("#productsTable").DataTable({
    // Ajustes opcionales de DataTables
    language: {
      url: "https://cdn.datatables.net/plug-ins/1.13.4/i18n/es-ES.json"
    }
  });

  // Manejar el evento de clic en las filas para seleccionar producto
  $("#productsTable tbody").on("click", "tr", function () {
    // Remueve la clase de selección a todas
    $("#productsTable tbody tr").removeClass("table-active");
    // Agrega la clase a la fila clickeada
    $(this).addClass("table-active");

    // Obtenemos el índice de la fila en el DataTable
    const rowIndex = dataTable.row(this).index();
    // Si ese índice existe en currentFilteredProducts, tomamos su ID
    if (currentFilteredProducts[rowIndex]) {
      selectedProductId = currentFilteredProducts[rowIndex].id;
    } else {
      selectedProductId = null;
    }
  });
}

/********************************************
 * ESCUCHA EN TIEMPO REAL (onSnapshot)
 ********************************************/
function listenProducts() {
  const qProducts = query(collection(db, "productos"), orderBy("createdAt", "desc"));
  onSnapshot(
    qProducts,
    (snapshot) => {
      products = [];
      snapshot.forEach((docSnap) => {
        const prod = docSnap.data();
        prod.id = docSnap.id;
        products.push(prod);
      });
      // Cada vez que hay cambios, volvemos a "renderizar" la tabla
      renderProducts();
    },
    (error) => {
      console.error("Error en onSnapshot:", error);
      Swal.fire(
        "Error",
        "No se pudieron obtener los productos: " + error.message,
        "error"
      );
    }
  );
}

/********************************************
 * FUNCIÓN PARA MOSTRAR DATOS EN LA TABLA
 ********************************************/
function renderProducts() {
  // Filtro de búsqueda en el input
  const searchQuery = document
    .getElementById("searchInput")
    .value.trim()
    .toLowerCase();

  // Se filtra por código, descripción o talla
  currentFilteredProducts = products.filter((prod) => {
    const codigo = prod.codigo?.toLowerCase() || "";
    const descripcion = prod.descripcion?.toLowerCase() || "";
    const talla = prod.talla?.toLowerCase() || "";
    return (
      codigo.includes(searchQuery) ||
      descripcion.includes(searchQuery) ||
      talla.includes(searchQuery)
    );
  });

  // Limpiamos la tabla antes de volver a llenarla
  dataTable.clear();

  if (currentFilteredProducts.length === 0) {
    // Agregamos una fila "vacía" con un mensaje
    dataTable.row.add([
      "",
      "No hay productos disponibles",
      "",
      "",
      "",
      ""
    ]);
    dataTable.draw();
    return;
  }

  // Agregamos cada producto filtrado como fila
  currentFilteredProducts.forEach((prod) => {
    dataTable.row.add([
      prod.codigo,
      prod.descripcion,
      prod.color || "",
      prod.talla || "",
      "Q " + parseFloat(prod.precio).toFixed(2),
      getDisplayedStock(prod)
    ]);
  });

  dataTable.draw();
}

/********************************************
 * CÓMO SE MUESTRA EL STOCK
 ********************************************/
function getDisplayedStock(product) {
  // Si stock es solo número o no existe, devolvemos 0 o ese valor
  if (!product.stock || typeof product.stock !== "object") {
    return product.stock || 0;
  }

  // Si el rol es admin y no se ha seleccionado tienda => mostrar la suma total
  if (loggedUserRole.toLowerCase() === "admin" && !currentStore) {
    return Object.values(product.stock).reduce((sum, val) => sum + Number(val), 0);
  }

  // Si el rol es admin y se ha seleccionado una tienda => mostrar stock de esa tienda
  if (loggedUserRole.toLowerCase() === "admin" && currentStore) {
    return product.stock[currentStore] || 0;
  }

  // Usuarios no admin solo ven su tienda
  return product.stock[loggedUserStore] || 0;
}

/********************************************
 * FUNCIONES CRUD
 ********************************************/
async function crearProducto() {
  const { value: formValues } = await Swal.fire({
    title: "Crear Producto",
    html: `
      <input id="swal-input1" class="swal2-input" placeholder="Código">
      <input id="swal-input2" class="swal2-input" placeholder="Descripción">
      <input id="swal-input3" class="swal2-input" placeholder="Talla (opcional)">
      <input id="swal-input4" class="swal2-input" placeholder="Precio" type="number" min="0.01" step="0.01">
      <input id="swal-input5" class="swal2-input" placeholder="Color (opcional)">
    `,
    focusConfirm: false,
    preConfirm: () => {
      const codigo      = document.getElementById("swal-input1").value.trim();
      const descripcion = document.getElementById("swal-input2").value.trim();
      const talla       = document.getElementById("swal-input3").value.trim();
      const precio      = parseFloat(document.getElementById("swal-input4").value);
      const color       = document.getElementById("swal-input5").value.trim();

      if (!codigo) {
        Swal.showValidationMessage("El código es obligatorio");
        return;
      }
      if (!descripcion) {
        Swal.showValidationMessage("La descripción es obligatoria");
        return;
      }
      if (isNaN(precio) || precio <= 0) {
        Swal.showValidationMessage("El precio debe ser mayor a 0");
        return;
      }
      return { codigo, descripcion, talla, precio, color };
    }
  });
  if (!formValues) return;

  try {
    const newProduct = {
      codigo: formValues.codigo,
      descripcion: formValues.descripcion,
      talla: formValues.talla,
      precio: formValues.precio,
      color: formValues.color,
      stock: {},
      createdAt: new Date().toISOString()
    };
    await addDoc(collection(db, "productos"), newProduct);
    Swal.fire("Producto creado", "El producto se creó correctamente", "success");
  } catch (error) {
    Swal.fire("Error", "No se pudo crear el producto: " + error.message, "error");
  }
}

async function editarProducto() {
  if (!selectedProductId) {
    Swal.fire("Advertencia", "Selecciona un producto para editar", "warning");
    return;
  }
  const product = products.find((p) => p.id === selectedProductId);
  if (!product) {
    Swal.fire("Error", "Producto no encontrado", "error");
    return;
  }

  const { value: formValues } = await Swal.fire({
    title: "Editar Producto",
    html: `
      <input id="swal-input1" class="swal2-input" placeholder="Código" value="${product.codigo}">
      <input id="swal-input2" class="swal2-input" placeholder="Descripción" value="${product.descripcion}">
      <input id="swal-input3" class="swal2-input" placeholder="Talla (opcional)" value="${product.talla || ''}">
      <input id="swal-input4" class="swal2-input" placeholder="Precio" type="number" min="0.01" step="0.01" value="${product.precio}">
      <input id="swal-input5" class="swal2-input" placeholder="Color (opcional)" value="${product.color || ''}">
    `,
    focusConfirm: false,
    preConfirm: () => {
      const codigo      = document.getElementById("swal-input1").value.trim();
      const descripcion = document.getElementById("swal-input2").value.trim();
      const talla       = document.getElementById("swal-input3").value.trim();
      const precio      = parseFloat(document.getElementById("swal-input4").value);
      const color       = document.getElementById("swal-input5").value.trim();

      if (!codigo) {
        Swal.showValidationMessage("El código es obligatorio");
        return;
      }
      if (!descripcion) {
        Swal.showValidationMessage("La descripción es obligatoria");
        return;
      }
      if (isNaN(precio) || precio <= 0) {
        Swal.showValidationMessage("El precio debe ser mayor a 0");
        return;
      }
      return { codigo, descripcion, talla, precio, color };
    }
  });
  if (!formValues) return;

  try {
    const updateData = {
      codigo: formValues.codigo,
      descripcion: formValues.descripcion,
      talla: formValues.talla,
      precio: formValues.precio,
      color: formValues.color
    };
    await updateDoc(doc(db, "productos", selectedProductId), updateData);
    Swal.fire("Producto editado", "El producto se actualizó correctamente", "success");
  } catch (error) {
    Swal.fire("Error", "No se pudo editar el producto: " + error.message, "error");
  }
}

async function eliminarProducto() {
  if (!selectedProductId) {
    Swal.fire("Advertencia", "Selecciona un producto para eliminar", "warning");
    return;
  }
  const product = products.find((p) => p.id === selectedProductId);
  if (!product) {
    Swal.fire("Error", "Producto no encontrado", "error");
    return;
  }
  const confirmResult = await Swal.fire({
    title: "¿Eliminar Producto?",
    text: `¿Estás seguro de eliminar "${product.descripcion}"?`,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Sí, eliminar",
    cancelButtonText: "Cancelar"
  });
  if (!confirmResult.isConfirmed) return;

  try {
    await deleteDoc(doc(db, "productos", selectedProductId));
    Swal.fire("Eliminado", "El producto se eliminó correctamente", "success");
    selectedProductId = null;
  } catch (error) {
    Swal.fire("Error", "No se pudo eliminar el producto: " + error.message, "error");
  }
}

async function modificarStock() {
  if (!selectedProductId) {
    Swal.fire("Advertencia", "Selecciona un producto para modificar el stock", "warning");
    return;
  }
  const product = products.find((p) => p.id === selectedProductId);
  if (!product) {
    Swal.fire("Error", "Producto no encontrado", "error");
    return;
  }
  // Para admin sin tienda seleccionada, se pide que primero elija una
  if (loggedUserRole.toLowerCase() === "admin" && !currentStore) {
    Swal.fire(
      "Tienda no seleccionada",
      "Debes elegir una tienda en el filtro para modificar stock",
      "info"
    );
    return;
  }

  // Stock actual
  const currentStock = getCurrentStock(product, currentStore);

  const { value: newStock } = await Swal.fire({
    title: "Modificar Stock",
    input: "number",
    inputLabel: `Ingresa el nuevo stock para la tienda: ${currentStore || "Global"}`,
    inputValue: currentStock,
    showCancelButton: true,
    inputValidator: (value) => {
      if ((!value && value !== 0) || isNaN(value)) {
        return "Debes ingresar un valor de stock";
      }
      if (value < 0) {
        return "El stock debe ser un número no negativo";
      }
    }
  });
  if (newStock !== undefined) {
    try {
      const updatedStock =
        product.stock && typeof product.stock === "object"
          ? { ...product.stock }
          : {};

      // Para admin se actualiza en currentStore
      // Para usuario normal se actualiza en loggedUserStore
      const storeKey =
        loggedUserRole.toLowerCase() === "admin"
          ? currentStore
          : loggedUserStore;

      updatedStock[storeKey] = Number(newStock);

      await updateDoc(doc(db, "productos", selectedProductId), {
        stock: updatedStock
      });

      Swal.fire(
        "Stock actualizado",
        "El stock fue actualizado correctamente",
        "success"
      );
    } catch (error) {
      Swal.fire("Error", "No se pudo actualizar el stock: " + error.message, "error");
    }
  }
}

function getCurrentStock(product, store) {
  // Si no hay stock como objeto, devolvemos 0 o el valor que sea
  if (!product.stock || typeof product.stock !== "object") {
    return product.stock || 0;
  }
  // Si es admin y no hay tienda seleccionada, devolvemos 0 (no se hace global)
  if (loggedUserRole.toLowerCase() === "admin" && !store) {
    return 0;
  }
  // Caso contrario, retornamos stock de la tienda
  return product.stock[store] || 0;
}

/********************************************
 * CARGA MASIVA DESDE CADENA DE TEXTO
 ********************************************/
async function cargarConCadenaTexto() {
  const { value: textData } = await Swal.fire({
    title: "Cargar Productos en Masa",
    html: `<textarea id="swal-textarea" class="swal2-textarea" placeholder="Formato CSV:&#10;Código,Descripción,Talla,Precio,Color,Stock(opcional)"></textarea>`,
    focusConfirm: false,
    preConfirm: () => {
      const text = document.getElementById("swal-textarea").value.trim();
      if (!text) {
        Swal.showValidationMessage("Debes ingresar datos para cargar");
        return;
      }
      return text;
    }
  });
  if (!textData) return;

  // Dividir cada línea
  const lines = textData.split("\n").filter((line) => line.trim() !== "");
  let productosNuevos = [];

  lines.forEach((line) => {
    const parts = line.split(",").map((item) => item.trim());
    if (parts.length < 5) {
      // Se requieren al menos 5 campos
      return;
    }
    const [codigo, descripcion, talla, precioStr, color] = parts;
    const precio = parseFloat(precioStr);

    // Validación básica
    if (!codigo || !descripcion || isNaN(precio) || precio <= 0 || !color) {
      return;
    }

    // Stock opcional (posición 6)
    let stock = {};
    if (parts.length >= 6) {
      const s = parseInt(parts[5]);
      stock = { [loggedUserStore]: isNaN(s) ? 0 : s };
    }

    const nuevoProducto = {
      codigo,
      descripcion,
      talla,
      precio,
      color,
      stock,
      createdAt: new Date().toISOString()
    };
    productosNuevos.push(nuevoProducto);
  });

  if (productosNuevos.length === 0) {
    Swal.fire(
      "Atención",
      "No se encontraron productos válidos en los datos ingresados",
      "warning"
    );
    return;
  }

  try {
    const promises = productosNuevos.map(async (prod) => {
      await addDoc(collection(db, "productos"), prod);
    });
    await Promise.all(promises);
    Swal.fire(
      "Productos cargados",
      `${productosNuevos.length} producto(s) cargado(s) correctamente`,
      "success"
    );
  } catch (error) {
    Swal.fire("Error", "No se pudo cargar los productos: " + error.message, "error");
  }
}

/********************************************
 * INICIALIZACIÓN DE LA PÁGINA Y EVENTOS DE BOTONES
 ********************************************/
document.addEventListener("DOMContentLoaded", () => {
  // 1. Inicializar la DataTable
  initDataTable();

  // 2. Escuchar los productos de Firestore (onSnapshot)
  listenProducts();

  // 3. Evento de búsqueda
  document.getElementById("searchInput").addEventListener("input", renderProducts);

  // 4. Referencias a los botones
  const btnCrearProducto    = document.getElementById("btnCrearProducto");
  const btnEditarProducto   = document.getElementById("btnEditarProducto");
  const btnEliminarProducto = document.getElementById("btnEliminarProducto");
  const btnModificarStock   = document.getElementById("btnModificarStock");
  const btnCargarTexto      = document.getElementById("btnCargarTexto");
  // Botón "Mostrar Stock" ya no existe en este código

  // 5. Mostrar/ocultar botones según permisos (rol)
  if (loggedUserRole.toLowerCase() === "admin") {
    // Admin: muestra todos
    btnCrearProducto.style.display = "inline-block";
    btnEditarProducto.style.display = "inline-block";
    btnEliminarProducto.style.display = "inline-block";
    btnModificarStock.style.display = "inline-block";
    btnCargarTexto.style.display = "inline-block";
  } else {
    // Usuario con tienda: solo Crear
    btnCrearProducto.style.display = "inline-block";
    btnEditarProducto.style.display = "none";
    btnEliminarProducto.style.display = "none";
    btnModificarStock.style.display = "none";
    btnCargarTexto.style.display = "none";
  }

  // 6. Asignar eventos a cada botón
  btnCrearProducto.addEventListener("click", crearProducto);
  btnEditarProducto.addEventListener("click", editarProducto);
  btnEliminarProducto.addEventListener("click", eliminarProducto);
  btnModificarStock.addEventListener("click", modificarStock);
  btnCargarTexto.addEventListener("click", cargarConCadenaTexto);
});
