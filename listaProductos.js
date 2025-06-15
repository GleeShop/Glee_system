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

// Definición de permisos según rol
let userPermissions = {
  crearProducto: false,
  editarProducto: false,
  eliminarProducto: false,
  modificarStock: false,
  cargarTexto: false
};
const role = loggedUserRole.toLowerCase();
if (role === "admin") {
  userPermissions = {
    crearProducto:    true,
    editarProducto:   true,
    eliminarProducto: true,
    modificarStock:   true,
    cargarTexto:      true
  };
} else if (role === "bodega") {
  userPermissions = {
    crearProducto:    true,
    editarProducto:   true,
    eliminarProducto: true,
    modificarStock:   true,
    cargarTexto:      false
  };
} else {
  userPermissions = {
    crearProducto:    true,
    editarProducto:   false,
    eliminarProducto: false,
    modificarStock:   false,
    cargarTexto:      false
  };
}
console.log("Permisos de productos:", userPermissions);

// Variable para el filtrado de tienda
let currentStore = "";
document.getElementById("adminStoreFilter").style.display = "block";

// Helper para deseleccionar fila y resetear selección
function clearSelection() {
  document.querySelectorAll('#productsBody tr.table-active')
          .forEach(row => row.classList.remove('table-active'));
  selectedProductId = null;
}

// Actualiza el título del inventario según la tienda seleccionada
function updateInventoryTitle() {
  const titleElem = document.getElementById("inventoryTitle");
  titleElem.textContent = currentStore
    ? `Inventario de: ${currentStore}`
    : "Inventario: Stock Total";
}

document.addEventListener("DOMContentLoaded", () => {
  loadStoreFilter();
  updateInventoryTitle();
  renderPageSizeSelector();
  listenProducts();

  // Filtro de tienda
  document.getElementById("storeSelect").addEventListener("change", function () {
    currentStore = this.value;
    updateInventoryTitle();
    listenProducts();
  });

  // Filtro de búsqueda
  document.getElementById("searchInput").addEventListener("input", renderProducts);

  // Botones
  const btnCrearProducto   = document.getElementById("btnCrearProducto");
  const btnEditarProducto  = document.getElementById("btnEditarProducto");
  const btnEliminarProducto= document.getElementById("btnEliminarProducto");
  const btnModificarStock  = document.getElementById("btnModificarStock");
  const btnCargarTexto     = document.getElementById("btnCargarTexto");

  if (userPermissions.crearProducto) {
    btnCrearProducto.style.display = "inline-block";
    btnCrearProducto.addEventListener("click", crearProducto);
  } else btnCrearProducto.style.display = "none";

  if (userPermissions.editarProducto) {
    btnEditarProducto.style.display = "inline-block";
    btnEditarProducto.addEventListener("click", editarProducto);
  } else btnEditarProducto.style.display = "none";

  if (userPermissions.eliminarProducto) {
    btnEliminarProducto.style.display = "inline-block";
    btnEliminarProducto.addEventListener("click", eliminarProducto);
  } else btnEliminarProducto.style.display = "none";

  if (userPermissions.modificarStock) {
    btnModificarStock.style.display = "inline-block";
    btnModificarStock.addEventListener("click", modificarStock);
  } else btnModificarStock.style.display = "none";

  if (userPermissions.cargarTexto) {
    btnCargarTexto.style.display = "inline-block";
    btnCargarTexto.addEventListener("click", cargarConCadenaTexto);
  } else btnCargarTexto.style.display = "none";
});

// Carga de tiendas en el select
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

// Escucha en tiempo real la colección "productos"
function listenProducts() {
  const qProducts = query(collection(db, "productos"), orderBy("codigo", "asc"));
  onSnapshot(qProducts,
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

// Renderiza productos con búsqueda y paginación
function renderProducts() {
  const searchQuery = document.getElementById("searchInput").value.trim().toLowerCase();
  const tbody = document.getElementById("productsBody");
  tbody.innerHTML = "";

  const filteredProducts = products.filter(prod => {
    return [prod.codigo, prod.descripcion, prod.talla]
      .map(v => (v || "").toLowerCase())
      .some(field => field.includes(searchQuery));
  });

  if (!filteredProducts.length) {
    tbody.innerHTML =
      "<tr><td colspan='6' class='text-center'>No hay productos disponibles</td></tr>";
    document.getElementById("paginationContainer").innerHTML = "";
    return;
  }

  filteredProducts.sort((a, b) =>
    (a.codigo || "").localeCompare(b.codigo || "")
  );

  const startIndex = (currentPage - 1) * pageSize;
  const paginatedProducts = filteredProducts.slice(startIndex, startIndex + pageSize);

  paginatedProducts.forEach(prod => {
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
      document.querySelectorAll("#productsBody tr").forEach(row =>
        row.classList.remove("table-active")
      );
      tr.classList.add("table-active");
      selectedProductId = prod.id;
    });
    tbody.appendChild(tr);
  });

  renderPaginationControls(filteredProducts.length);
}

// Calcula stock a mostrar
function getDisplayedStock(product) {
  if (!product.stock || typeof product.stock !== "object") {
    return product.stock || 0;
  }
  if (!currentStore) {
    return Object.values(product.stock)
      .reduce((sum, val) => sum + Number(val), 0);
  }
  return product.stock[currentStore] || 0;
}

// Controles de paginación
function renderPaginationControls(totalItems) {
  const container = document.getElementById("paginationContainer");
  const totalPages = Math.ceil(totalItems / pageSize);
  container.innerHTML = "";

  const prev = document.createElement("button");
  prev.textContent = "Anterior";
  prev.className = "btn btn-outline-primary me-1";
  prev.disabled = currentPage === 1;
  prev.addEventListener("click", () => {
    currentPage--; renderProducts();
  });
  container.append(prev);

  const groupSize = 5;
  const groupStart = Math.floor((currentPage - 1) / groupSize) * groupSize + 1;
  const groupEnd = Math.min(groupStart + groupSize - 1, totalPages);

  for (let i = groupStart; i <= groupEnd; i++) {
    const btn = document.createElement("button");
    btn.textContent = i;
    btn.className = "btn btn-outline-primary me-1";
    if (i === currentPage) btn.classList.add("active");
    btn.addEventListener("click", () => {
      currentPage = i; renderProducts();
    });
    container.append(btn);
  }

  const next = document.createElement("button");
  next.textContent = "Siguiente";
  next.className = "btn btn-outline-primary";
  next.disabled = currentPage === totalPages || totalPages === 0;
  next.addEventListener("click", () => {
    currentPage++; renderProducts();
  });
  container.append(next);
}

// Selector de tamaño de página
function renderPageSizeSelector() {
  const container = document.getElementById("pageSizeContainer");
  container.innerHTML = "";
  const label = document.createElement("label");
  label.textContent = "Mostrar registros:";
  label.className = "me-2";
  const select = document.createElement("select");
  select.className = "form-select d-inline-block w-auto";
  [5,10,15,20,25,30].forEach(num => {
    const opt = document.createElement("option");
    opt.value = num; opt.textContent = num;
    if (num === pageSize) opt.selected = true;
    select.append(opt);
  });
  select.addEventListener("change", e => {
    pageSize = +e.target.value;
    currentPage = 1;
    renderProducts();
  });
  container.append(label, select);
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
      if (!codigo) return Swal.showValidationMessage("El código es obligatorio");
      if (!descripcion) return Swal.showValidationMessage("La descripción es obligatoria");
      if (!color) return Swal.showValidationMessage("El color es obligatorio");
      if (isNaN(precio) || precio <= 0) 
        return Swal.showValidationMessage("El precio debe ser mayor a 0");
      return { codigo, descripcion, talla, color, precio };
    }
  });
  if (!formValues) return;
  try {
    const newProduct = {
      codigo: formValues.codigo.toUpperCase(),
      descripcion: formValues.descripcion.toUpperCase(),
      talla: formValues.talla.toUpperCase(),
      color: formValues.color.toUpperCase(),
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
    return Swal.fire("Advertencia", "Selecciona un producto para editar", "warning");
  }
  const product = products.find(p => p.id === selectedProductId);
  if (!product) {
    return Swal.fire("Error", "Producto no encontrado", "error");
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
      if (!codigo) return Swal.showValidationMessage("El código es obligatorio");
      if (!descripcion) return Swal.showValidationMessage("La descripción es obligatoria");
      if (!color) return Swal.showValidationMessage("El color es obligatorio");
      if (isNaN(precio) || precio <= 0) 
        return Swal.showValidationMessage("El precio debe ser mayor a 0");
      return { codigo, descripcion, talla, color, precio };
    }
  });
  if (!formValues) return;
  try {
    const updateData = {
      codigo: formValues.codigo.toUpperCase(),
      descripcion: formValues.descripcion.toUpperCase(),
      talla: formValues.talla.toUpperCase(),
      color: formValues.color.toUpperCase(),
      precio: formValues.precio
    };
    await updateDoc(doc(db, "productos", selectedProductId), updateData);
    Swal.fire("Producto editado", "El producto se actualizó correctamente", "success")
      .then(() => clearSelection());
  } catch (error) {
    Swal.fire("Error", "No se pudo editar el producto: " + error.message, "error");
  }
}

async function eliminarProducto() {
  if (!selectedProductId) {
    return Swal.fire("Advertencia", "Selecciona un producto para eliminar", "warning");
  }
  const product = products.find(p => p.id === selectedProductId);
  if (!product) {
    return Swal.fire("Error", "Producto no encontrado", "error");
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
    Swal.fire("Eliminado", "El producto se eliminó correctamente", "success")
      .then(() => clearSelection());
  } catch (error) {
    Swal.fire("Error", "No se pudo eliminar el producto: " + error.message, "error");
  }
}

async function modificarStock() {
  if (!selectedProductId) {
    return Swal.fire("Advertencia", "Selecciona un producto para modificar el stock", "warning");
  }
  const product = products.find(p => p.id === selectedProductId);
  if (!product) {
    return Swal.fire("Error", "Producto no encontrado", "error");
  }
  if (loggedUserRole.toLowerCase() === "admin" && !currentStore) {
    return Swal.fire(
      "Tienda no seleccionada",
      "Debes elegir una tienda en el filtro para modificar stock",
      "info"
    );
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
      updatedStock[currentStore] = Number(newStock);
      await updateDoc(doc(db, "productos", selectedProductId), { stock: updatedStock });
      Swal.fire("Stock actualizado", "El stock fue actualizado correctamente", "success")
        .then(() => clearSelection());
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
  if (loggedUserRole.toLowerCase() === "admin" && !currentStore) {
    return Swal.fire("Error", "Debes seleccionar una tienda en el filtro antes de cargar inventario.", "error");
  }
  const storeKey = currentStore || loggedUserStore;
  const { value: textData } = await Swal.fire({
    title: "Cargar Productos en Masa",
    html: `<textarea id="swal-textarea" class="swal2-textarea" placeholder="Código,Descripción,Talla,Precio,Color,Stock"></textarea>`,
    focusConfirm: false,
    preConfirm: () => {
      const text = document.getElementById("swal-textarea").value.trim();
      if (!text) {
        return Swal.showValidationMessage("Debes ingresar datos para cargar");
      }
      return text;
    }
  });
  if (!textData) return;

  const lines = textData.split("\n")
    .map(line => line.trim())
    .filter(line => line !== "");
  const productosProcesados = [];

  lines.forEach(line => {
    const parts = line.split(",").map(item => item.trim());
    if (parts.length < 6) return;
    const [cod, desc, talla, precioRaw, color, stockRaw] = parts;
    const precio = parseFloat(precioRaw.replace("Q", "").trim());
    let stock = parseInt(stockRaw, 10);
    if (isNaN(stock) || stock < 0) stock = 0;
    productosProcesados.push({
      codigo: cod.toUpperCase(),
      descripcion: desc.toUpperCase(),
      talla: talla.toUpperCase(),
      precio,
      color: color.toUpperCase(),
      stock
    });
  });

  if (!productosProcesados.length) {
    return Swal.fire("Atención", "No se encontraron productos válidos en los datos ingresados", "warning");
  }

  try {
    const batch = [];
    for (const prod of productosProcesados) {
      const productQuery = query(
        collection(db, "productos"),
        where("codigo", "==", prod.codigo)
      );
      const querySnapshot = await getDocs(productQuery);
      if (querySnapshot.empty) {
        batch.push(addDoc(collection(db, "productos"), {
          ...prod,
          stock: { [storeKey]: prod.stock },
          createdAt: new Date().toISOString()
        }));
      } else {
        const docSnap = querySnapshot.docs[0];
        const existing = docSnap.data();
        const updatedStock = existing.stock && typeof existing.stock === "object"
          ? { ...existing.stock }
          : {};
        updatedStock[storeKey] = (updatedStock[storeKey] || 0) + prod.stock;
        batch.push(updateDoc(doc(db, "productos", docSnap.id), { stock: updatedStock }));
      }
    }
    await Promise.all(batch);
    Swal.fire(
      "Carga exitosa",
      `${productosProcesados.length} productos han sido cargados o actualizados correctamente.`,
      "success"
    );
  } catch (error) {
    Swal.fire("Error", "No se pudo cargar los productos: " + error.message, "error");
  }
}
