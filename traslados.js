// traslados.js
import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  serverTimestamp,
  increment
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

// — Globals —
let allStores = [];
let selectedProducts = [];
let productTable = null;

const loggedUser      = localStorage.getItem("loggedUser")      || "";
const loggedUserRole  = localStorage.getItem("loggedUserRole")  || "";
const loggedUserStore = localStorage.getItem("loggedUserStore") || "";

/** 1) Load all stores */
async function loadAllStores() {
  const snap = await getDocs(query(collection(db, "tiendas"), orderBy("nombre")));
  allStores = snap.docs.map(d => d.data().nombre);
}

/** 2) Populate admin filters */
function populateAdminFilters() {
  if (loggedUserRole.toLowerCase() !== "admin") return;
  const oSel = document.getElementById("storeSelectOrigin");
  const dSel = document.getElementById("storeSelectDestination");
  allStores.forEach(name => {
    const opt = document.createElement("option");
    opt.value = opt.textContent = name;
    oSel.append(opt.cloneNode(true));
    dSel.append(opt.cloneNode(true));
  });
  document.getElementById("adminStoreFilterOrigin").style.display      = "block";
  document.getElementById("adminStoreFilterDestination").style.display = "block";
  oSel.onchange = loadMyTransfers;
  dSel.onchange = loadPendingTransfers;
}

/** 3) Get stock for product in origin */
function getStockForProduct(p) {
  const origin = document.getElementById("transferOrigin")?.value || loggedUserStore;
  return p.stock?.[origin] || 0;
}

/** 4) Load "Mis Traslados" */
async function loadMyTransfers() {
  const ref = collection(db, "traslados");
  let q;
  if (loggedUserRole.toLowerCase() === "admin") {
    const of = document.getElementById("storeSelectOrigin").value;
    q = of
      ? query(ref, where("origin", "==", of), orderBy("date", "desc"))
      : query(ref, orderBy("date", "desc"));
  } else {
    q = query(ref, where("pedidoPor", "==", loggedUser), orderBy("date", "desc"));
  }
  const snap = await getDocs(q);
  const tbody = document.querySelector("#myTransfersTable tbody");
  tbody.innerHTML = "";
  snap.docs.forEach((docSnap, i) => {
    const t = docSnap.data();
    const r = tbody.insertRow();
    r.insertCell().textContent = String(i+1);
    r.insertCell().textContent = t.origin;
    r.insertCell().textContent = t.destination;
    r.insertCell().textContent = t.date?.toDate?.().toLocaleString() || "";
    r.insertCell().textContent = (t.status || "ACTIVO").toUpperCase();
    const ac = r.insertCell();
    ac.innerHTML = t.status === "pendiente"
      ? `
        <button class="btn btn-sm btn-primary me-1" onclick="editTransfer('${docSnap.id}')">Editar</button>
        <button class="btn btn-sm btn-warning me-1" onclick="annulTransfer('${docSnap.id}')">Anular</button>
        <button class="btn btn-sm btn-danger me-1" onclick="deleteTransfer('${docSnap.id}')">Eliminar</button>
        <button class="btn btn-sm btn-success" onclick="downloadConstancia('${docSnap.id}')">Constancia</button>
      `
      : `
        <button class="btn btn-sm btn-info me-1" onclick="showValidationDetail('${docSnap.id}')">Ver</button>
        <button class="btn btn-sm btn-success" onclick="downloadConstancia('${docSnap.id}')">Constancia</button>
      `;
  });
}

/** 5) Load "Pendientes" */
async function loadPendingTransfers() {
  const ref = collection(db, "traslados");
  let q;
  if (loggedUserRole.toLowerCase() === "admin") {
    const dest = document.getElementById("storeSelectDestination").value;
    q = dest
      ? query(ref,
          where("destination", "==", dest),
          where("status", "==", "pendiente"),
          orderBy("date", "desc"))
      : query(ref, where("status","==","pendiente"), orderBy("date","desc"));
  } else {
    q = query(ref,
      where("destination","==",loggedUserStore),
      where("status","==","pendiente"),
      orderBy("date","desc"));
  }
  const snap = await getDocs(q);
  const tbody = document.querySelector("#pendingTransfersTable tbody");
  tbody.innerHTML = "";
  snap.docs.forEach(docSnap => {
    const t = docSnap.data();
    const r = tbody.insertRow();
    const totalQty = (t.products || []).reduce((sum, it) => sum + it.quantity, 0);
    r.insertCell().textContent = docSnap.id.slice(0,6);
    r.insertCell().textContent = t.date?.toDate?.().toLocaleString() || "";
    r.insertCell().textContent = totalQty;
    r.insertCell().textContent = t.pedidoPor || "-";
    r.insertCell().textContent = "—";
    const ac = r.insertCell();
    ac.innerHTML = `
      <button class="btn btn-sm btn-info me-1" onclick="showValidationDetail('${docSnap.id}')">Ver</button>
      <button class="btn btn-sm btn-success" onclick="downloadConstancia('${docSnap.id}')">Constancia</button>
    `;
  });
}

/** 6) Load "Recibidos" */
async function loadReceivedTransfers() {
  const ref = collection(db, "traslados");
  let q;
  if (loggedUserRole.toLowerCase() === "admin") {
    q = query(ref, where("status","==","validado"), orderBy("dateValidation","desc"));
  } else {
    q = query(ref,
      where("destination","==",loggedUserStore),
      where("status","==","validado"),
      orderBy("dateValidation","desc"));
  }
  const snap = await getDocs(q);
  const tbody = document.querySelector("#receivedTransfersTable tbody");
  tbody.innerHTML = "";
  snap.docs.forEach((docSnap, i) => {
    const t = docSnap.data();
    const r = tbody.insertRow();
    r.insertCell().textContent = String(i+1);
    r.insertCell().textContent = t.origin;
    r.insertCell().textContent = t.destination;
    r.insertCell().textContent = t.dateValidation?.toDate?.().toLocaleString() || "";
    const ac = r.insertCell();
    ac.innerHTML = `
      <button class="btn btn-sm btn-info me-1" onclick="showValidationDetail('${docSnap.id}')">Ver</button>
      <button class="btn btn-sm btn-success" onclick="downloadConstancia('${docSnap.id}')">Constancia</button>
    `;
  });
}

/** 7) Show detail modal */
async function showValidationDetail(id) {
  const modalEl = document.getElementById("viewTransferModal");
  modalEl.dataset.id = id;
  const snap = await getDoc(doc(db,"traslados",id));
  if (!snap.exists()) return Swal.fire("Error","No encontrado","error");
  const t = snap.data();
  document.getElementById("detailId").textContent       = id.slice(0,6);
  document.getElementById("detailPedidoPor").textContent = t.sender || "-";
  const tbody = document.getElementById("detailProductsBody");
  tbody.innerHTML = "";
  t.products?.forEach(it => {
    getDoc(doc(db,"productos",it.productId)).then(pSnap => {
      const p = pSnap.data();
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${p.codigo}</td>
        <td>${p.descripcion}</td>
        <td>${p.talla||""}</td>
        <td>${p.color||""}</td>
        <td>${p.precio!=null? p.precio.toFixed(2):""}</td>
        <td>${it.quantity}</td>`;
      tbody.appendChild(tr);
    });
  });
  document.getElementById("validateBtn").style.display =
    t.status === "pendiente" ? "inline-block" : "none";
  new bootstrap.Modal(modalEl).show();
}

/** 8) Validate transfer */
async function validateTransfer() {
  const modalEl = document.getElementById("viewTransferModal");
  const id = modalEl.dataset.id;
  if (!id) return;
  const res = await Swal.fire({
    title: "Confirmar recepción?",
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "Sí"
  });
  if (!res.isConfirmed) return;
  const ref = doc(db,"traslados",id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return Swal.fire("Error","No encontrado","error");
  const t = snap.data();
  for (const it of t.products||[]) {
    const pRef = doc(db,"productos",it.productId);
    await updateDoc(pRef, {
      [`stock.${t.origin}`]:      increment(-it.quantity),
      [`stock.${t.destination}`]: increment(it.quantity)
    });
  }
  await updateDoc(ref, {
    status: "validado",
    dateValidation: serverTimestamp()
  });
  Swal.fire("Éxito","Stock actualizado","success");
  bootstrap.Modal.getInstance(modalEl).hide();
  loadMyTransfers();
  loadPendingTransfers();
  loadReceivedTransfers();
}

/** 9) Show transfer form */
async function showTransferForm() {
  document.getElementById("transferForm").reset();
  selectedProducts = [];
  updateSelectedProductsDisplay();
  await loadAllStores();
  await setOriginStore();
  new bootstrap.Modal(
    document.getElementById("transferModal"),
    { backdrop: 'static', keyboard: false }
  ).show();
}

/** 10) Edit transfer */
async function editTransfer(id) {
  const ref = doc(db,"traslados",id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return Swal.fire("Error","No encontrado","error");
  const t = snap.data();
  if (t.status !== "pendiente") return Swal.fire("Error","Solo pendientes","error");
  selectedProducts = t.products||[];
  updateSelectedProductsDisplay();
  document.getElementById("transferId").value       = id;
  document.getElementById("transferSender").value   = t.sender||"";
  document.getElementById("transferComments").value = t.comments||"";
  document.getElementById("transferModalLabel").textContent = "Editar Traslado";
  await setOriginStore();
  populateDestinationSelect(t.origin);
  document.getElementById("transferDestination").value = t.destination;
  new bootstrap.Modal(
    document.getElementById("transferModal"),
    { backdrop: 'static', keyboard: false }
  ).show();
}

/** 11) Delete transfer */
async function deleteTransfer(id) {
  const r = await Swal.fire({
    title: "¿Eliminar traslado?",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Sí"
  });
  if (!r.isConfirmed) return;
  await deleteDoc(doc(db,"traslados",id));
  Swal.fire("Eliminado","Traslado eliminado","success");
  loadMyTransfers();
}

/** 12) Annul transfer */
async function annulTransfer(id) {
  const r = await Swal.fire({
    title: "¿Anular traslado?",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Sí"
  });
  if (!r.isConfirmed) return;
  await updateDoc(doc(db,"traslados",id), { status: "anulado" });
  Swal.fire("Anulado","Traslado anulado","success");
  loadMyTransfers();
}

/** 13) Save transfer */
document.getElementById("transferForm").addEventListener("submit", async e => {
  e.preventDefault();
  const origin      = document.getElementById("transferOrigin")?.value || "";
  const destination = document.getElementById("transferDestination").value;
  const sender      = document.getElementById("transferSender").value.trim();
  if (!origin || !destination || !sender || !selectedProducts.length) {
    return Swal.fire("Error","Complete todos los campos","error");
  }
  if (origin === destination) {
    return Swal.fire("Error","Origen≠Destino","error");
  }
  const r = await Swal.fire({
    title: "Guardar traslado?",
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "Sí"
  });
  if (!r.isConfirmed) return;

  const data = {
    products: selectedProducts,
    origin,
    destination,
    sender,
    comments: document.getElementById("transferComments").value,
    pedidoPor: loggedUser||"unknown",
    date: serverTimestamp(),
    status: "pendiente"
  };
  const tid = document.getElementById("transferId").value;
  if (!tid) {
    await addDoc(collection(db,"traslados"), data);
    Swal.fire("Éxito","Traslado creado","success");
  } else {
    delete data.status;
    delete data.date;
    await updateDoc(doc(db,"traslados",tid), data);
    Swal.fire("Éxito","Traslado actualizado","success");
  }
  bootstrap.Modal.getInstance(document.getElementById("transferModal")).hide();
  selectedProducts = [];
  updateSelectedProductsDisplay();
  loadMyTransfers();
  loadPendingTransfers();
});

/** 14) Set origin store */
async function setOriginStore() {
  const snapU = await getDocs(query(collection(db,"usuarios"), where("username","==",loggedUser)));
  if (!snapU.empty) {
    const u = snapU.docs[0].data();
    if (loggedUserRole.toLowerCase()==="admin") {
      let html = `
        <div class="col-md-6 mb-3">
          <label class="form-label">Tienda Origen</label>
          <select id="transferOrigin" class="form-select" required>
            <option value="">Seleccione origen</option>`;
      allStores.forEach(n => html += `<option value="${n}">${n}</option>`);
      html += `</select></div>`;
      document.getElementById("originStoreContainer").innerHTML = html;
      document.getElementById("transferOrigin")
        .addEventListener("change", () =>
          populateDestinationSelect(document.getElementById("transferOrigin").value)
        );
      populateDestinationSelect("");
    } else {
      document.getElementById("originStoreContainer").innerHTML = `
        <div class="col-md-6 mb-3">
          <label class="form-label">Tienda Origen</label>
          <input id="transferOrigin" class="form-control" value="${u.tienda}" readonly/>
        </div>`;
      populateDestinationSelect(u.tienda);
    }
  }
}

/** 15) Populate destination */
function populateDestinationSelect(origin) {
  const sel = document.getElementById("transferDestination");
  sel.innerHTML = `<option value="">Seleccione destino</option>`;
  allStores.forEach(n => {
    if (n !== origin) {
      const o = document.createElement("option");
      o.value = o.textContent = n;
      sel.append(o);
    }
  });
}

/** 16) Open product search modal */
function openProductSearchModal() {
  new bootstrap.Modal(document.getElementById("productSearchModal")).show();
}

/** 17) Initialize product search */
document.getElementById("productSearchModal").addEventListener("shown.bs.modal", async () => {
  const snap = await getDocs(query(collection(db,"productos"), orderBy("descripcion")));
  const data = snap.docs.map(d => {
    const p = d.data();
    return {
      id: d.id,
      codigo: p.codigo,
      descripcion: p.descripcion,
      color: p.color||"",
      talla: p.talla||"",
      precio: p.precio!=null? p.precio.toFixed(2):"",
      stock: getStockForProduct(p)
    };
  });
  if (productTable) {
    productTable.clear().destroy();
    $("#productSearchTable tbody").off();
  }
  productTable = $("#productSearchTable").DataTable({
    data, pageLength: 5, lengthChange: false,
    columns: [
      { data:"codigo" }, { data:"descripcion" },
      { data:"color" }, { data:"talla" },
      { data:"precio" },  { data:"stock" },
      { data:null, defaultContent:`<button class="btn btn-sm btn-primary">Agregar</button>`, orderable:false }
    ],
    language: {
      search:"Buscar:",
      paginate:{first:"Primero", previous:"Anterior", next:"Siguiente", last:"Último"},
      info:"Mostrando _START_ a _END_ de _TOTAL_ productos",
      infoEmpty:"Mostrando 0 productos",
      zeroRecords:"No hay productos"
    }
  });
  $("#productSearchTable tbody").on("click","button",function(){
    const row = productTable.row($(this).parents('tr')).data();
    if (selectedProducts.some(x=>x.productId===row.id)) {
      return Swal.fire("Aviso","Producto ya agregado","info");
    }
    selectedProducts.push({productId:row.id,quantity:1});
    updateSelectedProductsDisplay();
    bootstrap.Modal.getInstance(document.getElementById("productSearchModal")).hide();
  });
});

/** 18) Update selected products table */
function updateSelectedProductsDisplay() {
  const tbody = document.querySelector("#selectedProductsTable tbody");
  tbody.innerHTML = "";
  selectedProducts.forEach((it,i) => {
    getDoc(doc(db,"productos",it.productId)).then(snap => {
      const p = snap.data();
      const stock = getStockForProduct(p);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${p.codigo}</td>
        <td>${p.descripcion}</td>
        <td>${p.color||""}</td>
        <td>${p.talla||""}</td>
        <td>${p.precio!=null? p.precio.toFixed(2):""}</td>
        <td>${stock}</td>
        <td>
          <input type="number" min="1" max="${stock}" value="${it.quantity}"
            onchange="updateProductQuantity(${i}, this.value)"
            class="form-control form-control-sm" style="width:80px;"/>
        </td>
        <td>
          <button class="btn btn-sm btn-danger" onclick="removeSelectedProduct(${i})">Eliminar</button>
        </td>`;
      tbody.appendChild(tr);
    });
  });
}

/** 19) Update product quantity */
function updateProductQuantity(idx,val) {
  let q = parseInt(val,10)||1;
  if (q<1) q=1;
  selectedProducts[idx].quantity = q;
}

/** 20) Remove selected product */
function removeSelectedProduct(idx) {
  selectedProducts.splice(idx,1);
  updateSelectedProductsDisplay();
}

/** 21) Download constancia as PDF with table formatting and margins **/
async function downloadConstancia(id) {
  const snap = await getDoc(doc(db,"traslados",id));
  if (!snap.exists()) return Swal.fire("Error","Traslado no encontrado","error");
  const t = snap.data();
  const date = t.dateValidation?.toDate?.() || t.date?.toDate?.() || new Date();

  // Build container with inline styles
  const container = document.createElement("div");
  container.innerHTML = `
    <div style="margin:20pt;">
      <div style="text-align:center;">
        <img src="${document.getElementById("constanciaLogo").src}" style="width:150px;"/>
        <h3>Constancia de Recibido</h3>
      </div>
      <p><strong>Tienda Origen:</strong> ${t.origin}</p>
      <p><strong>Enviado a:</strong> ${t.destination}</p>
      <p><strong>Enviado por:</strong> ${t.sender}</p>
      <p><strong>Fecha de recepción:</strong> ${date.toLocaleString()}</p>
      <p><strong>Estado:</strong> ${t.status.toUpperCase()}</p>
      <table style="border-collapse:collapse; width:100%; margin-top:10px;">
        <thead>
          <tr>
            <th style="border:1px solid #000; padding:5px;">Código</th>
            <th style="border:1px solid #000; padding:5px;">Descripción</th>
            <th style="border:1px solid #000; padding:5px;">Talla</th>
            <th style="border:1px solid #000; padding:5px;">Color</th>
            <th style="border:1px solid #000; padding:5px;">Precio</th>
            <th style="border:1px solid #000; padding:5px;">Cantidad</th>
          </tr>
        </thead>
        <tbody>
          ${await Promise.all(t.products.map(async it => {
            const pSnap = await getDoc(doc(db,"productos",it.productId));
            if (!pSnap.exists()) {
              return `<tr>
                <td style="border:1px solid #000; padding:5px;">--</td>
                <td style="border:1px solid #000; padding:5px;">Producto no encontrado</td>
                <td style="border:1px solid #000; padding:5px;">--</td>
                <td style="border:1px solid #000; padding:5px;">--</td>
                <td style="border:1px solid #000; padding:5px;">--</td>
                <td style="border:1px solid #000; padding:5px;">${it.quantity}</td>
              </tr>`;
            }
            const p = pSnap.data();
            return `<tr>
              <td style="border:1px solid #000; padding:5px;">${p.codigo||"--"}</td>
              <td style="border:1px solid #000; padding:5px;">${p.descripcion||"--"}</td>
              <td style="border:1px solid #000; padding:5px;">${p.talla||"--"}</td>
              <td style="border:1px solid #000; padding:5px;">${p.color||"--"}</td>
              <td style="border:1px solid #000; padding:5px;">${p.precio!=null? p.precio.toFixed(2):"--"}</td>
              <td style="border:1px solid #000; padding:5px;">${it.quantity}</td>
            </tr>`;
          })).then(rows => rows.join(""))}
        </tbody>
      </table>
    </div>`;
  document.body.appendChild(container);

  // Generate PDF (html() respects page-break rules)
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit:"pt", format:"a4" });
  await pdf.html(container, {
    callback: doc => {
      doc.save(`recibido_${id}.pdf`);
      document.body.removeChild(container);
    },
    x: 0,
    y: 0,
    html2canvas: { scale: 0.75 },
    width: pdf.internal.pageSize.getWidth()
  });
}

/** 22) Init */
document.addEventListener("DOMContentLoaded", async () => {
  await loadAllStores();
  populateAdminFilters();
  loadMyTransfers();
  loadPendingTransfers();
  loadReceivedTransfers();
});

// Expose functions for HTML
window.showTransferForm       = showTransferForm;
window.editTransfer           = editTransfer;
window.validateTransfer       = validateTransfer;
window.showValidationDetail   = showValidationDetail;
window.downloadConstancia     = downloadConstancia;
window.openProductSearchModal = openProductSearchModal;
window.updateProductQuantity  = updateProductQuantity;
window.removeSelectedProduct  = removeSelectedProduct;
window.deleteTransfer         = deleteTransfer;
window.annulTransfer          = annulTransfer;
window.loadReceivedTransfers  = loadReceivedTransfers;
