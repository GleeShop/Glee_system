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

// Obtener el rol del usuario desde localStorage
const loggedUserRole = (localStorage.getItem("loggedUserRole") || "").toLowerCase();
const isAdmin = loggedUserRole === "admin";

// Función para cargar y renderizar el historial de cierres
export async function loadHistorialCierre(filterDate = "") {
  try {
    let cierresRef = collection(db, "cierres");
    let q;
    if (filterDate) {
      // Se asume que la fecha se almacena en formato dd/mm/yyyy
      q = query(cierresRef, where("fechaCierre", "==", filterDate));
    } else {
      q = query(cierresRef);
    }
    const snapshot = await getDocs(q);
    const tableBody = document.getElementById("historialCierreBody");
    if (!tableBody) {
      console.error("Elemento 'historialCierreBody' no encontrado en el DOM.");
      return;
    }
    tableBody.innerHTML = "";
    snapshot.forEach(docSnap => {
      const cierre = { id: docSnap.id, ...docSnap.data() };
      
      // Botones de acciones según rol:
      // - Admin: Ver, Anular, Eliminar y Descargar.
      // - Otros: Ver y Descargar.
      let buttonsHtml = `<button class="btn btn-info btn-sm" data-action="ver">Ver</button>`;
      if (isAdmin) {
        buttonsHtml += `<button class="btn btn-warning btn-sm" data-action="anular">Anular</button>
                        <button class="btn btn-danger btn-sm" data-action="eliminar">Eliminar</button>`;
      }
      buttonsHtml += `<button class="btn btn-primary btn-sm" data-action="descargar">Descargar</button>`;
      
      // Construir la fila:
      // Columna 1: Fecha y Hora (concatenados)
      // Columna 2: Usuario (quien realizó el cierre)
      // Columna 3: Venta Total (totalGeneral, con conversión)
      // Columna 4: Monto de Apertura
      // Columna 5: Total Efectivo Sistema
      // Columna 6: Arqueo (montoFinal)
      // Columna 7: Diferencia
      // Columna 8: Acciones
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${cierre.fechaCierre} ${cierre.horaCierre}</td>
        <td>${cierre.usuario || ""}</td>
        <td>Q ${Number(cierre.totalEfectivoSistema || 0).toFixed(2)}</td>
        <td>Q ${Number(cierre.aperturaMonto || 0).toFixed(2)}</td>
        <td>Q ${Number(cierre.totalEfectivoSistema || 0).toFixed(2)}</td>
        <td>Q ${Number(cierre.montoFinal || 0).toFixed(2)}</td>
        <td>Q ${Number(cierre.diferencia || 0).toFixed(2)}</td>
        <td>
          ${buttonsHtml}
        </td>
      `;
      tr.querySelectorAll("button").forEach(btn => {
        btn.addEventListener("click", () => handleAccionCierre(btn.getAttribute("data-action"), cierre));
      });
      tableBody.appendChild(tr);
    });
  } catch (error) {
    console.error("Error cargando el historial de cierres:", error);
  }
}

// Función para manejar las acciones en cada cierre
async function handleAccionCierre(action, cierre) {
  // Para usuarios que no sean admin, se evitan las acciones de anular y eliminar
  if (!isAdmin && (action === "anular" || action === "eliminar")) {
    return;
  }
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
    default:
      break;
  }
}

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
        reporteHtml = docSnap.data().reporte;
      });
      Swal.fire({
        title: "Reporte de Cierre",
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
        reporteHtml = docSnap.data().reporte;
      });
      // Crear un contenedor temporal
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

// Permitir filtrar por fecha. Se espera que el input tenga el id "filtroFecha"
export function filtrarCierres() {
  const filterDate = document.getElementById("filtroFecha").value;
  if (filterDate) {
    const parts = filterDate.split("-");
    const fechaFormateada = `${parts[2]}/${parts[1]}/${parts[0]}`;
    loadHistorialCierre(fechaFormateada);
  } else {
    loadHistorialCierre();
  }
}

// Inicializar la carga del historial al cargar la página
window.addEventListener("DOMContentLoaded", () => {
  loadHistorialCierre();
});
