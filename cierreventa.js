// cierreventa.js - Cierre de Caja y Reporte de Ventas
import { db } from "./firebase-config.js";
import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  addDoc,
  orderBy,
  limit
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

import { formatDate, parseDate } from "./ventas.js";

export async function getNextHistorialCierre() {
  try {
    const cierresRef = collection(db, "cierres");
    const q = query(cierresRef, orderBy("idhistorialCierre", "desc"), limit(1));
    const snapshot = await getDocs(q);
    let nextId = 1;
    if (!snapshot.empty) {
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        nextId = parseInt(data.idhistorialCierre) + 1;
      });
    }
    return nextId;
  } catch (error) {
    console.error("Error al obtener el próximo idhistorialCierre:", error);
    return Math.floor(Math.random() * 90000) + 10000;
  }
}

export async function cerrarCaja() {
  if (!window.cajaAbierta || !window.idAperturaActivo) {
    Swal.fire("Error", "Debes abrir la caja antes de cerrar.", "warning");
    return;
  }

  let fechaHoy = formatDate(new Date());
  const { value: montoFinal } = await Swal.fire({
    title: "Cerrar Caja",
    html: `<p>Fecha de cierre: ${fechaHoy}</p>
           <input type="number" id="montoFinal" class="swal2-input" placeholder="Monto final en caja (Q)">`,
    preConfirm: () => {
      const inputVal = document.getElementById("montoFinal").value;
      const mf = parseFloat(inputVal);
      if (isNaN(mf)) {
        Swal.showValidationMessage("Monto final inválido");
      }
      return mf;
    }
  });

  if (montoFinal === undefined || isNaN(montoFinal)) return;

  // Consultar las ventas asociadas a la apertura activa
  const ventasQuery = query(
    collection(db, "ventas"),
    where("idApertura", "==", window.idAperturaActivo)
  );
  const ventasSnapshot = await getDocs(ventasQuery);
  
  let totalEfectivo = 0,
      totalTarjeta = 0,
      totalTransferencia = 0,
      envios = 0,        // Pendiente de usar si luego manejas "envíos"
      ventaLinea = 0;    // Para reflejar "en línea" en el reporte

  let ventasDetalle = [];

  ventasSnapshot.forEach(docSnap => {
    let venta = docSnap.data();
    ventasDetalle.push(venta);

    const metodo = (venta.metodo_pago || "").toLowerCase();
    const tipoVenta = (venta.tipoVenta || "").toLowerCase();

    // == PREVENTA: sumamos SOLO el abono a la columna respectiva
    if (tipoVenta === "preventa") {
      if (metodo === "efectivo") {
        totalEfectivo += Number(venta.montoAbono || 0);
      } else if (metodo === "tarjeta") {
        totalTarjeta += Number(venta.montoAbono || 0);
      } else if (metodo === "transferencia") {
        totalTransferencia += Number(venta.montoAbono || 0);
      }
      // contraentrega no se suma

    } else {
      // == VENTA NORMAL:
      if (metodo === "efectivo") {
        totalEfectivo += Number(venta.total || 0);
      } else if (metodo === "tarjeta") {
        totalTarjeta += Number(venta.total || 0);
      } else if (metodo === "transferencia") {
        totalTransferencia += Number(venta.total || 0);
      }
      // contraentrega no se suma
    }

    // Si la venta es del tipo "online", sumamos su total a "ventaLinea"
    // (Aquí va la lógica que ya tenías; si quisieras excluir "contraentrega"
    // de "en línea", podrías validarlo, pero de momento sumamos todo lo "online".)
    if (tipoVenta === "online") {
      ventaLinea += Number(venta.total || 0);
    }
  });

  // Capturamos el monto de apertura desde localStorage
  const storedMontoApertura = localStorage.getItem("montoApertura");
  const aperturaMonto = storedMontoApertura ? Number(storedMontoApertura) : 0;

  // Total efectivo según sistema
  let totalEfectivoSistema = aperturaMonto + Number(totalEfectivo);
  let diferencia = Number(montoFinal) - totalEfectivoSistema;

  let now = new Date();
  let horaCierre = now.toTimeString().split(" ")[0];
  let idhistorialCierre = await getNextHistorialCierre();

  // El total en la fila de "Detalle de Ventas" => efectivo + tarjeta + transferencia + envíos
  let totalVentasDetalle = totalEfectivo + totalTarjeta + totalTransferencia + envios;

  // Construir objeto cierre
  let cierreData = {
    idhistorialCierre,
    fechaCierre: fechaHoy,
    horaCierre,
    montoApertura: aperturaMonto,
    
    // Valores del reporte
    totalEfectivo: Number(totalEfectivo) || 0,
    totalTarjeta: Number(totalTarjeta) || 0,
    totalTransferencia: Number(totalTransferencia) || 0,
    envios: Number(envios) || 0,
    ventaLinea: Number(ventaLinea) || 0, // "En línea"
    
    totalVentasDetalle,
    
    // Totales para arqueo
    totalEfectivoSistema: totalEfectivoSistema,
    totalIngresado: Number(montoFinal) || 0,
    diferencia: diferencia,
    usuario: localStorage.getItem("loggedUser") || "admin"
  };

  // Actualiza la apertura como cerrada en Firestore
  await updateDoc(doc(db, "aperturas", window.idAperturaActivo), { activo: false });
  // Registra el cierre en "cierres"
  await addDoc(collection(db, "cierres"), cierreData);

  // Elimina la persistencia de apertura
  localStorage.removeItem("cajaAbierta");
  localStorage.removeItem("idAperturaActivo");
  localStorage.removeItem("datosApertura");
  localStorage.removeItem("montoApertura");

  window.cajaAbierta = false;
  window.idAperturaActivo = null;

  // Ordenar las ventas por su ID (asc)
  ventasDetalle.sort((a, b) => {
    let va = parseInt(a.idVenta || 0);
    let vb = parseInt(b.idVenta || 0);
    return va - vb;
  });

  // Generar reporte HTML y guardarlo
  const reporteHtml = generarReporteCierreHTML(ventasDetalle, cierreData);
  await addDoc(collection(db, "reportescierre"), {
    idCierre: idhistorialCierre,
    reporte: reporteHtml,
    fechaCierre: cierreData.fechaCierre,
    createdAt: new Date().toISOString()
  });

  Swal.fire({
    title: "Cierre Registrado",
    html: `<p>Se ha cerrado la caja correctamente.</p>
           <p>Total Efectivo Sistema: Q ${totalEfectivoSistema.toFixed(2)}</p>
           <p>Total Ingresado: Q ${Number(montoFinal).toFixed(2)}</p>
           <p>Diferencia: Q ${diferencia.toFixed(2)}</p>`,
    icon: "success"
  });
}

/**
 * Genera el reporte de cierre en formato HTML
 */
function generarReporteCierreHTML(ventasDetalle, cierreData) {
  let montoApertura = Number(cierreData.montoApertura) || 0;
  let totalEfectivo = Number(cierreData.totalEfectivo || 0);
  let totalTarjeta = Number(cierreData.totalTarjeta || 0);
  let totalTransferencia = Number(cierreData.totalTransferencia || 0);
  let envios = Number(cierreData.envios || 0);
  let ventaLinea = Number(cierreData.ventaLinea || 0);
  let totalVentasDetalle = Number(cierreData.totalVentasDetalle || 0);

  let totalEfectivoSistema = Number(cierreData.totalEfectivoSistema) || 0;
  let totalIngresado = Number(cierreData.totalIngresado) || 0;
  let diferencia = Number(cierreData.diferencia) || 0;
  let diferenciaColor = diferencia >= 0 ? "green" : "red";
  
  // "Ventas Realizadas"
  // Si es PREVENTA => en la columna "Total" mostramos "montoAbono" en lugar de "total"
  let ventasRows = ventasDetalle.map(venta => {
    let metodoPago = (venta.metodo_pago || "").toLowerCase();
    let tipoVenta = venta.tipoVenta || ""; // "preventa", "fisico", "online"
    let numeroRef = (metodoPago === "transferencia") ? (venta.numeroTransferencia || "") : "-";
    
    // Comentario si es "online"
    let comentarioMostrar = (tipoVenta === "online" && venta.comentario) ? venta.comentario : "-";

    // Ajuste: si es preventa, mostramos abono; sino, total
    let displayedTotal = (tipoVenta.toLowerCase() === "preventa")
      ? Number(venta.montoAbono || 0)
      : Number(venta.total || 0);

    return `<tr>
              <td>${venta.idVenta}</td>
              <td>${tipoVenta}</td>
              <td>${metodoPago}</td>
              <td>${numeroRef}</td>
              <td>${venta.empleadoNombre || ""}</td>
              <td>${comentarioMostrar}</td>
              <td>Q ${displayedTotal.toFixed(2)}</td>
            </tr>`;
  }).join('');

  return `
    <div id="reporte-cierre" style="width:800px; padding:20px; font-family:Arial, sans-serif;">
      <div style="text-align: center;">
        <img src="img/GLEED2.png" alt="Logo" style="max-height: 100px;"><br>
        <h2>Reporte de Cierre</h2>
      </div>
      
      <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
        <div style="text-align: left;">
          <p><strong>N° Cierre:</strong> ${cierreData.idhistorialCierre}</p>
          <p><strong>Fecha y Hora de Cierre:</strong> ${cierreData.fechaCierre} ${cierreData.horaCierre}</p>
        </div>
        <div style="text-align: right;">
          <p><strong>Monto de Apertura:</strong> Q ${montoApertura.toFixed(2)}</p>
        </div>
      </div>
      
      <hr style="border-top: 2px solid #000; margin-bottom: 10px;">
      
      <!-- DETALLE DE VENTAS -->
      <div style="margin-bottom: 10px;">
        <h3 style="text-align: center;">Detalle de Ventas</h3>
        <table style="width:100%; text-align: center; border-collapse: collapse;" border="1" cellpadding="5">
          <tr>
            <th>Efectivo</th>
            <th>Tarjeta</th>
            <th>Transferencia</th>
            <th>En línea</th>
            <th>Envíos</th>
            <th>Total</th>
          </tr>
          <tr>
            <td>Q ${totalEfectivo.toFixed(2)}</td>
            <td>Q ${totalTarjeta.toFixed(2)}</td>
            <td>Q ${totalTransferencia.toFixed(2)}</td>
            <td>Q ${ventaLinea.toFixed(2)}</td>
            <td>Q ${envios.toFixed(2)}</td>
            <td>Q ${totalVentasDetalle.toFixed(2)}</td>
          </tr>
        </table>
      </div>
      
      <hr style="border-top: 2px solid #000; margin-bottom: 10px;">
      
      <!-- TOTALES -->
      <div style="margin-bottom: 10px;">
        <h3 style="text-align: center;">Totales</h3>
        <table style="width:100%; text-align: center; border-collapse: collapse;" border="1" cellpadding="5">
          <tr>
            <th>Total Efectivo</th>
            <th>Arqueo</th>
            <th>Diferencia</th>
          </tr>
          <tr>
            <td>Q ${totalEfectivoSistema.toFixed(2)}</td>
            <td>Q ${totalIngresado.toFixed(2)}</td>
            <td style="color:${diferenciaColor};">Q ${diferencia.toFixed(2)}</td>
          </tr>
        </table>
      </div>
      
      <hr style="border-top: 2px solid #000; margin-bottom: 10px;">
      
      <!-- VENTAS REALIZADAS -->
      <div style="margin-bottom: 10px;">
        <h3 style="text-align: center;">Ventas Realizadas</h3>
        <table style="width:100%; border-collapse: collapse;" border="1" cellpadding="5">
          <thead>
            <tr>
              <th>ID Venta</th>
              <th>Método de Venta</th>
              <th>Método de Pago</th>
              <th>Número de Referencia</th>
              <th>Vendedor</th>
              <th>Comentario</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${ventasRows}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

window.descargarReporteCierre = function(cierreData, ventasDetalle) {
  const reporteHtml = generarReporteCierreHTML(ventasDetalle, cierreData);
  let container = document.createElement("div");
  container.innerHTML = reporteHtml;
  container.style.position = "absolute";
  container.style.left = "-9999px";
  document.body.appendChild(container);
  html2canvas(container).then(canvas => {
    let dataURL = canvas.toDataURL("image/png");
    let a = document.createElement("a");
    a.href = dataURL;
    a.download = `reporte-cierre-${cierreData.idhistorialCierre}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    document.body.removeChild(container);
  });
};

window.cerrarCaja = cerrarCaja;
