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

// Paginación
let currentPage = 1;
let pageSize = 5;

// Datos de sesión
const loggedUser      = localStorage.getItem("loggedUser")      || "";
const loggedUserRole  = localStorage.getItem("loggedUserRole")  || "";
const loggedUserStore = localStorage.getItem("loggedUserStore") || "DefaultStore";
const role = loggedUserRole.toLowerCase();

// Permisos según rol
let userPermissions = {
  crearProducto:    false,
  editarProducto:   false,
  eliminarProducto: false,
  modificarStock:   false,
  cargarTexto:      false
};
if (role === "admin") {
  Object.assign(userPermissions, {
    crearProducto: true,
    editarProducto: true,
    eliminarProducto: true,
    modificarStock: true,
    cargarTexto:    true
  });
} else if (role === "bodega") {
  Object.assign(userPermissions, {
    crearProducto:  true,
    editarProducto: true,
    eliminarProducto:true,
    modificarStock: true,
    cargarTexto:    false
  });
} else {
  // resto
  userPermissions.crearProducto = true;
}
console.log("Permisos de productos:", userPermissions);

// Tienda filtrada
let currentStore = "";

// Helper para deseleccionar
function clearSelection() {
  document.querySelectorAll('#productsBody tr.table-active')
          .forEach(row => row.classList.remove('table-active'));
  selectedProductId = null;
}

// Actualiza el título según tienda
function updateInventoryTitle() {
  const titleElem = document.getElementById("inventoryTitle");
  titleElem.textContent = currentStore
    ? `Inventario de: ${currentStore}`
    : "Inventario: Stock Total";
}

// Carga el filtro de tiendas (solo admin)
async function loadStoreFilter() {
  try {
    const qStores = query(collection(db, "tiendas"), orderBy("nombre"));
    const snapshot = await getDocs(qStores);
    const storeSelect = document.getElementById("storeSelect");
    storeSelect.innerHTML = "<option value=''>Inventario: Stock Total</option>";
    snapshot.forEach(docSnap => {
      const s = docSnap.data().nombre;
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      storeSelect.appendChild(opt);
    });
  } catch (err) {
    console.error("Error al cargar tiendas:", err);
  }
}

// Escucha en tiempo real Productos
function listenProducts() {
  const qProducts = query(collection(db, "productos"), orderBy("codigo", "asc"));
  onSnapshot(qProducts, snap => {
    products = [];
    snap.forEach(docSnap => {
      const p = docSnap.data();
      p.id = docSnap.id;
      products.push(p);
    });
    renderProducts();
  }, err => {
    console.error("onSnapshot error:", err);
    Swal.fire("Error", "No se pudieron obtener los productos: " + err.message, "error");
  });
}

// Renderiza tabla con búsqueda y paginación
function renderProducts() {
  const q = document.getElementById("searchInput").value.trim().toLowerCase();
  const tbody = document.getElementById("productsBody");
  tbody.innerHTML = "";

  const filtered = products.filter(p => {
    return [p.codigo, p.descripcion, p.talla]
      .map(v => (v||"").toLowerCase())
      .some(field => field.includes(q));
  });

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center">No hay productos disponibles</td></tr>`;
    document.getElementById("paginationContainer").innerHTML = "";
    return;
  }

  filtered.sort((a,b) => (a.codigo||"").localeCompare(b.codigo||""));

  const start = (currentPage - 1) * pageSize;
  const pageItems = filtered.slice(start, start + pageSize);

  pageItems.forEach(p => {
    const tr = document.createElement("tr");
    const stock = getDisplayedStock(p);
    tr.innerHTML = `
      <td>${p.codigo}</td>
      <td>${p.descripcion}</td>
      <td>${p.color}</td>
      <td>${p.talla||""}</td>
      <td>Q ${parseFloat(p.precio).toFixed(2)}</td>
      <td>${stock}</td>
    `;
    tr.addEventListener("click", () => {
      clearSelection();
      tr.classList.add("table-active");
      selectedProductId = p.id;
    });
    tbody.appendChild(tr);
  });

  renderPaginationControls(filtered.length);
}

// Calcula stock según filtro
function getDisplayedStock(p) {
  if (!p.stock || typeof p.stock !== "object") return p.stock||0;
  if (!currentStore) {
    return Object.values(p.stock).reduce((sum,v) => sum + Number(v), 0);
  }
  return p.stock[currentStore] || 0;
}

// Paginación en bloques de 5
function renderPaginationControls(total) {
  const container = document.getElementById("paginationContainer");
  const totalPages = Math.ceil(total / pageSize);
  container.innerHTML = "";

  const prev = document.createElement("button");
  prev.textContent = "Anterior";
  prev.className = "btn btn-outline-primary me-1";
  prev.disabled = currentPage === 1;
  prev.addEventListener("click", () => { currentPage--; renderProducts(); });
  container.appendChild(prev);

  const groupSize = 5;
  const startGroup = Math.floor((currentPage-1)/groupSize)*groupSize + 1;
  const endGroup = Math.min(startGroup + groupSize - 1, totalPages);
  for (let i = startGroup; i <= endGroup; i++) {
    const btn = document.createElement("button");
    btn.textContent = i;
    btn.className = "btn btn-outline-primary me-1";
    if (i === currentPage) btn.classList.add("active");
    btn.addEventListener("click", () => { currentPage = i; renderProducts(); });
    container.appendChild(btn);
  }

  const next = document.createElement("button");
  next.textContent = "Siguiente";
  next.className = "btn btn-outline-primary";
  next.disabled = currentPage === totalPages || totalPages === 0;
  next.addEventListener("click", () => { currentPage++; renderProducts(); });
  container.appendChild(next);
}

// Selector de pageSize
function renderPageSizeSelector() {
  const c = document.getElementById("pageSizeContainer");
  c.innerHTML = "";
  const label = document.createElement("label");
  label.textContent = "Mostrar registros:";
  label.className = "me-2";
  const sel = document.createElement("select");
  sel.className = "form-select d-inline-block w-auto";
  [5,10,15,20,25,30].forEach(n => {
    const o = document.createElement("option");
    o.value = n; o.textContent = n;
    if (n === pageSize) o.selected = true;
    sel.appendChild(o);
  });
  sel.addEventListener("change", e => {
    pageSize = parseInt(e.target.value);
    currentPage = 1;
    renderProducts();
  });
  c.append(label, sel);
}

/***** CRUD con SweetAlert2 *****/
async function crearProducto() {
  const { value: vals } = await Swal.fire({
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
      const [c,d,t,col,p] = [
        "swal-input1","swal-input2","swal-input3","swal-input4","swal-input5"
      ].map(id => document.getElementById(id).value.trim());
      const precio = parseFloat(document.getElementById("swal-input5").value);
      if (!c) return Swal.showValidationMessage("El código es obligatorio");
      if (!d) return Swal.showValidationMessage("La descripción es obligatoria");
      if (!col) return Swal.showValidationMessage("El color es obligatorio");
      if (isNaN(precio)||precio<=0) return Swal.showValidationMessage("El precio debe ser > 0");
      return { codigo:c, descripcion:d, talla:t, color:col, precio };
    }
  });
  if (!vals) return;
  try {
    await addDoc(collection(db, "productos"), {
      codigo:      vals.codigo.toUpperCase(),
      descripcion: vals.descripcion.toUpperCase(),
      talla:       vals.talla.toUpperCase(),
      color:       vals.color.toUpperCase(),
      precio:      vals.precio,
      stock:       {},
      createdAt:   new Date().toISOString()
    });
    Swal.fire("Producto creado","Producto creado correctamente","success");
  } catch (err) {
    Swal.fire("Error","No se pudo crear el producto: "+err.message,"error");
  }
}

async function editarProducto() {
  if (!selectedProductId) {
    return Swal.fire("Advertencia","Selecciona un producto para editar","warning");
  }
  const prod = products.find(p => p.id === selectedProductId);
  if (!prod) {
    return Swal.fire("Error","Producto no encontrado","error");
  }
  const { value: vals } = await Swal.fire({
    title: "Editar Producto",
    html: `
      <input id="swal-input1" class="swal2-input" placeholder="Código" value="${prod.codigo}">
      <input id="swal-input2" class="swal2-input" placeholder="Descripción" value="${prod.descripcion}">
      <input id="swal-input3" class="swal2-input" placeholder="Talla" value="${prod.talla||""}">
      <input id="swal-input4" class="swal2-input" placeholder="Color" value="${prod.color||""}">
      <input id="swal-input5" class="swal2-input" placeholder="Precio" type="number" value="${prod.precio}">
    `,
    focusConfirm: false,
    preConfirm: () => {
      const [c,d,t,col] = [
        "swal-input1","swal-input2","swal-input3","swal-input4"
      ].map(id => document.getElementById(id).value.trim());
      const precio = parseFloat(document.getElementById("swal-input5").value);
      if (!c) return Swal.showValidationMessage("El código es obligatorio");
      if (!d) return Swal.showValidationMessage("La descripción es obligatoria");
      if (!col) return Swal.showValidationMessage("El color es obligatorio");
      if (isNaN(precio)||precio<=0) return Swal.showValidationMessage("El precio debe ser > 0");
      return { codigo:c, descripcion:d, talla:t, color:col, precio };
    }
  });
  if (!vals) return;
  try {
    await updateDoc(doc(db, "productos", selectedProductId), {
      codigo:      vals.codigo.toUpperCase(),
      descripcion: vals.descripcion.toUpperCase(),
      talla:       vals.talla.toUpperCase(),
      color:       vals.color.toUpperCase(),
      precio:      vals.precio
    });
    Swal.fire("Producto editado","Actualizado correctamente","success")
      .then(() => clearSelection());
  } catch (err) {
    Swal.fire("Error","No se pudo editar: "+err.message,"error");
  }
}

async function eliminarProducto() {
  if (!selectedProductId) {
    return Swal.fire("Advertencia","Selecciona un producto para eliminar","warning");
  }
  const prod = products.find(p => p.id === selectedProductId);
  if (!prod) {
    return Swal.fire("Error","Producto no encontrado","error");
  }
  const res = await Swal.fire({
    title: "¿Eliminar Producto?",
    text: `Eliminar "${prod.descripcion}"?`,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Sí, eliminar"
  });
  if (!res.isConfirmed) return;
  try {
    await deleteDoc(doc(db, "productos", selectedProductId));
    Swal.fire("Eliminado","Producto eliminado","success")
      .then(() => clearSelection());
  } catch (err) {
    Swal.fire("Error","No se pudo eliminar: "+err.message,"error");
  }
}

async function modificarStock() {
  if (!selectedProductId) {
    return Swal.fire("Advertencia","Selecciona un producto para modificar stock","warning");
  }
  const prod = products.find(p => p.id === selectedProductId);
  if (!prod) {
    return Swal.fire("Error","Producto no encontrado","error");
  }
  if (role === "admin" && !currentStore) {
    return Swal.fire("Info","Selecciona una tienda primero","info");
  }
  const current = getDisplayedStock(prod);
  const { value: newStock } = await Swal.fire({
    title: "Modificar Stock",
    input: "number",
    inputLabel: `Nuevo stock (${currentStore||"Global"})`,
    inputValue: current,
    showCancelButton: true,
    inputValidator: v => {
      if ((!v&&v!==0)||isNaN(v)) return "Ingresa un número";
      if (v<0) return "No negativo";
    }
  });
  if (newStock===undefined) return;
  try {
    const updated = { ...(prod.stock||{}) };
    updated[currentStore] = Number(newStock);
    await updateDoc(doc(db, "productos", selectedProductId), { stock: updated });
    Swal.fire("Stock actualizado","Correcto","success")
      .then(() => clearSelection());
  } catch (err) {
    Swal.fire("Error","No se pudo actualizar stock: "+err.message,"error");
  }
}

async function cargarConCadenaTexto() {
  if (role === "admin" && !currentStore) {
    return Swal.fire("Error","Selecciona una tienda antes de cargar","error");
  }
  const storeKey = currentStore || loggedUserStore;
  const { value: textData } = await Swal.fire({
    title: "Carga Masiva",
    html: `<textarea id="swal-textarea" class="swal2-textarea" placeholder="Código,Descripción,Talla,Precio,Color,Stock"></textarea>`,
    focusConfirm: false,
    preConfirm: () => {
      const t = document.getElementById("swal-textarea").value.trim();
      if (!t) return Swal.showValidationMessage("Ingresa datos");
      return t;
    }
  });
  if (!textData) return;

  const lines = textData.split("\n").map(l => l.trim()).filter(l => l);
  const prods = [];
  for (const line of lines) {
    const parts = line.split(",").map(p => p.trim());
    if (parts.length < 6) continue;
    const [c,d,tRaw,pRaw,col,stkRaw] = parts;
    const precio = parseFloat(pRaw.replace("Q","").trim());
    let stock = parseInt(stkRaw,10);
    if (isNaN(stock)||stock<0) stock = 0;
    prods.push({
      codigo:      c.toUpperCase(),
      descripcion: d.toUpperCase(),
      talla:       tRaw.toUpperCase(),
      precio,
      color:       col.toUpperCase(),
      stock
    });
  }
  if (!prods.length) {
    return Swal.fire("Atención","No hay productos válidos","warning");
  }

  try {
    const ops = [];
    for (const pd of prods) {
      const q = query(collection(db, "productos"), where("codigo","==",pd.codigo));
      const snap = await getDocs(q);
      if (snap.empty) {
        ops.push(addDoc(collection(db, "productos"), {
          ...pd,
          stock: {[storeKey]: pd.stock},
          createdAt: new Date().toISOString()
        }));
      } else {
        const docSnap = snap.docs[0];
        const data = docSnap.data();
        const upd = {...(data.stock||{})};
        upd[storeKey] = (upd[storeKey]||0) + pd.stock;
        ops.push(updateDoc(doc(db, "productos", docSnap.id), { stock: upd }));
      }
    }
    await Promise.all(ops);
    Swal.fire("Carga exitosa",`${prods.length} productos cargados/actualizados`,"success");
  } catch (err) {
    Swal.fire("Error","No se pudo cargar: "+err.message,"error");
  }
}

/***** Inicialización *****/
document.addEventListener("DOMContentLoaded", async () => {
  const storeFilterDiv = document.getElementById("adminStoreFilter");
  const storeSelect    = document.getElementById("storeSelect");

  if (role === "admin") {
    storeFilterDiv.style.display = "block";
    await loadStoreFilter();
    storeSelect.disabled = false;
  } else if (role === "bodega") {
    storeFilterDiv.style.display = "block";
    storeSelect.innerHTML = `<option value="${loggedUserStore}">${loggedUserStore}</option>`;
    storeSelect.disabled = true;
    currentStore = loggedUserStore;
  } else {
    storeFilterDiv.style.display = "none";
    currentStore = "";
  }

  updateInventoryTitle();
  renderPageSizeSelector();
  listenProducts();

  if (!storeSelect.disabled) {
    storeSelect.addEventListener("change", () => {
      currentStore = storeSelect.value;
      updateInventoryTitle();
      listenProducts();
    });
  }

  document.getElementById("searchInput")
          .addEventListener("input", renderProducts);

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
