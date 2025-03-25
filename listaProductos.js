import { db } from "./firebase-config.js";  
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  getDocs,
  where
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

console.log("Verificando db =>", db);

// Variables globales
let products = [];
let selectedProductId = null;

// Variables para la paginación
let currentPage = 1;
let pageSize = 5; // valor por defecto

// Se leen los datos del usuario desde localStorage
const loggedUser      = localStorage.getItem("loggedUser") || "";
const loggedUserRole  = localStorage.getItem("loggedUserRole") || "";
const loggedUserStore = localStorage.getItem("loggedUserStore") || "DefaultStore";

// Definición de permisos según rol:
// - Admin: todos los botones.
// - Usuarios con tienda: solo el botón de Crear Producto.
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

// Configuración según rol: Si es admin se muestra el filtro de tienda
if (loggedUserRole.toLowerCase() === "admin") {
  document.getElementById("adminStoreFilter").style.display = "block";
  document.getElementById("inventoryTitle").textContent = "Inventario: Stock Total";
} else {
  currentStore = loggedUserStore;
  document.getElementById("inventoryTitle").textContent = `Inventario de: ${currentStore}`;
}

// Función para cargar tiendas en el select (solo para admin)
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
      document.getElementById("inventoryTitle").textContent = currentStore
        ? `Inventario de: ${currentStore}`
        : "Inventario: Stock Total";
      listenProducts(); // Actualiza la escucha de productos según el filtro
    });
  });
}

// Escucha en tiempo real la colección "productos"
// Se cambia el orden para que se ordene según el "codigo" de producto (ascendente)
function listenProducts() {
  const qProducts = query(collection(db, "productos"), orderBy("codigo", "asc"));
  onSnapshot(
    qProducts,
    (snapshot) => {
      products = [];
      snapshot.forEach((docSnap) => {
        const prod = docSnap.data();
        prod.id = docSnap.id;
        products.push(prod);
      });
      renderProducts();
    },
    (error) => {
      console.error("Error en onSnapshot:", error);
      Swal.fire("Error", "No se pudieron obtener los productos: " + error.message, "error");
    }
  );
}

// Función para renderizar productos filtrados con paginación
function renderProducts() {
  const searchQuery = document.getElementById("searchInput").value.trim().toLowerCase();
  const tbody = document.getElementById("productsBody");
  tbody.innerHTML = "";
  
  // Filtrar productos por búsqueda (codigo, descripción o talla)
  const filteredProducts = products.filter(prod => {
    const codigo = prod.codigo?.toLowerCase() || "";
    const descripcion = prod.descripcion?.toLowerCase() || "";
    const talla = prod.talla?.toLowerCase() || "";
    return codigo.includes(searchQuery) || descripcion.includes(searchQuery) || talla.includes(searchQuery);
  });

  if (filteredProducts.length === 0) {
    tbody.innerHTML =
      "<tr><td colspan='6' class='text-center'>No hay productos disponibles</td></tr>";
    const paginationContainer = document.getElementById("paginationContainer");
    if (paginationContainer) paginationContainer.innerHTML = "";
    return;
  }
  
  // Ordenar por código (aunque ya viene ordenado por la query, se garantiza aquí)
  filteredProducts.sort((a, b) => {
    return (a.codigo || "").localeCompare(b.codigo || "");
  });

  // Paginación: calcular índices y obtener los productos a mostrar
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedProducts = filteredProducts.slice(startIndex, startIndex + pageSize);

  paginatedProducts.forEach((prod) => {
    const tr = document.createElement("tr");
    const displayedStock = getDisplayedStock(prod);
    tr.innerHTML = `
      <td>${prod.codigo}</td>
      <td>${prod.descripcion}</td>
      <td>${prod.color}</td>
      <td>${prod.talla || ""}</td>
      <td>Q ${parseFloat(prod.precio).toFixed(2)}</td>
      <td>${displayedStock}</td>
    `;
    tr.addEventListener("click", () => {
      document.querySelectorAll("#productsBody tr").forEach((row) =>
        row.classList.remove("table-active")
      );
      tr.classList.add("table-active");
      selectedProductId = prod.id;
    });
    tbody.appendChild(tr);
  });

  // Renderizar controles de paginación
  renderPaginationControls(filteredProducts.length);
}

// Calcula el stock a mostrar según rol y tienda
function getDisplayedStock(product, store = currentStore) {
  if (!product.stock || typeof product.stock !== "object") {
    return product.stock || 0;
  }
  if (loggedUserRole.toLowerCase() === "admin" && !store) {
    return Object.values(product.stock).reduce((sum, val) => sum + Number(val), 0);
  }
  if (loggedUserRole.toLowerCase() === "admin" && store) {
    return product.stock[store] || 0;
  }
  return product.stock[store] || 0;
}

// Función para renderizar los controles de paginación con números agrupados en bloques de 5
function renderPaginationControls(totalItems) {
  const paginationContainer = document.getElementById("paginationContainer");
  if (!paginationContainer) return;
  
  const totalPages = Math.ceil(totalItems / pageSize);
  paginationContainer.innerHTML = "";
  
  const groupSize = 5;
  const groupStart = Math.floor((currentPage - 1) / groupSize) * groupSize + 1;
  const groupEnd = Math.min(groupStart + groupSize - 1, totalPages);
  
  // Botón "Anterior" (para ir a la página anterior)
  const prevButton = document.createElement("button");
  prevButton.textContent = "Anterior";
  prevButton.className = "btn btn-outline-primary me-1";
  prevButton.disabled = currentPage === 1;
  prevButton.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      renderProducts();
    }
  });
  paginationContainer.appendChild(prevButton);
  
  // Botones numéricos para las páginas del grupo actual
  for (let i = groupStart; i <= groupEnd; i++) {
    const pageButton = document.createElement("button");
    pageButton.textContent = i;
    pageButton.className = "btn btn-outline-primary me-1";
    if (i === currentPage) {
      pageButton.classList.add("active");
    }
    pageButton.addEventListener("click", () => {
      currentPage = i;
      renderProducts();
    });
    paginationContainer.appendChild(pageButton);
  }
  
  // Botón "Siguiente" (para ir a la página siguiente)
  const nextButton = document.createElement("button");
  nextButton.textContent = "Siguiente";
  nextButton.className = "btn btn-outline-primary";
  nextButton.disabled = currentPage === totalPages || totalPages === 0;
  nextButton.addEventListener("click", () => {
    if (currentPage < totalPages) {
      currentPage++;
      renderProducts();
    }
  });
  paginationContainer.appendChild(nextButton);
}

// Función para renderizar el selector de cantidad de registros
function renderPageSizeSelector() {
  const container = document.getElementById("pageSizeContainer");
  if (!container) return;
  container.innerHTML = "";
  
  const label = document.createElement("label");
  label.textContent = "Mostrar registros:";
  label.className = "me-2";
  
  const select = document.createElement("select");
  select.className = "form-select d-inline-block w-auto";
  
  [5, 10, 15, 20, 25, 30].forEach(num => {
    const option = document.createElement("option");
    option.value = num;
    option.textContent = num;
    if (num === pageSize) option.selected = true;
    select.appendChild(option);
  });
  
  select.addEventListener("change", (e) => {
    pageSize = parseInt(e.target.value);
    currentPage = 1;
    renderProducts();
  });
  
  container.appendChild(label);
  container.appendChild(select);
}

/*********************************************
 * FUNCIONES CRUD PARA PRODUCTOS
 *********************************************/
async function crearProducto() {
  const { value: formValues } = await Swal.fire({
    title: "Crear Producto",
    html: `
      <input id="swal-input1" class="swal2-input" placeholder="Código">
      <input id="swal-input2" class="swal2-input" placeholder="Descripción">
      <input id="swal-input3" class="swal2-input" placeholder="Talla (opcional)">
      <input id="swal-input4" class="swal2-input" placeholder="Color">
      <input id="swal-input5" class="swal2-input" placeholder="Precio" type="number" min="0.01" step="0.01">
    `,
    focusConfirm: false,
    preConfirm: () => {
      const codigo = document.getElementById("swal-input1").value.trim();
      const descripcion = document.getElementById("swal-input2").value.trim();
      const talla = document.getElementById("swal-input3").value.trim();
      const color = document.getElementById("swal-input4").value.trim();
      const precio = parseFloat(document.getElementById("swal-input5").value);
      if (!codigo) {
        Swal.showValidationMessage("El código es obligatorio");
        return;
      }
      if (!descripcion) {
        Swal.showValidationMessage("La descripción es obligatoria");
        return;
      }
      if (!color) {
        Swal.showValidationMessage("El color es obligatorio");
        return;
      }
      if (isNaN(precio) || precio <= 0) {
        Swal.showValidationMessage("El precio debe ser mayor a 0");
        return;
      }
      return { codigo, descripcion, talla, color, precio };
    }
  });
  if (!formValues) return;
  try {
    const newProduct = {
      codigo: formValues.codigo,
      descripcion: formValues.descripcion,
      talla: formValues.talla,
      color: formValues.color,
      precio: formValues.precio,
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
      <input id="swal-input4" class="swal2-input" placeholder="Color" value="${product.color || ''}">
      <input id="swal-input5" class="swal2-input" placeholder="Precio" type="number" min="0.01" step="0.01" value="${product.precio}">
    `,
    focusConfirm: false,
    preConfirm: () => {
      const codigo = document.getElementById("swal-input1").value.trim();
      const descripcion = document.getElementById("swal-input2").value.trim();
      const talla = document.getElementById("swal-input3").value.trim();
      const color = document.getElementById("swal-input4").value.trim();
      const precio = parseFloat(document.getElementById("swal-input5").value);
      if (!codigo) {
        Swal.showValidationMessage("El código es obligatorio");
        return;
      }
      if (!descripcion) {
        Swal.showValidationMessage("La descripción es obligatoria");
        return;
      }
      if (!color) {
        Swal.showValidationMessage("El color es obligatorio");
        return;
      }
      if (isNaN(precio) || precio <= 0) {
        Swal.showValidationMessage("El precio debe ser mayor a 0");
        return;
      }
      return { codigo, descripcion, talla, color, precio };
    }
  });
  if (!formValues) return;
  try {
    const updateData = {
      codigo: formValues.codigo,
      descripcion: formValues.descripcion,
      talla: formValues.talla,
      color: formValues.color,
      precio: formValues.precio
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
  if (loggedUserRole.toLowerCase() === "admin" && !currentStore) {
    Swal.fire(
      "Tienda no seleccionada",
      "Debes elegir una tienda en el filtro para modificar stock",
      "info"
    );
    return;
  }
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
      const updatedStock = product.stock && typeof product.stock === "object"
        ? { ...product.stock }
        : {};
      const storeKey = currentStore;
      updatedStock[storeKey] = Number(newStock);
      await updateDoc(doc(db, "productos", selectedProductId), { stock: updatedStock });
      Swal.fire("Stock actualizado", "El stock fue actualizado correctamente", "success");
    } catch (error) {
      Swal.fire("Error", "No se pudo actualizar el stock: " + error.message, "error");
    }
  }
}

function getCurrentStock(product, store = currentStore) {
  if (!product.stock || typeof product.stock !== "object") {
    return product.stock || 0;
  }
  if (loggedUserRole.toLowerCase() === "admin" && !store) {
    return 0;
  }
  return product.stock[store] || 0;
}

/*********************************************
 * FUNCIONES CRUD PARA PRODUCTOS - CARGA MASIVA
 *********************************************/
async function cargarConCadenaTexto() {
  // Si es admin debe haberse seleccionado una tienda para asignar el stock
  if (loggedUserRole.toLowerCase() === "admin" && !currentStore) {
    Swal.fire("Error", "Debes seleccionar una tienda en el filtro antes de cargar inventario.", "error");
    return;
  }
  // Definir la tienda a utilizar según el rol
  const storeKey = (loggedUserRole.toLowerCase() === "admin" && currentStore)
    ? currentStore
    : loggedUserStore;

  const { value: textData } = await Swal.fire({
    title: "Cargar Productos en Masa",
    html: `<textarea id="swal-textarea" class="swal2-textarea" placeholder="Ingresa los productos en formato CSV:&#10;Código,Descripción,Talla,Precio,Color,Stock (opcional)"></textarea>`,
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

  // Se asume que cada línea es un producto separado por salto de línea
  const lines = textData.split("\n").filter(line => line.trim() !== "");
  let productosNuevos = [];
  lines.forEach(line => {
    const parts = line.split(",").map(item => item.trim());
    if (parts.length < 5) {
      // Se requieren al menos 5 campos: Código, Descripción, Talla, Precio, Color
      return;
    }
    const codigo = parts[0];
    const descripcion = parts[1];
    const talla = parts[2];
    const precio = parseFloat(parts[3]);
    const color = parts[4];
    if (!codigo || !descripcion || isNaN(precio) || precio <= 0 || !color) {
      // Si algún dato no es válido, se omite la línea
      return;
    }
    // Stock es opcional; si se incluye, se asigna al inventario de la tienda actual
    let stock = {};
    if (parts.length >= 6) {
      const s = parseInt(parts[5]);
      stock = { [storeKey]: isNaN(s) ? 0 : s };
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
    Swal.fire("Atención", "No se encontraron productos válidos en los datos ingresados", "warning");
    return;
  }

  try {
    // Para cada producto, se verifica si existe (por código) y se actualiza su stock o se crea uno nuevo
    const promises = productosNuevos.map(async prod => {
      const productQuery = query(collection(db, "productos"), where("codigo", "==", prod.codigo));
      const querySnapshot = await getDocs(productQuery);
      if (querySnapshot.empty) {
        // Producto no existe, se crea
        await addDoc(collection(db, "productos"), prod);
      } else {
        // Producto existe, se actualiza el stock para la tienda correspondiente
        const existingDoc = querySnapshot.docs[0];
        const existingData = existingDoc.data();
        let updatedStock = {};
        if (existingData.stock && typeof existingData.stock === "object") {
          updatedStock = { ...existingData.stock };
        }
        updatedStock[storeKey] = prod.stock[storeKey] !== undefined ? prod.stock[storeKey] : 0;
        await updateDoc(doc(db, "productos", existingDoc.id), { stock: updatedStock });
      }
    });
    await Promise.all(promises);
    Swal.fire("Productos cargados", `${productosNuevos.length} productos fueron cargados/actualizados correctamente`, "success");
  } catch (error) {
    Swal.fire("Error", "No se pudo cargar los productos: " + error.message, "error");
  }
}

/*********************************************
 * INICIALIZACIÓN DE LA PÁGINA Y ASIGNACIÓN DE EVENTOS
 *********************************************/
document.addEventListener("DOMContentLoaded", () => {
  // Agregar el contenedor de paginación si no existe
  if (!document.getElementById("paginationContainer")) {
    const paginationContainer = document.createElement("div");
    paginationContainer.id = "paginationContainer";
    const productsBody = document.getElementById("productsBody");
    if (productsBody && productsBody.parentElement) {
      productsBody.parentElement.appendChild(paginationContainer);
    } else {
      document.body.appendChild(paginationContainer);
    }
  }
  
  // Renderizar el selector de cantidad de registros
  renderPageSizeSelector();
  
  listenProducts();

  // Filtro de búsqueda
  document.getElementById("searchInput").addEventListener("input", renderProducts);

  const btnCrearProducto = document.getElementById("btnCrearProducto");
  const btnEditarProducto = document.getElementById("btnEditarProducto");
  const btnEliminarProducto = document.getElementById("btnEliminarProducto");
  const btnModificarStock = document.getElementById("btnModificarStock");
  const btnCargarTexto = document.getElementById("btnCargarTexto");

  // Solo admin tiene todos los botones; usuarios con tienda solo verán "Crear Producto"
  if (loggedUserRole.toLowerCase() === "admin") {
    btnCrearProducto.style.display = "inline-block";
    btnEditarProducto.style.display = "inline-block";
    btnEliminarProducto.style.display = "inline-block";
    btnModificarStock.style.display = "inline-block";
    btnCargarTexto.style.display = "inline-block";
    btnCrearProducto.addEventListener("click", crearProducto);
    btnEditarProducto.addEventListener("click", editarProducto);
    btnEliminarProducto.addEventListener("click", eliminarProducto);
    btnModificarStock.addEventListener("click", modificarStock);
    btnCargarTexto.addEventListener("click", cargarConCadenaTexto);
  } else {
    // Para usuarios con tienda, solo se muestra "Crear Producto"
    btnCrearProducto.style.display = "inline-block";
    btnEditarProducto.style.display = "none";
    btnEliminarProducto.style.display = "none";
    btnModificarStock.style.display = "none";
    btnCargarTexto.style.display = "none";
    btnCrearProducto.addEventListener("click", crearProducto);
  }
});
