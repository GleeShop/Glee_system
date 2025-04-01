/***************************************************
 * traslados.js (Firebase V9)
 * Lógica para gestionar traslados con selección múltiple de productos
 ***************************************************/
import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  addDoc,
  query,
  orderBy,
  where,
  serverTimestamp,
  increment
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

// Variables globales
let products = [];
let allStores = [];
let selectedProducts = []; // Almacena objetos { productId, quantity }

// Leer info del usuario
const loggedUser = localStorage.getItem("loggedUser") || "";
const loggedUserRole = localStorage.getItem("loggedUserRole") || "";
const loggedUserStore = localStorage.getItem("loggedUserStore") || "";

/****************************************************
 * 1) Cargar TODAS las tiendas
 ****************************************************/
async function loadAllStores() {
  try {
    const q = query(collection(db, "tiendas"), orderBy("nombre"));
    const snapshot = await getDocs(q);
    allStores = [];
    snapshot.forEach((docSnap) => {
      const storeData = docSnap.data();
      allStores.push(storeData.nombre);
    });
  } catch (error) {
    console.error("Error loadAllStores:", error);
  }
}

/****************************************************
 * 2) Poblar <select> origin y destination (admin only)
 ****************************************************/
function populateOriginStoreSelect() {
  const storeSelect = document.getElementById("storeSelectOrigin");
  if (!storeSelect) return;
  storeSelect.innerHTML = `<option value="">Ver todos los traslados</option>`;
  allStores.forEach((storeName) => {
    const option = document.createElement("option");
    option.value = storeName;
    option.textContent = storeName;
    storeSelect.appendChild(option);
  });
}

function populateDestinationStoreSelect() {
  const storeSelect = document.getElementById("storeSelectDestination");
  if (!storeSelect) return;
  storeSelect.innerHTML = `<option value="">Ver todos los pendientes</option>`;
  allStores.forEach((storeName) => {
    const option = document.createElement("option");
    option.value = storeName;
    option.textContent = storeName;
    storeSelect.appendChild(option);
  });
}

/************************************************
 * 3) Cargar la lista global de productos
 ************************************************/
async function loadProductsGlobal() {
  try {
    const q = query(collection(db, "productos"), orderBy("codigo"));
    const snapshot = await getDocs(q);
    products = [];
    snapshot.forEach((docSnap) => {
      const prod = docSnap.data();
      prod.id = docSnap.id;
      products.push(prod);
    });
  } catch (error) {
    console.error("Error loading products:", error);
  }
}

/************************************************
 * 4) Función para obtener stock según tienda origen
 ************************************************/
function getStockForProduct(prod) {
  const originStore = document.getElementById("transferOrigin")
    ? document.getElementById("transferOrigin").value
    : "";
  let stockField = "";
  if (originStore === "Tienda A") stockField = "stockTiendaA";
  else if (originStore === "Tienda B") stockField = "stockTiendaB";
  return prod[stockField] !== undefined ? prod[stockField] : "N/A";
}

/************************************************
 * 5) Cargar "Mis Traslados" (para múltiples productos)
 ************************************************/
async function loadMyTransfers() {
  try {
    let qTraslados;
    const trasladosRef = collection(db, "traslados");

    if (loggedUserRole.toLowerCase() === "admin") {
      const storeSelected =
        document.getElementById("storeSelectOrigin")?.value || "";
      if (storeSelected) {
        qTraslados = query(
          trasladosRef,
          where("origin", "==", storeSelected),
          orderBy("date", "desc")
        );
      } else {
        qTraslados = query(trasladosRef, orderBy("date", "desc"));
      }
    } else {
      qTraslados = query(
        trasladosRef,
        where("pedidoPor", "==", loggedUser),
        orderBy("date", "desc")
      );
    }

    const snapshot = await getDocs(qTraslados);
    const tbody = document.querySelector("#myTransfersTable tbody");
    tbody.innerHTML = "";

    snapshot.forEach((docSnap) => {
      const transfer = docSnap.data();
      const row = tbody.insertRow();

      row.insertCell(0).textContent = docSnap.id.substring(0, 6);

      // Mostrar arreglo de productos
      let productStr = "";
      let quantityStr = "";
      if (transfer.products && Array.isArray(transfer.products)) {
        transfer.products.forEach((item) => {
          const prod = products.find((p) => p.id === item.productId);
          productStr += prod
            ? `${prod.codigo} - ${prod.descripcion}<br>`
            : item.productId + "<br>";
          quantityStr += item.quantity + "<br>";
        });
      }
      row.insertCell(1).innerHTML = productStr;
      row.insertCell(2).innerHTML = quantityStr;
      row.insertCell(3).textContent = transfer.origin;
      row.insertCell(4).textContent = transfer.destination;

      const dateStr =
        transfer.date && transfer.date.toDate
          ? transfer.date.toDate().toLocaleString()
          : "";
      row.insertCell(5).textContent = dateStr;

      row.insertCell(6).textContent = transfer.status
        ? transfer.status.toUpperCase()
        : "ACTIVO";

      const cellActions = row.insertCell(7);
      if (transfer.status === "pendiente") {
        cellActions.innerHTML = `
          <button class="btn btn-sm btn-primary me-1" onclick="editTransfer('${docSnap.id}')">Editar</button>
          <button class="btn btn-sm btn-warning me-1" onclick="annulTransfer('${docSnap.id}')">Anular</button>
          <button class="btn btn-sm btn-danger" onclick="deleteTransfer('${docSnap.id}')">Eliminar</button>
        `;
      } else {
        cellActions.textContent = "-";
      }
    });
  } catch (error) {
    console.error("Error loading my transfers:", error);
    Swal.fire("Error", "Error loading my transfers: " + error.message, "error");
  }
}

/***************************************************
 * 6) Cargar traslados pendientes (para validación)
 ***************************************************/
async function loadPendingTransfers() {
  try {
    let qPending;
    const trasladosRef = collection(db, "traslados");

    if (loggedUserRole.toLowerCase() === "admin") {
      const storeSelected =
        document.getElementById("storeSelectDestination")?.value || "";
      if (storeSelected) {
        qPending = query(
          trasladosRef,
          where("destination", "==", storeSelected),
          where("status", "==", "pendiente"),
          orderBy("date", "desc")
        );
      } else {
        qPending = query(
          trasladosRef,
          where("status", "==", "pendiente"),
          orderBy("date", "desc")
        );
      }
    } else {
      qPending = query(
        trasladosRef,
        where("destination", "==", loggedUserStore),
        where("status", "==", "pendiente"),
        orderBy("date", "desc")
      );
    }

    const snapshot = await getDocs(qPending);
    const tbody = document.querySelector("#pendingTransfersTable tbody");
    tbody.innerHTML = "";

    snapshot.forEach((docSnap) => {
      const transfer = docSnap.data();
      const row = tbody.insertRow();

      row.insertCell(0).textContent = docSnap.id.substring(0, 6);

      const dateStr =
        transfer.date && transfer.date.toDate
          ? transfer.date.toDate().toLocaleString()
          : "";
      row.insertCell(1).textContent = dateStr;

      let productStr = "";
      let quantityStr = "";
      if (transfer.products && Array.isArray(transfer.products)) {
        transfer.products.forEach((item) => {
          const prod = products.find((p) => p.id === item.productId);
          productStr += prod
            ? `${prod.codigo} - ${prod.descripcion}<br>`
            : item.productId + "<br>";
          quantityStr += item.quantity + "<br>";
        });
      }
      row.insertCell(2).innerHTML = productStr;
      row.insertCell(3).innerHTML = quantityStr;
      row.insertCell(4).textContent = transfer.pedidoPor || "-";

      let destStockField = "";
      if (transfer.destination === "Tienda A") destStockField = "stockTiendaA";
      else if (transfer.destination === "Tienda B") destStockField = "stockTiendaB";
      let currentStock = "N/A";
      if (
        transfer.products &&
        transfer.products.length > 0 &&
        products.find((p) => p.id === transfer.products[0].productId)
      ) {
        const prod = products.find((p) => p.id === transfer.products[0].productId);
        currentStock =
          prod && prod[destStockField] !== undefined
            ? prod[destStockField]
            : "N/A";
      }
      row.insertCell(5).textContent = currentStock;

      const cellActions = row.insertCell(6);
      cellActions.innerHTML = `
        <button class="btn btn-sm btn-info" onclick="showValidationDetail('${docSnap.id}')">Ver Detalles</button>
      `;
    });
  } catch (error) {
    console.error("Error loading pending transfers:", error);
    Swal.fire("Error", "Error loading pending transfers: " + error.message, "error");
  }
}

/********************************************************
 * 7) Mostrar detalle para validar un traslado pendiente
 ********************************************************/
async function showValidationDetail(transferId) {
  try {
    const transferRef = doc(db, "traslados", transferId);
    const transferSnap = await getDoc(transferRef);

    if (!transferSnap.exists()) {
      Swal.fire("Error", "Traslado no encontrado", "error");
      return;
    }
    const transfer = transferSnap.data();

    let productsStr = "";
    let quantitiesStr = "";
    if (transfer.products && Array.isArray(transfer.products)) {
      transfer.products.forEach((item) => {
        const prod = products.find((p) => p.id === item.productId);
        productsStr += prod
          ? `${prod.codigo} - ${prod.descripcion}<br>`
          : item.productId + "<br>";
        quantitiesStr += item.quantity + "<br>";
      });
    }

    document.getElementById("detailId").textContent = transferId.substring(0, 6);
    document.getElementById("detailProduct").innerHTML = productsStr;
    document.getElementById("detailQuantity").innerHTML = quantitiesStr;
    document.getElementById("detailPedidoPor").textContent =
      transfer.pedidoPor || "-";

    let destStockField = "";
    if (transfer.destination === "Tienda A") destStockField = "stockTiendaA";
    else if (transfer.destination === "Tienda B") destStockField = "stockTiendaB";
    let currentStock = "N/A";
    if (
      transfer.products &&
      transfer.products.length > 0 &&
      products.find((p) => p.id === transfer.products[0].productId)
    ) {
      const prod = products.find((p) => p.id === transfer.products[0].productId);
      currentStock =
        prod && prod[destStockField] !== undefined ? prod[destStockField] : "N/A";
    }
    document.getElementById("detailStock").textContent = currentStock;

    document.getElementById("transferDetail").setAttribute("data-id", transferId);
    document.getElementById("transferDetail").style.display = "block";
  } catch (error) {
    console.error("Error showing validation detail:", error);
    Swal.fire("Error", "Error mostrando detalle: " + error.message, "error");
  }
}

/***********************************************************
 * 8) Validar (confirmar recepción) de un traslado pendiente
 ***********************************************************/
async function validateTransfer() {
  const detailDiv = document.getElementById("transferDetail");
  const transferId = detailDiv.getAttribute("data-id");
  if (!transferId) return;

  const confirmResult = await Swal.fire({
    title: "Confirmar Recepción",
    text: "¿Confirmas que has recibido físicamente los productos?",
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "Pedido Recibido",
    cancelButtonText: "Cancelar"
  });
  if (!confirmResult.isConfirmed) return;

  try {
    const transferRef = doc(db, "traslados", transferId);
    const transferSnap = await getDoc(transferRef);
    if (!transferSnap.exists()) {
      Swal.fire("Error", "Traslado no encontrado", "error");
      return;
    }
    const transfer = transferSnap.data();

    const prodRef = doc(db, "productos", transfer.products[0].productId);
    await updateDoc(prodRef, {
      [transfer.destination === "Tienda A" ? "stockTiendaA" : "stockTiendaB"]:
        increment(transfer.products[0].quantity)
    });

    await updateDoc(transferRef, {
      status: "validado",
      dateValidation: serverTimestamp()
    });

    Swal.fire("Éxito", "Traslado validado y stock actualizado", "success");
    detailDiv.style.display = "none";

    loadMyTransfers();
    loadPendingTransfers();
  } catch (error) {
    console.error("Error validating transfer:", error);
    Swal.fire("Error", "Error validando traslado: " + error.message, "error");
  }
}

/***********************************************
 * 9) Mostrar formulario para crear un traslado
 ***********************************************/
async function showTransferForm() {
  document.getElementById("transferForm").reset();
  document.getElementById("transferId").value = "";
  document.getElementById("transferModalLabel").textContent = "Nuevo Traslado";
  selectedProducts = [];
  updateSelectedProductsDisplay();

  await loadProductsGlobal();
  await setOriginStore();

  new bootstrap.Modal(document.getElementById("transferModal")).show();
}

/***************************************************************
 * 10) Editar un traslado (cargar datos en el formulario)
 ***************************************************************/
async function editTransfer(transferId) {
  try {
    const transferRef = doc(db, "traslados", transferId);
    const transferSnap = await getDoc(transferRef);

    if (!transferSnap.exists()) {
      Swal.fire("Error", "Traslado no encontrado", "error");
      return;
    }
    const transfer = transferSnap.data();
    if (transfer.status !== "pendiente") {
      Swal.fire("Error", "Solo traslados pendientes se pueden editar", "error");
      return;
    }

    await loadProductsGlobal();

    document.getElementById("transferId").value = transferId;
    selectedProducts = transfer.products || [];
    updateSelectedProductsDisplay();

    await setOriginStore();
    populateDestinationSelect(transfer.origin);
    document.getElementById("transferDestination").value = transfer.destination;
    document.getElementById("transferComments").value = transfer.comments || "";
    document.getElementById("transferModalLabel").textContent = "Editar Traslado";

    const originElem = document.getElementById("transferOrigin");
    if (originElem && originElem.tagName === "SELECT") {
      originElem.value = transfer.origin;
    } else if (originElem && originElem.tagName === "INPUT") {
      originElem.value = transfer.origin;
    }

    new bootstrap.Modal(document.getElementById("transferModal")).show();
  } catch (error) {
    console.error("Error editing transfer:", error);
    Swal.fire("Error", "Error al editar traslado: " + error.message, "error");
  }
}

/*********************************************************
 * 11) Manejo del submit del formulario (crear/editar)
 *********************************************************/
document.getElementById("transferForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const origin = document.getElementById("transferOrigin")?.value || "";
  const destination = document.getElementById("transferDestination").value;
  const comments = document.getElementById("transferComments").value;

  if (selectedProducts.length === 0 || !origin || !destination) {
    Swal.fire("Error", "Complete todos los campos y agregue al menos un producto.", "error");
    return;
  }
  if (origin === destination) {
    Swal.fire("Error", "La tienda de origen y destino deben ser distintas", "error");
    return;
  }

  const confirmResult = await Swal.fire({
    title: "Confirm Transfer",
    text: "¿Desea guardar este traslado?",
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "Sí, guardar",
    cancelButtonText: "Cancelar"
  });
  if (!confirmResult.isConfirmed) return;

  try {
    for (let item of selectedProducts) {
      const prod = products.find((p) => p.id === item.productId);
      let originStockField;
      if (origin === "Tienda A") originStockField = "stockTiendaA";
      else if (origin === "Tienda B") originStockField = "stockTiendaB";

      if (!prod || prod[originStockField] < item.quantity) {
        Swal.fire("Error", `Stock insuficiente para ${prod ? prod.codigo : item.productId}`, "error");
        return;
      }
    }

    for (let item of selectedProducts) {
      const prod = products.find((p) => p.id === item.productId);
      let originStockField;
      if (origin === "Tienda A") originStockField = "stockTiendaA";
      else if (origin === "Tienda B") originStockField = "stockTiendaB";

      const productRef = doc(db, "productos", item.productId);
      await updateDoc(productRef, {
        [originStockField]: prod[originStockField] - item.quantity
      });
    }

    const pedidoPor = loggedUser || "unknown";
    if (!document.getElementById("transferId").value) {
      await addDoc(collection(db, "traslados"), {
        products: selectedProducts,
        origin,
        destination,
        comments,
        pedidoPor,
        date: serverTimestamp(),
        status: "pendiente"
      });
      Swal.fire("Éxito", "Traslado creado exitosamente", "success");
    } else {
      const transferId = document.getElementById("transferId").value;
      const transferRef = doc(db, "traslados", transferId);
      await updateDoc(transferRef, {
        products: selectedProducts,
        origin,
        destination,
        comments,
        date: serverTimestamp()
      });
      Swal.fire("Éxito", "Traslado actualizado exitosamente", "success");
    }

    bootstrap.Modal.getInstance(document.getElementById("transferModal")).hide();
    selectedProducts = [];
    updateSelectedProductsDisplay();
    loadMyTransfers();
    loadPendingTransfers();
  } catch (error) {
    console.error("Error saving transfer:", error);
    Swal.fire("Error", "Error guardando traslado: " + error.message, "error");
  }
});

/***********************************************
 * 12) setOriginStore (admin => select, no admin => readOnly)
 ***********************************************/
async function setOriginStore() {
  try {
    let userData;
    const qUser = query(
      collection(db, "usuarios"),
      where("username", "==", loggedUser)
    );
    const snapshot = await getDocs(qUser);
    snapshot.forEach((docSnap) => {
      userData = docSnap.data();
    });

    if (!userData) return;

    if (loggedUserRole.toLowerCase() === "admin") {
      let selectHtml = `
        <label for="transferOrigin" class="form-label">Tienda Origen</label>
        <select id="transferOrigin" class="form-select" required>
          <option value="">Seleccione tienda origen</option>
      `;
      allStores.forEach((storeName) => {
        selectHtml += `<option value="${storeName}">${storeName}</option>`;
      });
      selectHtml += "</select>";
      document.getElementById("originStoreContainer").innerHTML = selectHtml;

      const originSelect = document.getElementById("transferOrigin");
      originSelect.addEventListener("change", () => {
        populateDestinationSelect(originSelect.value);
      });
      populateDestinationSelect("");
    } else {
      const originHtml = `
        <label for="transferOrigin" class="form-label">Tienda Origen</label>
        <input type="text" id="transferOrigin" class="form-control" value="${userData.tienda}" readonly />
      `;
      document.getElementById("originStoreContainer").innerHTML = originHtml;
      populateDestinationSelect(userData.tienda);
    }
  } catch (error) {
    console.error("Error setting origin store:", error);
  }
}

/***************************************************
 * 13) Llenar <select> #transferDestination excluyendo Origen
 ***************************************************/
function populateDestinationSelect(originStoreValue) {
  const destSelect = document.getElementById("transferDestination");
  if (!destSelect) return;
  destSelect.innerHTML = `<option value="">Seleccione tienda destino</option>`;

  allStores.forEach((storeName) => {
    if (storeName !== originStoreValue) {
      const option = document.createElement("option");
      option.value = storeName;
      option.textContent = storeName;
      destSelect.appendChild(option);
    }
  });
}

/************************************************
 * 14) Funciones para el Modal de Búsqueda de Productos
 ************************************************/
function openProductSearchModal() {
  document.getElementById("productSearchInput").value = "";
  populateProductSearchTable(products);
  new bootstrap.Modal(document.getElementById("productSearchModal")).show();
}

function populateProductSearchTable(productList) {
  const tbody = document.querySelector("#productSearchTable tbody");
  tbody.innerHTML = "";
  productList.forEach((prod) => {
    const tr = document.createElement("tr");

    const tdCheckbox = document.createElement("td");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = prod.id;
    tdCheckbox.appendChild(checkbox);
    tr.appendChild(tdCheckbox);

    const tdCode = document.createElement("td");
    tdCode.textContent = prod.codigo;
    tr.appendChild(tdCode);

    const tdDesc = document.createElement("td");
    tdDesc.textContent = prod.descripcion;
    tr.appendChild(tdDesc);

    const tdStock = document.createElement("td");
    tdStock.textContent = getStockForProduct(prod);
    tr.appendChild(tdStock);

    tbody.appendChild(tr);
  });
}

document.getElementById("productSearchInput").addEventListener("input", function () {
  const filter = this.value.toLowerCase();
  const filteredProducts = products.filter((prod) =>
    prod.codigo.toLowerCase().includes(filter) ||
    prod.descripcion.toLowerCase().includes(filter)
  );
  populateProductSearchTable(filteredProducts);
});

function addSelectedProducts() {
  const checkboxes = document.querySelectorAll(
    "#productSearchTable tbody input[type='checkbox']"
  );
  checkboxes.forEach((cb) => {
    if (cb.checked) {
      if (!selectedProducts.some((item) => item.productId === cb.value)) {
        selectedProducts.push({ productId: cb.value, quantity: 1 });
      }
    }
  });
  updateSelectedProductsDisplay();
  bootstrap.Modal.getInstance(document.getElementById("productSearchModal")).hide();
}

function updateSelectedProductsDisplay() {
  const container = document.getElementById("selectedProductsContainer");
  container.innerHTML = "";
  selectedProducts.forEach((item, index) => {
    const prod = products.find((p) => p.id === item.productId);
    const div = document.createElement("div");
    div.className = "mb-2";
    div.innerHTML = `
      <strong>${prod ? prod.codigo + " - " + prod.descripcion : item.productId}</strong>
      <input type="number" min="1" value="${item.quantity}" onchange="updateProductQuantity(${index}, this.value)" class="form-control d-inline-block" style="width: 100px; margin-left: 10px;">
      <button type="button" class="btn btn-danger btn-sm" onclick="removeSelectedProduct(${index})">Eliminar</button>
    `;
    container.appendChild(div);
  });
}

function updateProductQuantity(index, value) {
  selectedProducts[index].quantity = parseFloat(value);
}

function removeSelectedProduct(index) {
  selectedProducts.splice(index, 1);
  updateSelectedProductsDisplay();
}

/************************************************
 * 15) INICIALIZACIÓN AL CARGAR LA PÁGINA
 ************************************************/
document.addEventListener("DOMContentLoaded", async () => {
  await loadAllStores();
  await loadProductsGlobal();

  loadMyTransfers();
  loadPendingTransfers();

  if (loggedUserRole.toLowerCase() === "admin") {
    const adminOriginDiv = document.getElementById("adminStoreFilterOrigin");
    const adminDestDiv = document.getElementById("adminStoreFilterDestination");
    if (adminOriginDiv) adminOriginDiv.style.display = "block";
    if (adminDestDiv) adminDestDiv.style.display = "block";

    populateOriginStoreSelect();
    populateDestinationStoreSelect();

    const storeSelectOrigin = document.getElementById("storeSelectOrigin");
    if (storeSelectOrigin) {
      storeSelectOrigin.addEventListener("change", () => {
        loadMyTransfers();
      });
    }
    const storeSelectDestination = document.getElementById("storeSelectDestination");
    if (storeSelectDestination) {
      storeSelectDestination.addEventListener("change", () => {
        loadPendingTransfers();
      });
    }
  }
});

// DEFINIR funciones vacías para deleteTransfer y annulTransfer
function deleteTransfer(id) {
  console.log("deleteTransfer llamado para:", id);
}

function annulTransfer(id) {
  console.log("annulTransfer llamado para:", id);
}

// Exponer funciones al objeto window
window.showTransferForm = showTransferForm;
window.editTransfer = editTransfer;
window.deleteTransfer = deleteTransfer;
window.annulTransfer = annulTransfer;
window.validateTransfer = validateTransfer;
window.showValidationDetail = showValidationDetail;
window.openProductSearchModal = openProductSearchModal;
window.addSelectedProducts = addSelectedProducts;
window.updateSelectedProductsDisplay = updateSelectedProductsDisplay;
window.updateProductQuantity = updateProductQuantity;
window.removeSelectedProduct = removeSelectedProduct;
