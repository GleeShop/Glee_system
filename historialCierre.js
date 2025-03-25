import { db } from "./firebase-config.js";
import {
  collection,
  orderBy,
  query,
  where,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  limit
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

let dtInstance;
const loggedUserRole = (localStorage.getItem("loggedUserRole") || "").toLowerCase();
const loggedUser = localStorage.getItem("loggedUser") || "";
const isAdmin = loggedUserRole === "admin";

function convertirFecha(inputDate) {
  const parts = inputDate.split("-");
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export async function loadHistorialCierre(filterDate = "") {
  try {
    let cierresRef = collection(db, "cierres");
    let conditions = [];

    if (filterDate) {
      conditions.push(where("fechaCierre", "==", filterDate));
    }

    if (!isAdmin) {
      conditions.push(where("usuario", "==", loggedUser));
    }

    const q = conditions.length > 0 ? query(cierresRef, ...conditions) : query(cierresRef);

    const snapshot = await getDocs(q);
    const tableBody = document.getElementById("historialCierreBody");
    if (!tableBody) {
      console.error("Elemento 'historialCierreBody' no encontrado en el DOM.");
      return;
    }
    tableBody.innerHTML = "";

    snapshot.forEach(docSnap => {
      const cierre = { id: docSnap.id, ...docSnap.data() };
      const tr = document.createElement("tr");

      let buttonsHtml = `<button class="btn btn-info btn-sm" data-action="ver">Ver</button>`;
      if (isAdmin) {
        buttonsHtml += `<button class="btn btn-warning btn-sm" data-action="anular">Anular</button>
                        <button class="btn btn-danger btn-sm" data-action="eliminar">Eliminar</button>`;
      }
      buttonsHtml += `<button class="btn btn-primary btn-sm" data-action="descargar">Descargar</button>`;

      tr.innerHTML = `
        <td>${cierre.fechaCierre} ${cierre.horaCierre}</td>
        <td>${cierre.usuario || "Sin usuario"}</td>
        <td>Q ${Number(cierre.totalVentasDetalle || 0).toFixed(2)}</td>
        <td>Q ${Number(cierre.montoApertura || 0).toFixed(2)}</td>
        <td>Q ${Number(cierre.totalEfectivoSistema || 0).toFixed(2)}</td>
        <td>Q ${Number(cierre.totalIngresado || 0).toFixed(2)}</td>
        <td>Q ${Number(cierre.diferencia || 0).toFixed(2)}</td>
        <td>${buttonsHtml}</td>
      `;

      tr.querySelectorAll("button").forEach(btn => {
        btn.addEventListener("click", () => handleAccionCierre(btn.getAttribute("data-action"), cierre));
      });

      tableBody.appendChild(tr);
    });

    if ($.fn.DataTable.isDataTable("#tablaCierres")) {
      $("#tablaCierres").DataTable().destroy();
    }

    dtInstance = $("#tablaCierres").DataTable({
      pageLength: 5,
      lengthMenu: [[5, 10, 25, 30], [5, 10, 25, 30]],
      language: {
        search: "Buscar:",
        lengthMenu: "Mostrar _MENU_ registros",
        zeroRecords: "No se encontraron resultados",
        info: "Mostrando página _PAGE_ de _PAGES_",
        infoEmpty: "No hay registros disponibles",
        infoFiltered: "(filtrado de _MAX_ registros totales)"
      }
    });

  } catch (error) {
    console.error("Error cargando el historial de cierres:", error);
  }
}

$.fn.dataTable.ext.search.push(function (settings, data) {
  const filtroFecha = $("#filtroFecha").val();
  const registroFechaHora = data[0] || "";
  if (!filtroFecha) return true;

  const fechaFiltro = convertirFecha(filtroFecha);
  const fechaRegistro = registroFechaHora.substring(0, 10);
  return fechaRegistro === fechaFiltro;
});

$(document).on("change", "#filtroFecha", function () {
  if (dtInstance) dtInstance.draw();
});

async function handleAccionCierre(action, cierre) {
  if (!isAdmin && (action === "anular" || action === "eliminar")) return;

  switch (action) {
    case "ver":
      verReporteCierre(cierre);
      break;
    case "anular":
      if (confirm("¿Estás seguro de anular este cierre?")) {
        await updateDoc(doc(db, "cierres", cierre.id), { anulado: true });
        alert("Cierre anulado");
        loadHistorialCierre();
      }
      break;
    case "eliminar":
      if (confirm("¿Estás seguro de eliminar este cierre? Esta acción no se puede deshacer.")) {
        await deleteDoc(doc(db, "cierres", cierre.id));
        alert("Cierre eliminado");
        loadHistorialCierre();
      }
      break;
    case "descargar":
      descargarReporteCierreHistorial(cierre);
      break;
  }
}

export function filtrarCierres() {
  const filterDate = document.getElementById("filtroFecha").value;
  if (filterDate) loadHistorialCierre(convertirFecha(filterDate));
  else loadHistorialCierre();
}

window.addEventListener("DOMContentLoaded", () => {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById("filtroFecha").value = today;
  loadHistorialCierre();
});


// Función para ver el reporte del cierre (se asume que se almacenó en la colección "reportescierre")
async function verReporteCierre(cierre) {
  try {
    const reportesRef = collection(db, "reportescierre");
    const q = query(
      reportesRef,
      where("idCierre", "==", cierre.idhistorialCierre),
      orderBy("createdAt", "desc"),
      limit(1)
    );
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      let reporteHtml = "";
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        reporteHtml = data.reporte;
      });
      Swal.fire({
        title: " ",
        html: reporteHtml,
        width: "80%"
      });
    } else {
      Swal.fire("No se encontró reporte para este cierre", "", "warning");
    }
  } catch (error) {
    console.error("Error al ver el reporte:", error);
  }
}

// Función para descargar el reporte del cierre como PNG usando html2canvas
async function descargarReporteCierreHistorial(cierre) {
  try {
    const reportesRef = collection(db, "reportescierre");
    const q = query(reportesRef, where("idCierre", "==", cierre.idhistorialCierre));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      let reporteHtml = "";
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        reporteHtml = data.reporte;
      });
      let container = document.createElement("div");
      container.innerHTML = reporteHtml;
      container.style.position = "absolute";
      container.style.left = "-9999px";
      document.body.appendChild(container);
      html2canvas(container).then(canvas => {
        let dataURL = canvas.toDataURL("image/png");
        let a = document.createElement("a");
        a.href = dataURL;
        a.download = `reporte-cierre-${cierre.idhistorialCierre}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        document.body.removeChild(container);
      });
    } else {
      alert("No se encontró reporte para descargar.");
    }
  } catch (error) {
    console.error("Error al descargar el reporte:", error);
  }
}


