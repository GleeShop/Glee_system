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
  const snap = await getDocs(query(collection(db,"tiendas"), orderBy("nombre")));
  allStores = snap.docs.map(d=>d.data().nombre);
}

/** 2) Populate admin filters */
function populateAdminFilters(){
  if(loggedUserRole.toLowerCase() !== "admin") return;
  const oSel = document.getElementById("storeSelectOrigin");
  const dSel = document.getElementById("storeSelectDestination");
  allStores.forEach(n=>{
    let o = document.createElement("option");
    o.value = o.textContent = n;
    oSel.append(o.cloneNode(true));
    dSel.append(o.cloneNode(true));
  });
  document.getElementById("adminStoreFilterOrigin").style.display = "block";
  document.getElementById("adminStoreFilterDestination").style.display = "block";
  oSel.onchange = loadMyTransfers;
  dSel.onchange = loadPendingTransfers;
}

/** 3) Get stock for product in origin store */
function getStockForProduct(p){
  const origin = document.getElementById("transferOrigin")?.value || loggedUserStore;
  const field = origin==="Tienda A" ? "stockTiendaA" : origin==="Tienda B"? "stockTiendaB":null;
  return field && p[field]!=null ? p[field] : 0;
}

/** 4) Load My Transfers */
async function loadMyTransfers(){
  const ref = collection(db,"traslados");
  let q;
  if(loggedUserRole.toLowerCase()==="admin"){
    const of = document.getElementById("storeSelectOrigin").value;
    q = of
      ? query(ref, where("origin","==",of), orderBy("date","desc"))
      : query(ref, orderBy("date","desc"));
  } else {
    q = query(ref, where("pedidoPor","==",loggedUser), orderBy("date","desc"));
  }
  const snap = await getDocs(q);
  const tbody = document.querySelector("#myTransfersTable tbody");
  tbody.innerHTML="";
  snap.forEach(docSnap=>{
    const t=docSnap.data();
    const r=tbody.insertRow();
    r.insertCell().textContent=docSnap.id.slice(0,6);
    let ph="",qh="";
    (t.products||[]).forEach(it=>{ph+=it.productId+"<br>";qh+=it.quantity+"<br>";});
    r.insertCell().innerHTML=ph;
    r.insertCell().innerHTML=qh;
    r.insertCell().textContent=t.origin;
    r.insertCell().textContent=t.destination;
    r.insertCell().textContent=t.date?.toDate?.().toLocaleString()||"";
    r.insertCell().textContent=(t.status||"ACTIVO").toUpperCase();
    const a=r.insertCell();
    if(t.status==="pendiente"){
      a.innerHTML=`
        <button class="btn btn-sm btn-primary me-1" onclick="editTransfer('${docSnap.id}')">Editar</button>
        <button class="btn btn-sm btn-warning me-1" onclick="annulTransfer('${docSnap.id}')">Anular</button>
        <button class="btn btn-sm btn-danger" onclick="deleteTransfer('${docSnap.id}')">Eliminar</button>`;
    }else a.textContent="-";
  });
}

/** 5) Load Pending Transfers */
async function loadPendingTransfers(){
  const ref = collection(db,"traslados");
  let q;
  if(loggedUserRole.toLowerCase()==="admin"){
    const df = document.getElementById("storeSelectDestination").value;
    q = df
      ? query(ref, where("destination","==",df), where("status","==","pendiente"), orderBy("date","desc"))
      : query(ref, where("status","==","pendiente"), orderBy("date","desc"));
  } else {
    q = query(ref,
      where("destination","==",loggedUserStore),
      where("status","==","pendiente"),
      orderBy("date","desc"));
  }
  const snap = await getDocs(q);
  const tbody = document.querySelector("#pendingTransfersTable tbody");
  tbody.innerHTML="";
  snap.forEach(docSnap=>{
    const t=docSnap.data();
    const r=tbody.insertRow();
    r.insertCell().textContent=docSnap.id.slice(0,6);
    r.insertCell().textContent=t.date?.toDate?.().toLocaleString()||"";
    let ph="",qh="";
    (t.products||[]).forEach(it=>{ph+=it.productId+"<br>";qh+=it.quantity+"<br>";});
    r.insertCell().innerHTML=ph;
    r.insertCell().innerHTML=qh;
    r.insertCell().textContent=t.pedidoPor||"-";
    r.insertCell().textContent="—";
    const a=r.insertCell();
    a.innerHTML=`<button class="btn btn-sm btn-info" onclick="showValidationDetail('${docSnap.id}')">Ver</button>`;
  });
}

/** 6) Show validation detail */
function showValidationDetail(id){
  const d=document.getElementById("transferDetail");
  d.dataset.id=id;
  d.style.display="block";
}

/** 7) Validate transfer */
async function validateTransfer(){
  const d=document.getElementById("transferDetail");
  const tid=d.dataset.id;
  if(!tid) return;
  const res=await Swal.fire({
    title:"Confirmar recepción?",
    icon:"question",
    showCancelButton:true,
    confirmButtonText:"Sí"
  });
  if(!res.isConfirmed) return;

  const refT=doc(db,"traslados",tid);
  const snap=await getDocs(query(collection(db,"traslados"), where("__name__","==",tid)));
  const t=snap.docs[0].data();
  const prodRef=doc(db,"productos",t.products[0].productId);
  const f=t.destination==="Tienda A"?"stockTiendaA":"stockTiendaB";
  await updateDoc(prodRef,{ [f]:increment(t.products[0].quantity) });
  await updateDoc(refT,{ status:"validado", dateValidation: serverTimestamp() });
  Swal.fire("Éxito","Validado","success");
  d.style.display="none";
  loadMyTransfers();
  loadPendingTransfers();
}

/** 8) Show Transfer Form */
async function showTransferForm(){
  document.getElementById("transferForm").reset();
  document.getElementById("transferId").value="";
  selectedProducts=[];
  updateSelectedProductsDisplay();
  await loadAllStores();
  await setOriginStore();
  new bootstrap.Modal(document.getElementById("transferModal")).show();
}

/** 9) Edit Transfer */
async function editTransfer(id){
  const snap=await getDocs(query(collection(db,"traslados"), where("__name__","==",id)));
  const t=snap.docs[0].data();
  if(t.status!=="pendiente"){
    return Swal.fire("Error","Solo pendientes","error");
  }
  selectedProducts=t.products||[];
  updateSelectedProductsDisplay();
  document.getElementById("transferId").value=id;
  document.getElementById("transferComments").value=t.comments||"";
  document.getElementById("transferModalLabel").textContent="Editar Traslado";
  await setOriginStore();
  populateDestinationSelect(t.origin);
  document.getElementById("transferDestination").value=t.destination;
  new bootstrap.Modal(document.getElementById("transferModal")).show();
}

/** 10) Save Transfer */
document.getElementById("transferForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const origin=document.getElementById("transferOrigin")?.value||"";
  const dest=document.getElementById("transferDestination").value;
  const comm=document.getElementById("transferComments").value;
  if(!origin||!dest||!selectedProducts.length){
    return Swal.fire("Error","Complete todos los campos","error");
  }
  if(origin===dest){
    return Swal.fire("Error","Origen≠Destino","error");
  }
  const r=await Swal.fire({
    title:"Guardar traslado?",
    icon:"question",
    showCancelButton:true,
    confirmButtonText:"Sí"
  });
  if(!r.isConfirmed) return;

  // descontar stock
  for(const it of selectedProducts){
    const pSnap=await getDocs(query(collection(db,"productos"), where("__name__","==",it.productId)));
    const p=pSnap.docs[0].data();
    const f=origin==="Tienda A"?"stockTiendaA":"stockTiendaB";
    if(p[f]<it.quantity){
      return Swal.fire("Error",`Insuficiente ${p.codigo}`,"error");
    }
  }
  for(const it of selectedProducts){
    const pRef=doc(db,"productos",it.productId);
    const pSnap=await getDocs(query(collection(db,"productos"), where("__name__","==",it.productId)));
    const p=pSnap.docs[0].data();
    const f=origin==="Tienda A"?"stockTiendaA":"stockTiendaB";
    await updateDoc(pRef,{ [f]:p[f]-it.quantity });
  }

  const pedidoPor=loggedUser||"unknown";
  const tid=document.getElementById("transferId").value;
  if(!tid){
    await addDoc(collection(db,"traslados"),{
      products:selectedProducts, origin, destination:dest,
      comments:comm, pedidoPor, date: serverTimestamp(),
      status:"pendiente"
    });
    Swal.fire("Éxito","Creado","success");
  } else {
    const tRef=doc(db,"traslados",tid);
    await updateDoc(tRef,{
      products:selectedProducts, origin, destination:dest,
      comments:comm, date: serverTimestamp()
    });
    Swal.fire("Éxito","Actualizado","success");
  }
  bootstrap.Modal.getInstance(document.getElementById("transferModal")).hide();
  selectedProducts=[];
  updateSelectedProductsDisplay();
  loadMyTransfers();
  loadPendingTransfers();
});

/** 11) Set Origin Store */
async function setOriginStore(){
  const snapU=await getDocs(query(collection(db,"usuarios"), where("username","==",loggedUser)));
  const u=snapU.docs[0].data();
  if(loggedUserRole.toLowerCase()==="admin"){
    let html=`
      <div class="col-md-6 mb-3">
        <label class="form-label">Tienda Origen</label>
        <select id="transferOrigin" class="form-select" required>
          <option value="">Seleccione origen</option>`;
    allStores.forEach(n=> html+=`<option value="${n}">${n}</option>`);
    html+=`</select></div>`;
    document.getElementById("originStoreContainer").innerHTML=html;
    document.getElementById("transferOrigin")
      .addEventListener("change",()=>populateDestinationSelect(document.getElementById("transferOrigin").value));
    populateDestinationSelect("");
  } else {
    document.getElementById("originStoreContainer").innerHTML=`
      <div class="col-md-6 mb-3">
        <label class="form-label">Tienda Origen</label>
        <input id="transferOrigin" class="form-control" value="${u.tienda}" readonly/>
      </div>`;
    populateDestinationSelect(u.tienda);
  }
}

/** 12) Populate Destination */
function populateDestinationSelect(origin){
  const sel=document.getElementById("transferDestination");
  sel.innerHTML=`<option value="">Seleccione destino</option>`;
  allStores.forEach(n=>{
    if(n!==origin){
      const o=document.createElement("option");
      o.value=o.textContent=n;
      sel.append(o);
    }
  });
}

/** 13) Open Search Modal + initialize DataTable */
async function openProductSearchModal(){
  const modalEl=document.getElementById("productSearchModal");
  new bootstrap.Modal(modalEl).show();

  // Fetch all products once
  const snap=await getDocs(query(collection(db,"productos"), orderBy("descripcion")));
  const data=snap.docs.map(d=>{
    const p=d.data();
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

  // Destroy existing table if present
  if(productTable) {
    productTable.clear().destroy();
    $("#productSearchTable tbody").off();
  }

  productTable = $("#productSearchTable").DataTable({
    data,
    columns:[
      { data:"codigo" },
      { data:"descripcion" },
      { data:"color" },
      { data:"talla" },
      { data:"precio" },
      { data:"stock" },
      {
        data:null,
        defaultContent:`<button class="btn btn-sm btn-primary">Agregar</button>`,
        orderable:false
      }
    ],
    pageLength: 5,
    lengthChange: false,
    language:{
      search: "Buscar:",
      paginate: {
        first:      "Primero",
        previous:   "Anterior",
        next:       "Siguiente",
        last:       "Último"
      },
      info: "Mostrando _START_ a _END_ de _TOTAL_ productos",
      infoEmpty: "Mostrando 0 productos",
      zeroRecords: "No hay productos"
    }
  });

  // Handle Agregar clicks
  $("#productSearchTable tbody").on("click", "button", function(){
    const rowData = productTable.row($(this).parents('tr')).data();
    if(selectedProducts.some(x=>x.productId===rowData.id)){
      return Swal.fire("Aviso","Producto ya agregado","info");
    }
    selectedProducts.push({ productId: rowData.id, quantity:1 });
    updateSelectedProductsDisplay();
    bootstrap.Modal.getInstance(modalEl).hide();
  });
}

/** 14) Update selected products table */
function updateSelectedProductsDisplay(){
  const tbody=document.querySelector("#selectedProductsTable tbody");
  tbody.innerHTML="";
  selectedProducts.forEach((it,i)=>{
    getDocs(query(collection(db,"productos"), where("__name__","==",it.productId)))
      .then(snap=>{
        const p=snap.docs[0].data();
        const stock=getStockForProduct(p);
        const tr=document.createElement("tr");
        tr.innerHTML=`
          <td>${p.codigo}</td>
          <td>${p.descripcion}</td>
          <td>${p.color||""}</td>
          <td>${p.talla||""}</td>
          <td>${p.precio!=null? p.precio.toFixed(2):""}</td>
          <td>
            <input type="number" min="1" max="${stock}" value="${it.quantity}"
              onchange="updateProductQuantity(${i}, this.value)"
              class="form-control form-control-sm" style="width:80px;"/>
          </td>
          <td>
            <button class="btn btn-sm btn-danger"
              onclick="removeSelectedProduct(${i})">
              Eliminar
            </button>
          </td>`;
        tbody.append(tr);
      });
  });
}

/** 15) Update quantity */
function updateProductQuantity(idx,val){
  let q=parseInt(val,10)||1;
  if(q<1) q=1;
  selectedProducts[idx].quantity=q;
}

/** 16) Remove product */
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

// Expose globals
window.showTransferForm       = showTransferForm;
window.editTransfer           = editTransfer;
window.validateTransfer       = validateTransfer;
window.showValidationDetail   = showValidationDetail;
window.openProductSearchModal = openProductSearchModal;
window.updateProductQuantity  = updateProductQuantity;
window.removeSelectedProduct  = removeSelectedProduct;
window.deleteTransfer         = deleteTransfer;
window.annulTransfer          = annulTransfer;
