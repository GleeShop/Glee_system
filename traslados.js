// traslados.js
import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  getDocs,
  updateDoc,
  addDoc,
  query,
  orderBy,
  where,
  serverTimestamp,
  increment
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

// — Globals —
let allStores = [];
let selectedProducts = []; // { productId, quantity }
let productTable = null;

// User info
const loggedUser      = localStorage.getItem("loggedUser")      || "";
const loggedUserRole  = localStorage.getItem("loggedUserRole")  || "";
const loggedUserStore = localStorage.getItem("loggedUserStore") || "";

/** 1) Load all stores */
async function loadAllStores(){
  const snap = await getDocs(query(collection(db, "tiendas"), orderBy("nombre")));
  allStores = snap.docs.map(d => d.data().nombre);
}

/** 2) Populate admin filters */
function populateAdminFilters(){
  if (loggedUserRole.toLowerCase() !== "admin") return;
  const oSel = document.getElementById("storeSelectOrigin");
  const dSel = document.getElementById("storeSelectDestination");
  allStores.forEach(name => {
    let opt = document.createElement("option");
    opt.value = opt.textContent = name;
    oSel.append(opt.cloneNode(true));
    dSel.append(opt.cloneNode(true));
  });
  document.getElementById("adminStoreFilterOrigin").style.display      = "block";
  document.getElementById("adminStoreFilterDestination").style.display = "block";
  oSel.onchange = loadMyTransfers;
  dSel.onchange = loadPendingTransfers;
}

/** 3) Get stock for a product in the selected origin store */
function getStockForProduct(p){
  const origin = document.getElementById("transferOrigin")?.value || loggedUserStore;
  if (!origin || !p.stock || typeof p.stock !== "object") return 0;
  return p.stock[origin] || 0;
}

/** 4) Load "My Transfers" table */
async function loadMyTransfers(){
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
  snap.forEach(docSnap => {
    const t = docSnap.data();
    const r = tbody.insertRow();
    r.insertCell().textContent = docSnap.id.slice(0,6);
    let ph="", qh="";
    (t.products||[]).forEach(it => {
      ph += it.productId + "<br>";
      qh += it.quantity  + "<br>";
    });
    r.insertCell().innerHTML = ph;
    r.insertCell().innerHTML = qh;
    r.insertCell().textContent = t.origin;
    r.insertCell().textContent = t.destination;
    r.insertCell().textContent = t.date?.toDate?.().toLocaleString() || "";
    r.insertCell().textContent = (t.status||"ACTIVO").toUpperCase();
    const ac = r.insertCell();
    if (t.status === "pendiente") {
      ac.innerHTML = `
        <button class="btn btn-sm btn-primary me-1" onclick="editTransfer('${docSnap.id}')">Editar</button>
        <button class="btn btn-sm btn-warning me-1" onclick="annulTransfer('${docSnap.id}')">Anular</button>
        <button class="btn btn-sm btn-danger" onclick="deleteTransfer('${docSnap.id}')">Eliminar</button>`;
    } else {
      ac.textContent = "-";
    }
  });
}

/** 5) Load "Pending Transfers" table */
async function loadPendingTransfers(){
  const ref = collection(db, "traslados");
  let q;
  if (loggedUserRole.toLowerCase() === "admin") {
    const dest = document.getElementById("storeSelectDestination").value;
    q = dest
      ? query(ref,
          where("destination","==",dest),
          where("status","==","pendiente"),
          orderBy("date","desc"))
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
  snap.forEach(docSnap => {
    const t = docSnap.data();
    const r = tbody.insertRow();
    r.insertCell().textContent = docSnap.id.slice(0,6);
    r.insertCell().textContent = t.date?.toDate?.().toLocaleString() || "";
    let ph="", qh="";
    (t.products||[]).forEach(it => {
      ph += it.productId + "<br>";
      qh += it.quantity  + "<br>";
    });
    r.insertCell().innerHTML = ph;
    r.insertCell().innerHTML = qh;
    r.insertCell().textContent = t.pedidoPor||"-";
    r.insertCell().textContent = "—";
    const ac = r.insertCell();
    ac.innerHTML = `<button class="btn btn-sm btn-info" onclick="showValidationDetail('${docSnap.id}')">Ver</button>`;
  });
}

/** 6) Show validation detail: fills the detail card and product table */
async function showValidationDetail(id){
  // Fetch traslado data
  const snap = await getDocs(query(collection(db,"traslados"), where("__name__","==",id)));
  const t = snap.docs[0].data();

  // Fill metadata
  document.getElementById("detailId").textContent       = id.slice(0,6);
  document.getElementById("detailPedidoPor").textContent = t.pedidoPor||"-";

  // Fill products table
  const tbody = document.getElementById("detailProductsBody");
  tbody.innerHTML = "";
  for (const it of t.products) {
    const pSnap = await getDocs(query(collection(db,"productos"), where("__name__","==",it.productId)));
    const p = pSnap.docs[0].data();
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.codigo}</td>
      <td>${p.descripcion}</td>
      <td>${it.quantity}</td>
    `;
    tbody.appendChild(tr);
  }

  // Show detail card
  document.getElementById("transferDetail").style.display = "block";
}

/** 7) Validate transfer: subtract origin & add destination */
async function validateTransfer(){
  const detail = document.getElementById("transferDetail");
  const tid    = detail.dataset.id;
  if (!tid) return;
  const res = await Swal.fire({
    title: "Confirmar recepción?",
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "Sí"
  });
  if (!res.isConfirmed) return;

  // Fetch traslado
  const snap = await getDocs(query(collection(db,"traslados"), where("__name__","==",tid)));
  const t    = snap.docs[0].data();
  const { origin, destination, products } = t;

  // Update stocks
  for (const it of products) {
    const prodRef = doc(db,"productos",it.productId);
    await updateDoc(prodRef, {
      [`stock.${origin}`]:      increment(-it.quantity),
      [`stock.${destination}`]: increment(it.quantity)
    });
  }

  // Mark validated
  const tRef = doc(db,"traslados",tid);
  await updateDoc(tRef, {
    status: "validado",
    dateValidation: serverTimestamp()
  });

  Swal.fire("Éxito","Stock actualizado","success");
  detail.style.display = "none";
  loadMyTransfers();
  loadPendingTransfers();
}

/** 8) Show Transfer Form */
async function showTransferForm(){
  document.getElementById("transferForm").reset();
  document.getElementById("transferId").value = "";
  selectedProducts = [];
  updateSelectedProductsDisplay();
  await loadAllStores();
  await setOriginStore();
  new bootstrap.Modal(document.getElementById("transferModal")).show();
}

/** 9) Edit Transfer */
async function editTransfer(id){
  const snap = await getDocs(query(collection(db,"traslados"), where("__name__","==",id)));
  const t    = snap.docs[0].data();
  if (t.status !== "pendiente") {
    return Swal.fire("Error","Solo pendientes","error");
  }
  selectedProducts = t.products||[];
  updateSelectedProductsDisplay();
  document.getElementById("transferId").value           = id;
  document.getElementById("transferComments").value     = t.comments||"";
  document.getElementById("transferModalLabel").textContent = "Editar Traslado";
  await setOriginStore();
  populateDestinationSelect(t.origin);
  document.getElementById("transferDestination").value   = t.destination;
  new bootstrap.Modal(document.getElementById("transferModal")).show();
}

/** 10) Save Transfer (create/update without stock changes) */
document.getElementById("transferForm").addEventListener("submit", async e => {
  e.preventDefault();
  const origin = document.getElementById("transferOrigin")?.value || "";
  const dest   = document.getElementById("transferDestination").value;
  const comm   = document.getElementById("transferComments").value;
  if (!origin || !dest || !selectedProducts.length) {
    return Swal.fire("Error","Complete todos los campos","error");
  }
  if (origin === dest) {
    return Swal.fire("Error","Origen≠Destino","error");
  }
  const r = await Swal.fire({
    title: "Guardar traslado?",
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "Sí"
  });
  if (!r.isConfirmed) return;

  const pedidoPor = loggedUser||"unknown";
  const tid       = document.getElementById("transferId").value;
  if (!tid) {
    await addDoc(collection(db,"traslados"), {
      products: selectedProducts,
      origin,
      destination: dest,
      comments: comm,
      pedidoPor,
      date: serverTimestamp(),
      status: "pendiente"
    });
    Swal.fire("Éxito","Traslado creado","success");
  } else {
    const tRef = doc(db,"traslados",tid);
    await updateDoc(tRef, {
      products: selectedProducts,
      origin,
      destination: dest,
      comments: comm,
      date: serverTimestamp()
    });
    Swal.fire("Éxito","Traslado actualizado","success");
  }

  bootstrap.Modal.getInstance(document.getElementById("transferModal")).hide();
  selectedProducts = [];
  updateSelectedProductsDisplay();
  loadMyTransfers();
  loadPendingTransfers();
});

/** 11) Set Origin Store */
async function setOriginStore(){
  const snapU = await getDocs(query(collection(db,"usuarios"), where("username","==",loggedUser)));
  const u     = snapU.docs[0].data();
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
      .addEventListener("change", () => populateDestinationSelect(document.getElementById("transferOrigin").value));
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

/** 12) Populate Destination select */
function populateDestinationSelect(origin){
  const sel = document.getElementById("transferDestination");
  sel.innerHTML = `<option value="">Seleccione destino</option>`;
  allStores.forEach(n => {
    if (n !== origin) {
      let o = document.createElement("option");
      o.value = o.textContent = n;
      sel.append(o);
    }
  });
}

/** 13) Open Product Search Modal & init DataTable */
async function openProductSearchModal(){
  const modalEl = document.getElementById("productSearchModal");
  new bootstrap.Modal(modalEl).show();

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
    data,
    columns: [
      { data: "codigo" },
      { data: "descripcion" },
      { data: "color" },
      { data: "talla" },
      { data: "precio" },
      { data: "stock" },
      {
        data: null,
        defaultContent: `<button class="btn btn-sm btn-primary">Agregar</button>`,
        orderable: false
      }
    ],
    pageLength: 5,
    lengthChange: false,
    language: {
      search: "Buscar:",
      paginate: { first:"Primero", previous:"Anterior", next:"Siguiente", last:"Último" },
      info: "Mostrando _START_ a _END_ de _TOTAL_ productos",
      infoEmpty: "Mostrando 0 productos",
      zeroRecords: "No hay productos"
    }
  });

  $("#productSearchTable tbody").on("click", "button", function(){
    const rowData = productTable.row($(this).parents('tr')).data();
    if (selectedProducts.some(x => x.productId === rowData.id)) {
      return Swal.fire("Aviso","Producto ya agregado","info");
    }
    selectedProducts.push({ productId: rowData.id, quantity: 1 });
    updateSelectedProductsDisplay();
    bootstrap.Modal.getInstance(modalEl).hide();
  });
}

/** 14) Update selected products display */
function updateSelectedProductsDisplay(){
  const tbody = document.querySelector("#selectedProductsTable tbody");
  tbody.innerHTML = "";
  selectedProducts.forEach((it, i) => {
    getDocs(query(collection(db,"productos"), where("__name__","==",it.productId)))
      .then(snap => {
        const p = snap.docs[0].data();
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
            <button class="btn btn-sm btn-danger" onclick="removeSelectedProduct(${i})">
              Eliminar
            </button>
          </td>`;
        tbody.append(tr);
      });
  });
}

/** 15) Update quantity for selected product */
function updateProductQuantity(idx, val){
  let q = parseInt(val,10) || 1;
  if (q < 1) q = 1;
  selectedProducts[idx].quantity = q;
}

/** 16) Remove a selected product */
function removeSelectedProduct(idx){
  selectedProducts.splice(idx,1);
  updateSelectedProductsDisplay();
}

/** 17) Dummy delete/anul */
function deleteTransfer(id){ console.log("delete",id); }
function annulTransfer(id){ console.log("annul",id); }

/** 18) Init on load */
document.addEventListener("DOMContentLoaded", async ()=>{
  await loadAllStores();
  populateAdminFilters();
  loadMyTransfers();
  loadPendingTransfers();
});

// Expose globals for HTML onclicks
window.showTransferForm       = showTransferForm;
window.editTransfer           = editTransfer;
window.validateTransfer       = validateTransfer;
window.showValidationDetail   = showValidationDetail;
window.openProductSearchModal = openProductSearchModal;
window.updateProductQuantity  = updateProductQuantity;
window.removeSelectedProduct  = removeSelectedProduct;
window.deleteTransfer         = deleteTransfer;
window.annulTransfer          = annulTransfer;
