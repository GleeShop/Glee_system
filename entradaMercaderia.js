import { db } from "./firebase-config.js";
import {
  collection,
  query,
  orderBy,
  where,
  getDocs,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

// Verificar que db sea un objeto Firestore
console.log("db =>", db);

// Variables globales
let allProducts = [];
let invoiceItems = [];
let currentProductRow = null;
let currentInvoiceData = null;  // Almacena la data de la factura visualizada

// Leer datos del usuario (rol y tienda) desde localStorage
const loggedUserRole  = localStorage.getItem("loggedUserRole")  || "";
const loggedUserStore = localStorage.getItem("loggedUserStore") || "";
let currentStore = "";

// Decidir si es admin o no
if (loggedUserRole.toLowerCase() === "admin") {
  document.getElementById("adminStoreFilter").style.display = "block";
  document.getElementById("invoiceTitle").textContent = "Registro de Facturas (Todas las Tiendas)";
} else {
  currentStore = loggedUserStore || "DefaultStore";
  document.getElementById("invoiceTitle").textContent = `Registro de Facturas: ${currentStore}`;
}

/*****************************************************
 * CARGAR TIENDAS EN EL SELECT (SOLO SI ES ADMIN)
 *****************************************************/
async function loadStoreFilter() {
  try {
    const qTiendas = query(collection(db, "tiendas"), orderBy("nombre"));
    const snapshot = await getDocs(qTiendas);
    const storeSelect = document.getElementById("storeSelect");
    storeSelect.innerHTML = "<option value=''>Ver todas las facturas (todas las tiendas)</option>";
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
      document.getElementById("invoiceTitle").textContent =
        currentStore ? `Registro de Facturas: ${currentStore}` : "Registro de Facturas (Todas las Tiendas)";
      loadInvoices();
    });
  });
}

/*****************************************************
 * CARGAR PRODUCTOS
 *****************************************************/
async function loadAllProductsForInvoice() {
  try {
    const productosRef = collection(db, "productos");
    const q = query(productosRef, orderBy("codigo"));
    const snapshot = await getDocs(q);
    allProducts = [];
    snapshot.forEach((docSnap) => {
      const prod = docSnap.data();
      prod.id = docSnap.id;
      allProducts.push(prod);
    });
  } catch (error) {
    console.error("Error al cargar productos para factura:", error);
  }
}

/*****************************************************
 * MOSTRAR FORMULARIO PARA AGREGAR FACTURA
 *****************************************************/
async function showAddInvoiceForm() {
  document.getElementById("invoiceForm").reset();
  document.getElementById("invoiceId").value = "";
  document.querySelector("#invoiceItemsTable tbody").innerHTML = "";
  document.getElementById("invoiceOverallTotal").value = "";

  await loadInvoiceStores();
  await loadAllProductsForInvoice();

  if (loggedUserRole.toLowerCase() !== "admin") {
    document.getElementById("invoiceStore").value = loggedUserStore;
  }

  invoiceItems = [];
  renderInvoiceItems();
  updateOverallTotal();
  new bootstrap.Modal(document.getElementById("invoiceModal")).show();
}

/*****************************************************
 * CARGAR TIENDAS PARA EL SELECT de la factura
 *****************************************************/
async function loadInvoiceStores() {
  try {
    const tiendasRef = collection(db, "tiendas");
    const qTiendas = query(tiendasRef, orderBy("nombre"));
    const snapshot = await getDocs(qTiendas);
    const storeSelect = document.getElementById("invoiceStore");
    storeSelect.innerHTML = "<option value=''>Seleccione tienda</option>";
    snapshot.forEach((docSnap) => {
      const store = docSnap.data();
      const option = document.createElement("option");
      option.value = store.nombre;
      option.textContent = store.nombre;
      storeSelect.appendChild(option);
    });
  } catch (error) {
    console.error("Error al cargar tiendas para facturación:", error);
  }
}

/*****************************************************
 * AGREGAR UN PRODUCTO A LA FACTURA
 *****************************************************/
function addInvoiceItem() {
  const tbody = document.querySelector("#invoiceItemsTable tbody");
  const row = tbody.insertRow();

  // Celda producto
  const cellProduct = row.insertCell(0);
  const btnSelectProduct = document.createElement("button");
  btnSelectProduct.type = "button";
  btnSelectProduct.className = "btn btn-outline-secondary";
  btnSelectProduct.textContent = "Seleccionar producto";
  btnSelectProduct.addEventListener("click", function () {
    showProductSelectionModal(row);
  });
  cellProduct.appendChild(btnSelectProduct);

  // Celda cantidad
  const cellQuantity = row.insertCell(1);
  const quantityInput = document.createElement("input");
  quantityInput.type = "number";
  quantityInput.name = "quantity";
  quantityInput.className = "form-control";
  quantityInput.value = "0";
  quantityInput.addEventListener("input", () => updateInvoiceItemRow(row));
  cellQuantity.appendChild(quantityInput);

  // Celda precio
  const cellPrice = row.insertCell(2);
  const priceInput = document.createElement("input");
  priceInput.type = "number";
  priceInput.name = "price";
  priceInput.className = "form-control";
  priceInput.value = "0";
  priceInput.readOnly = true;
  cellPrice.appendChild(priceInput);

  // Celda total
  const cellTotal = row.insertCell(3);
  cellTotal.textContent = "0.00";

  // Celda acciones
  const cellActions = row.insertCell(4);
  const btnDelete = document.createElement("button");
  btnDelete.className = "btn btn-danger btn-sm";
  btnDelete.textContent = "Eliminar";
  btnDelete.addEventListener("click", () => {
    tbody.removeChild(row);
    updateOverallTotal();
  });
  cellActions.appendChild(btnDelete);

  updateInvoiceItemRow(row);
}

/*****************************************************
 * FUNCIONES DEL MODAL DE SELECCIÓN DE PRODUCTOS
 *****************************************************/
function showProductSelectionModal(row) {
  currentProductRow = row;
  renderProductList(allProducts);
  document.getElementById("productSearchInput").value = "";
  new bootstrap.Modal(document.getElementById("productSelectionModal")).show();
}

function renderProductList(products) {
  const container = document.getElementById("productListContainer");
  container.innerHTML = "";
  if (products.length === 0) {
    container.textContent = "No se encontraron productos.";
    return;
  }
  products.forEach((prod) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "list-group-item list-group-item-action";
    btn.textContent = `${prod.codigo} - ${prod.descripcion}`;
    btn.addEventListener("click", () => selectProductForRow(prod));
    container.appendChild(btn);
  });
}

document.getElementById("productSearchInput").addEventListener("input", function () {
  const searchTerm = this.value.toLowerCase();
  const filteredProducts = allProducts.filter(
    (prod) =>
      (prod.codigo && prod.codigo.toLowerCase().includes(searchTerm)) ||
      (prod.descripcion && prod.descripcion.toLowerCase().includes(searchTerm))
  );
  renderProductList(filteredProducts);
});

function selectProductForRow(product) {
  if (!currentProductRow) return;
  const cellProduct = currentProductRow.cells[0];
  cellProduct.textContent = `${product.codigo} - ${product.descripcion}`;
  currentProductRow.setAttribute("data-product-id", product.id);
  const priceInput = currentProductRow.cells[2].querySelector("input[name='price']");
  priceInput.value = product.precio || "0";
  updateInvoiceItemRow(currentProductRow);
  bootstrap.Modal.getInstance(document.getElementById("productSelectionModal")).hide();
}

/*****************************************************
 * ACTUALIZAR CÁLCULOS DE ÍTEM Y FACTURA
 *****************************************************/
function updateInvoiceItemRow(row) {
  const quantity = parseFloat(row.cells[1].querySelector("input[name='quantity']").value);
  const price = parseFloat(row.cells[2].querySelector("input[name='price']").value);
  const total = isNaN(quantity * price) ? 0 : quantity * price;
  row.cells[3].textContent = total.toFixed(2);

  const tbody = document.querySelector("#invoiceItemsTable tbody");
  let items = [];
  for (let r of tbody.rows) {
    const productId = r.getAttribute("data-product-id");
    const qty = parseFloat(r.cells[1].querySelector("input[name='quantity']").value);
    const prc = parseFloat(r.cells[2].querySelector("input[name='price']").value);
    const tot = isNaN(qty * prc) ? 0 : qty * prc;
    if (productId) {
      items.push({ productId, quantity: qty, price: prc, total: tot });
    }
  }
  invoiceItems = items;
  updateOverallTotal();
}

function renderInvoiceItems() {
  const tbody = document.querySelector("#invoiceItemsTable tbody");
  tbody.innerHTML = "";
  invoiceItems.forEach((item, index) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${getProductText(item.productId)}</td>
      <td>${item.quantity}</td>
      <td>Q ${parseFloat(item.price).toFixed(2)}</td>
      <td>Q ${parseFloat(item.total).toFixed(2)}</td>
      <td>
        <button class="btn btn-sm btn-danger" onclick="removeInvoiceItem(${index})">Eliminar</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

function getProductText(productId) {
  const prod = allProducts.find((p) => p.id === productId);
  return prod ? `${prod.codigo} - ${prod.descripcion}` : productId;
}

function removeInvoiceItem(index) {
  invoiceItems.splice(index, 1);
  renderInvoiceItems();
  updateOverallTotal();
}

function updateOverallTotal() {
  const total = invoiceItems.reduce((sum, item) => sum + item.total, 0);
  document.getElementById("invoiceOverallTotal").value = total.toFixed(2);
}

/*****************************************************
 * CREAR EL CONTENEDOR DE CONSTANCIA
 *****************************************************/
function crearConstancia() {
  // Utiliza los datos de currentInvoiceData si existen; de lo contrario, toma los valores del formulario
  const invoiceData = currentInvoiceData || {
    invoiceStore: document.getElementById("invoiceStore").value,
    invoiceNumber: document.getElementById("invoiceNumber").value,
    items: invoiceItems
  };

  const constancia = document.createElement("div");
  constancia.id = "constanciaIngreso";
  constancia.style.width = "800px";
  constancia.style.margin = "20px auto";
  constancia.style.padding = "20px";
  constancia.style.fontFamily = "Arial, sans-serif";
  constancia.style.border = "1px solid #ccc";
  constancia.style.boxShadow = "0 0 10px rgba(0,0,0,0.1)";

  // Cabecera: logo, título y datos adicionales
  const header = document.createElement("div");
  header.style.textAlign = "center";

  const logo = document.createElement("img");
  logo.src = "./img/GLEED2.png";
  logo.alt = "Logo";
  logo.style.width = "200px";
  header.appendChild(logo);

  const title = document.createElement("h2");
  title.textContent = "Constancia de Ingreso de Producto";
  header.appendChild(title);

  const info = document.createElement("p");
  const storeName = invoiceData.invoiceStore || "N/A";
  const invoiceNum = invoiceData.invoiceNumber || "";
  const now = new Date();
  const fechaStr = now.toLocaleDateString();
  const horaStr = now.toLocaleTimeString();
  info.innerHTML = `<strong>Tienda:</strong> ${storeName} <br/>
                    <strong>Fecha:</strong> ${fechaStr} <br/>
                    <strong>Hora:</strong> ${horaStr} <br/>
                    <strong>Número de Factura:</strong> ${invoiceNum}`;
  header.appendChild(info);
  constancia.appendChild(header);

  // Tabla de productos
  const table = document.createElement("table");
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";
  table.style.marginTop = "20px";

  const thead = document.createElement("thead");
  const trHead = document.createElement("tr");
  const headers = ["Producto", "Cantidad", "Precio Unitario", "Total"];
  headers.forEach((text) => {
    const th = document.createElement("th");
    th.textContent = text;
    th.style.border = "1px solid #000";
    th.style.padding = "8px";
    th.style.backgroundColor = "#f2f2f2";
    trHead.appendChild(th);
  });
  thead.appendChild(trHead);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  (invoiceData.items || []).forEach((item) => {
    const tr = document.createElement("tr");

    const tdProducto = document.createElement("td");
    tdProducto.textContent = getProductText(item.productId);
    tdProducto.style.border = "1px solid #000";
    tdProducto.style.padding = "8px";
    tr.appendChild(tdProducto);

    const tdCantidad = document.createElement("td");
    tdCantidad.textContent = item.quantity;
    tdCantidad.style.border = "1px solid #000";
    tdCantidad.style.padding = "8px";
    tr.appendChild(tdCantidad);

    const tdPrecio = document.createElement("td");
    tdPrecio.textContent = `Q ${parseFloat(item.price).toFixed(2)}`;
    tdPrecio.style.border = "1px solid #000";
    tdPrecio.style.padding = "8px";
    tr.appendChild(tdPrecio);

    const tdTotal = document.createElement("td");
    tdTotal.textContent = `Q ${parseFloat(item.total).toFixed(2)}`;
    tdTotal.style.border = "1px solid #000";
    tdTotal.style.padding = "8px";
    tr.appendChild(tdTotal);

    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  constancia.appendChild(table);

  return constancia;
}

/*****************************************************
 * GENERAR CONSTANCIA DE INGRESO (automático tras guardar)
 *****************************************************/
function generarConstanciaIngreso() {
  if (document.activeElement) document.activeElement.blur();
  const constancia = crearConstancia();
  const hiddenContainer = document.createElement("div");
  hiddenContainer.style.position = "fixed";
  hiddenContainer.style.top = "-10000px";
  hiddenContainer.appendChild(constancia);
  document.body.appendChild(hiddenContainer);

  html2canvas(constancia).then((canvas) => {
    const imgData = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.download = "constancia_ingreso.png";
    link.href = imgData;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    document.body.removeChild(hiddenContainer);
  });
}

/*****************************************************
 * EXPORTAR COMPROBANTE DESDE EL MODAL (Detalles de Factura)
 *****************************************************/
function exportInvoiceComprobante() {
  if (document.activeElement) document.activeElement.blur();
  const constancia = crearConstancia();
  const hiddenContainer = document.createElement("div");
  hiddenContainer.style.position = "fixed";
  hiddenContainer.style.top = "-10000px";
  hiddenContainer.appendChild(constancia);
  document.body.appendChild(hiddenContainer);

  html2canvas(constancia).then((canvas) => {
    const imgData = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.download = "constancia_ingreso.png";
    link.href = imgData;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    document.body.removeChild(hiddenContainer);
  });
}

/*****************************************************
 * CREAR/ACTUALIZAR FACTURA
 *****************************************************/
async function saveInvoice() {
  try {
    const invoiceId = document.getElementById("invoiceId").value;
    const invoiceNumber = document.getElementById("invoiceNumber").value.trim();
    const invoiceDate = document.getElementById("invoiceDate").value;
    const invoiceStore = document.getElementById("invoiceStore").value;

    if (!invoiceNumber || !invoiceDate || !invoiceStore || invoiceItems.length === 0) {
      throw new Error("Complete todos los campos obligatorios y agregue al menos un producto.");
    }

    const overallTotal = invoiceItems.reduce((sum, item) => sum + item.total, 0);
    const invoiceData = {
      invoiceNumber,
      invoiceDate: Timestamp.fromDate(new Date(invoiceDate)),
      invoiceStore,
      items: invoiceItems,
      overallTotal,
      status: "activo",
      createdAt: serverTimestamp()
    };

    if (invoiceId) {
      await updateDoc(doc(db, "facturas", invoiceId), invoiceData);
    } else {
      const newInvoiceRef = await addDoc(collection(db, "facturas"), invoiceData);
      for (const item of invoiceItems) {
        const prodRef = doc(db, "productos", item.productId);
        const prodDoc = await getDoc(prodRef);
        if (prodDoc.exists()) {
          const prodData = prodDoc.data();
          const currentStock = (prodData.stock && prodData.stock[invoiceStore]) || 0;
          const newStock = currentStock + item.quantity;
          const updatedStock = { ...prodData.stock, [invoiceStore]: newStock };
          await updateDoc(prodRef, { stock: updatedStock });
        }
      }
      // Generar automáticamente la constancia tras guardar una factura nueva
      generarConstanciaIngreso();
    }

    bootstrap.Modal.getInstance(document.getElementById("invoiceModal")).hide();
    loadInvoices();
  } catch (error) {
    console.error("Error al guardar la factura:", error);
    alert("Error al guardar la factura: " + error.message);
  }
}

/*****************************************************
 * CARGAR Y MOSTRAR FACTURAS
 *****************************************************/
async function loadInvoices() {
  try {
    const facturasRef = collection(db, "facturas");
    let q;
    if (loggedUserRole.toLowerCase() === "admin") {
      const storeSelected = document.getElementById("storeSelect")?.value || "";
      q = storeSelected
        ? query(facturasRef, where("invoiceStore", "==", storeSelected), orderBy("invoiceDate", "desc"))
        : query(facturasRef, orderBy("invoiceDate", "desc"));
    } else {
      q = query(facturasRef, where("invoiceStore", "==", loggedUserStore || ""), orderBy("invoiceDate", "desc"));
    }

    const snapshot = await getDocs(q);
    await loadAllProductsForInvoice();

    const tbody = document.querySelector("#facturasTable tbody");
    tbody.innerHTML = "";
    snapshot.forEach((docSnap) => {
      const invoice = docSnap.data();
      const row = tbody.insertRow();
      if (invoice.status === "anulado") row.classList.add("table-warning");
      row.insertCell(0).textContent = invoice.invoiceNumber;
      const dateStr = invoice.invoiceDate && invoice.invoiceDate.toDate ? invoice.invoiceDate.toDate().toLocaleDateString() : "";
      row.insertCell(1).textContent = dateStr;
      row.insertCell(2).textContent = invoice.invoiceStore || "-";
      row.insertCell(3).textContent = invoice.status ? invoice.status.toUpperCase() : "ACTIVO";

      const productsList = (invoice.items || [])
        .map((item) => {
          const prod = allProducts.find((p) => p.id === item.productId);
          return prod ? `${prod.codigo} - ${prod.descripcion}` : item.productId;
        })
        .join(", ");
      row.insertCell(4).textContent = productsList;
      row.insertCell(5).textContent = invoice.overallTotal;

      const cellActions = row.insertCell(6);
      cellActions.innerHTML = `
        <button class="btn btn-sm btn-info me-1" onclick="viewInvoiceDetails('${docSnap.id}')">
          <i class="fa-solid fa-eye"></i> Detalles
        </button>
        <button class="btn btn-sm btn-primary me-1" onclick="editInvoice('${docSnap.id}')">
          <i class="fa-solid fa-edit"></i> Editar
        </button>
        <button class="btn btn-sm btn-warning me-1" onclick="anularInvoice('${docSnap.id}')">
          <i class="fa-solid fa-ban"></i> Anular
        </button>
        <button class="btn btn-sm btn-danger" onclick="deleteInvoice('${docSnap.id}')">
          <i class="fa-solid fa-trash"></i> Eliminar
        </button>
      `;
    });
  } catch (error) {
    console.error("Error al cargar facturas:", error);
    alert("Error al cargar facturas: " + error.message);
  }
}

/*****************************************************
 * VER DETALLES DE FACTURA
 *****************************************************/
async function viewInvoiceDetails(invoiceId) {
  try {
    const docRef = doc(db, "facturas", invoiceId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      alert("Factura no encontrada.");
      return;
    }
    const invoice = docSnap.data();
    currentInvoiceData = invoice;  // Guardamos la data actual para usarla en la constancia
    document.getElementById("detailInvoiceNumber").textContent = invoice.invoiceNumber;
    const dateStr = invoice.invoiceDate && invoice.invoiceDate.toDate ? invoice.invoiceDate.toDate().toLocaleDateString() : "";
    document.getElementById("detailInvoiceDate").textContent = dateStr;
    document.getElementById("detailInvoiceStore").textContent = invoice.invoiceStore || "-";
    document.getElementById("detailInvoiceStatus").textContent = invoice.status ? invoice.status.toUpperCase() : "ACTIVO";

    const tbody = document.getElementById("detailInvoiceItems");
    tbody.innerHTML = "";
    (invoice.items || []).forEach((item) => {
      const tr = document.createElement("tr");
      const prod = allProducts.find((p) => p.id === item.productId);
      const prodText = prod ? `${prod.codigo} - ${prod.descripcion}` : item.productId;
      tr.innerHTML = `
        <td>${prodText}</td>
        <td>${item.quantity}</td>
        <td>Q ${parseFloat(item.price).toFixed(2)}</td>
        <td>Q ${parseFloat(item.total).toFixed(2)}</td>
      `;
      tbody.appendChild(tr);
    });
    document.getElementById("detailInvoiceOverallTotal").textContent = parseFloat(invoice.overallTotal).toFixed(2);
    new bootstrap.Modal(document.getElementById("invoiceDetailsModal")).show();
  } catch (error) {
    console.error("Error al cargar detalles de factura:", error);
    alert("Error al cargar detalles: " + error.message);
  }
}

// Exponer funciones globalmente para su uso en el HTML
window.showAddInvoiceForm = showAddInvoiceForm;
window.addInvoiceItem = addInvoiceItem;
window.removeInvoiceItem = removeInvoiceItem;
window.saveInvoice = saveInvoice;
window.loadInvoices = loadInvoices;
window.viewInvoiceDetails = viewInvoiceDetails;
window.exportInvoiceComprobante = exportInvoiceComprobante;
window.editInvoice = editInvoice;
window.deleteInvoice = deleteInvoice;
window.anularInvoice = anularInvoice;
window.exportInvoicesImage = exportInvoicesImage;
