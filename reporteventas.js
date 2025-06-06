// reporteventas.js

import { db } from "./firebase-config.js";
import {
  collection,
  query,
  orderBy,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

let todasVentas = [];
let empleadosMap = {}; 
// empleadosMap tendrá la forma { "Nombre Empleado": "NombreTienda", ... }

////////////////////////////////////////////////////////////////////////////////
// Funciones auxiliares

// 1) Formatea fecha ISO a "DD/MM/YYYY HH:mm:ss"
function formatearFecha(fechaISO) {
  const fechaObj = new Date(fechaISO);
  const dia = String(fechaObj.getDate()).padStart(2, "0");
  const mes = String(fechaObj.getMonth() + 1).padStart(2, "0");
  const ano = fechaObj.getFullYear();
  const hora = String(fechaObj.getHours()).padStart(2, "0");
  const minutos = String(fechaObj.getMinutes()).padStart(2, "0");
  const segundos = String(fechaObj.getSeconds()).padStart(2, "0");
  return `${dia}/${mes}/${ano} ${hora}:${minutos}:${segundos}`;
}

// 2) Obtiene "nombreMes año" en minúsculas, para comparar con el filtro de mes
function obtenerMesEsp(fechaISO) {
  const fechaObj = new Date(fechaISO);
  return fechaObj
    .toLocaleString("es-ES", { month: "long", year: "numeric" })
    .toLowerCase();
}

////////////////////////////////////////////////////////////////////////////////
// Renderizar en pantalla (HTML) el reporte agrupado por tienda y colaborador
// Excluyendo cualquier venta cuya tienda resulte ser "N/A"

function renderizarPorTiendaYColaborador() {
  const mesSeleccionado = $("#filtroMes").val(); // formato "YYYY-MM"
  const $container = $("#reportContainer");
  $container.empty();

  if (!mesSeleccionado) {
    return;
  }

  // Convertir "YYYY-MM" a “nombreMes año” en minúsculas, por ejemplo "junio 2025"
  const [ano, mesStr] = mesSeleccionado.split("-");
  const mesNum = parseInt(mesStr, 10) - 1; // JS: enero = 0
  const fechaComparar = new Date(parseInt(ano, 10), mesNum);
  const nombreMesEsp = fechaComparar
    .toLocaleString("es-ES", { month: "long", year: "numeric" })
    .toLowerCase();

  // Filtrar todas las ventas por el mes seleccionado
  const ventasDelMes = todasVentas.filter((venta) => {
    return obtenerMesEsp(venta.fecha) === nombreMesEsp;
  });

  if (ventasDelMes.length === 0) {
    $container.append(`
      <div class="alert alert-warning text-center">
        No se encontraron ventas para <strong>${nombreMesEsp}</strong>.
      </div>
    `);
    return;
  }

  // 1) Agrupar ventasDelMes por tienda, usando empleadosMap para saber la tienda de cada vendedor.
  //    Si la tienda es "N/A", omitir esa venta.
  const grupoPorTienda = {};
  ventasDelMes.forEach((venta) => {
    const nombreEmpleado = venta.empleadoNombre || "N/A";
    const tiendaEmpleado = empleadosMap[nombreEmpleado] || "N/A";
    if (tiendaEmpleado === "N/A") {
      return; // omitimos ventas que no tienen tienda asignada
    }
    if (!grupoPorTienda[tiendaEmpleado]) {
      grupoPorTienda[tiendaEmpleado] = [];
    }
    grupoPorTienda[tiendaEmpleado].push(venta);
  });

  // Si después de filtrar no hay tiendas válidas:
  if (Object.keys(grupoPorTienda).length === 0) {
    $container.append(`
      <div class="alert alert-warning text-center">
        No hay ventas válidas (con tienda asignada) para <strong>${nombreMesEsp}</strong>.
      </div>
    `);
    return;
  }

  // 2) Para cada tienda, dentro del contenedor, crear su propia sección
  Object.keys(grupoPorTienda)
    .sort((a, b) => a.localeCompare(b)) // ordenar tiendas alfabéticamente
    .forEach((tienda) => {
      const ventasEnTienda = grupoPorTienda[tienda];

      // Cabecera de sección para la tienda
      const tiendaHeader = $(`
        <h2 class="mt-4 text-primary">
          Tienda: ${tienda} — <small>${nombreMesEsp}</small>
        </h2>
      `);
      $container.append(tiendaHeader);

      // 3) Dentro de esta tienda, agrupar por colaborador
      const grupoPorColaborador = {};
      ventasEnTienda.forEach((venta) => {
        const colaborador = venta.empleadoNombre || "N/A";
        if (!grupoPorColaborador[colaborador]) {
          grupoPorColaborador[colaborador] = [];
        }
        grupoPorColaborador[colaborador].push(venta);
      });

      // 4) Para cada colaborador en esta tienda, generar su propia subtabla
      Object.keys(grupoPorColaborador)
        .sort((a, b) => a.localeCompare(b)) // ordenar empleados alfabéticamente
        .forEach((colaborador) => {
          const ventasColab = grupoPorColaborador[colaborador];

          // Calcular total de ventas (suma de campo "total") para este colaborador
          const totalVentasColab = ventasColab.reduce((sum, v) => {
            return sum + (Number(v.total) || 0);
          }, 0);
          const totalFormateado = "Q" + totalVentasColab.toFixed(2);

          // Subtítulo con nombre del colaborador, número de ventas y total de ventas
          const colaboradorHeader = $(`
            <h4 class="mt-3">
              ${colaborador} — <small>${ventasColab.length} venta(s) | Total: ${totalFormateado}</small>
            </h4>
          `);
          $container.append(colaboradorHeader);

          // Crear una tabla Bootstrap para este colaborador
          const $tabla = $(`
            <table class="table table-striped table-bordered">
              <thead class="table-secondary">
                <tr>
                  <th>Id Venta</th>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Monto Total</th>
                  <th>Método de Venta</th>
                  <th>Método de Pago</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          `);
          const $tbody = $tabla.find("tbody");

          // Ordenar ventas por fecha ascendente antes de mostrarlas
          ventasColab
            .sort(
              (a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime()
            )
            .forEach((venta) => {
              const idVentaMostrar = venta.idVenta
                ? Number(venta.idVenta)
                : venta._docId;
              const fechaMostrar = formatearFecha(venta.fecha);
              const cliente = venta.cliente?.nombre || "N/A";
              const montoTotal = "Q" + Number(venta.total || 0).toFixed(2);
              const metodoVenta = venta.tipoVenta || "N/A";
              const metodoPago = venta.metodo_pago || "N/A";

              const $fila = $(`
                <tr>
                  <td>${idVentaMostrar}</td>
                  <td>${fechaMostrar}</td>
                  <td>${cliente}</td>
                  <td>${montoTotal}</td>
                  <td>${metodoVenta}</td>
                  <td>${metodoPago}</td>
                </tr>
              `);
              $tbody.append($fila);
            });

          $container.append($tabla);
        });
    });
}

////////////////////////////////////////////////////////////////////////////////
// Generar PDF usando jsPDF + AutoTable,
// excluyendo cualquier venta sin tienda asignada

async function generarPDF() {
  const mesSeleccionado = $("#filtroMes").val(); // "YYYY-MM"
  if (!mesSeleccionado) {
    Swal.fire({
      icon: "warning",
      title: "Selecciona un mes",
      text: "Por favor, elige primero el mes para generar el reporte."
    });
    return;
  }

  // Convertir a "nombreMes año"
  const [ano, mesStr] = mesSeleccionado.split("-");
  const mesNum = parseInt(mesStr, 10) - 1;
  const fechaComparar = new Date(parseInt(ano, 10), mesNum);
  const nombreMesEsp = fechaComparar
    .toLocaleString("es-ES", { month: "long", year: "numeric" })
    .toLowerCase();

  // Filtrar ventasDelMes
  const ventasDelMes = todasVentas.filter((venta) => {
    return obtenerMesEsp(venta.fecha) === nombreMesEsp;
  });

  if (ventasDelMes.length === 0) {
    Swal.fire({
      icon: "info",
      title: "Sin datos",
      text: `No hay ventas para ${nombreMesEsp}.`
    });
    return;
  }

  // Agrupar primero por tienda (omitir ventas con tienda "N/A")
  const grupoPorTienda = {};
  ventasDelMes.forEach((venta) => {
    const nombreEmpleado = venta.empleadoNombre || "N/A";
    const tiendaEmpleado = empleadosMap[nombreEmpleado] || "N/A";
    if (tiendaEmpleado === "N/A") {
      return; // omitimos
    }
    if (!grupoPorTienda[tiendaEmpleado]) {
      grupoPorTienda[tiendaEmpleado] = [];
    }
    grupoPorTienda[tiendaEmpleado].push(venta);
  });

  // Si no quedan tiendas válidas:
  if (Object.keys(grupoPorTienda).length === 0) {
    Swal.fire({
      icon: "info",
      title: "Sin datos válidos",
      text: `Todas las ventas del mes ${nombreMesEsp} carecen de tienda asignada.`
    });
    return;
  }

  // Crear nuevo documento PDF
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const leftMargin = 40;
  let yOffset = 40;

  // Título general
  doc.setFontSize(18);
  doc.text(
    `Reporte de Ventas - ${nombreMesEsp}`,
    leftMargin,
    yOffset
  );
  yOffset += 30;

  // Para cada tienda
  Object.keys(grupoPorTienda)
    .sort((a, b) => a.localeCompare(b))
    .forEach((tienda) => {
      // Si el yOffset está muy cerca del final, nueva página
      if (yOffset > 700) {
        doc.addPage();
        yOffset = 40;
      }

      // Cabecera de tienda
      doc.setFontSize(14);
      doc.setTextColor(0, 102, 204);
      doc.text(`Tienda: ${tienda}`, leftMargin, yOffset);
      yOffset += 20;

      const ventasEnTienda = grupoPorTienda[tienda];

      // Agrupar dentro de la tienda por colaborador
      const grupoPorColaborador = {};
      ventasEnTienda.forEach((venta) => {
        const colaborador = venta.empleadoNombre || "N/A";
        if (!grupoPorColaborador[colaborador]) {
          grupoPorColaborador[colaborador] = [];
        }
        grupoPorColaborador[colaborador].push(venta);
      });

      // Para cada colaborador
      Object.keys(grupoPorColaborador)
        .sort((a, b) => a.localeCompare(b))
        .forEach((colaborador) => {
          // Verificar espacio y nueva página si es necesario
          if (yOffset > 650) {
            doc.addPage();
            yOffset = 40;
          }

          const ventasColab = grupoPorColaborador[colaborador];
          // Calcular total de ventas para este colaborador
          const totalVentasColab = ventasColab.reduce((sum, v) => {
            return sum + (Number(v.total) || 0);
          }, 0);
          const totalFormateado = "Q" + totalVentasColab.toFixed(2);

          // Subtítulo colaborador (incluye número de ventas y total)
          doc.setFontSize(12);
          doc.setTextColor(0, 0, 0);
          doc.text(
            `${colaborador} — ${ventasColab.length} venta(s) | Total: ${totalFormateado}`,
            leftMargin + 10,
            yOffset
          );
          yOffset += 18;

          // Preparar datos para autoTable
          const columnas = [
            { header: "Id Venta", dataKey: "idVentaMostrar" },
            { header: "Fecha", dataKey: "fechaMostrar" },
            { header: "Cliente", dataKey: "cliente" },
            { header: "Monto Total", dataKey: "montoTotal" },
            { header: "Método de Venta", dataKey: "metodoVenta" },
            { header: "Método de Pago", dataKey: "metodoPago" }
          ];

          const filas = ventasColab
            .sort(
              (a, b) =>
                new Date(a.fecha).getTime() - new Date(b.fecha).getTime()
            )
            .map((venta) => {
              return {
                idVentaMostrar: venta.idVenta
                  ? Number(venta.idVenta)
                  : venta._docId,
                fechaMostrar: formatearFecha(venta.fecha),
                cliente: venta.cliente?.nombre || "N/A",
                montoTotal: "Q" + Number(venta.total || 0).toFixed(2),
                metodoVenta: venta.tipoVenta || "N/A",
                metodoPago: venta.metodo_pago || "N/A"
              };
            });

          // Dibujar la tabla
          doc.autoTable({
            startY: yOffset,
            head: [columnas.map((c) => c.header)],
            body: filas.map((row) => columnas.map((c) => row[c.dataKey])),
            margin: { left: leftMargin + 10, right: 40 },
            styles: { fontSize: 9, textColor: 20 },
            headStyles: { fillColor: [220, 220, 220] },
            tableLineColor: [200, 200, 200],
            tableLineWidth: 0.5
          });

          // Actualizar yOffset a la posición final de la tabla
          yOffset = doc.lastAutoTable.finalY + 15;
        });

      // Espacio extra antes de la siguiente tienda
      yOffset += 10;
    });

  // Guardar/descargar PDF con nombre dinámico
  doc.save(`Reporte_Ventas_${mesSeleccionado}.pdf`);
}

////////////////////////////////////////////////////////////////////////////////
// Generar Excel usando SheetJS (xlsx)
// Cada hoja corresponde a una tienda (excluyendo "N/A"), con columnas tabulares.

function generarExcel() {
  const mesSeleccionado = $("#filtroMes").val(); // "YYYY-MM"
  if (!mesSeleccionado) {
    Swal.fire({
      icon: "warning",
      title: "Selecciona un mes",
      text: "Por favor, elige primero el mes para generar el reporte."
    });
    return;
  }

  // Convertir a "nombreMes año"
  const [ano, mesStr] = mesSeleccionado.split("-");
  const mesNum = parseInt(mesStr, 10) - 1;
  const fechaComparar = new Date(parseInt(ano, 10), mesNum);
  const nombreMesEsp = fechaComparar
    .toLocaleString("es-ES", { month: "long", year: "numeric" })
    .toLowerCase();

  // Filtrar ventasDelMes
  const ventasDelMes = todasVentas.filter((venta) => {
    return obtenerMesEsp(venta.fecha) === nombreMesEsp;
  });

  if (ventasDelMes.length === 0) {
    Swal.fire({
      icon: "info",
      title: "Sin datos",
      text: `No hay ventas para ${nombreMesEsp}.`
    });
    return;
  }

  // 1) Agrupar primero por tienda (omitir ventas con tienda "N/A")
  const grupoPorTienda = {};
  ventasDelMes.forEach((venta) => {
    const nombreEmpleado = venta.empleadoNombre || "N/A";
    const tiendaEmpleado = empleadosMap[nombreEmpleado] || "N/A";
    if (tiendaEmpleado === "N/A") {
      return; // omitimos
    }
    if (!grupoPorTienda[tiendaEmpleado]) {
      grupoPorTienda[tiendaEmpleado] = [];
    }
    grupoPorTienda[tiendaEmpleado].push(venta);
  });

  if (Object.keys(grupoPorTienda).length === 0) {
    Swal.fire({
      icon: "info",
      title: "Sin datos válidos",
      text: `Todas las ventas del mes ${nombreMesEsp} carecen de tienda asignada.`
    });
    return;
  }

  // 2) Crear un workbook SheetJS
  const wb = XLSX.utils.book_new();
  wb.Props = {
    Title: `Reporte Ventas ${nombreMesEsp}`,
    CreatedDate: new Date()
  };

  // Para cada tienda, construimos una hoja con una matriz de objetos
  Object.keys(grupoPorTienda)
    .sort((a, b) => a.localeCompare(b))
    .forEach((tienda) => {
      const ventasEnTienda = grupoPorTienda[tienda];

      // 3) Dentro de esta tienda, agrupar por colaborador
      const grupoPorColaborador = {};
      ventasEnTienda.forEach((venta) => {
        const colaborador = venta.empleadoNombre || "N/A";
        if (!grupoPorColaborador[colaborador]) {
          grupoPorColaborador[colaborador] = [];
        }
        grupoPorColaborador[colaborador].push(venta);
      });

      // 4) Construir un array de filas: para cada colaborador, insertamos 
      //    una línea de “encabezado” (Colaborador: X, #ventas, Total: QYYY)
      //    seguida de sus filas de venta. Luego agregamos una fila vacía para separación.
      const filasParaHoja = [];

      Object.keys(grupoPorColaborador)
        .sort((a, b) => a.localeCompare(b))
        .forEach((colaborador) => {
          const ventasColab = grupoPorColaborador[colaborador];

          // Calcular total de ventas para este colaborador
          const totalVentasColab = ventasColab.reduce((sum, v) => {
            return sum + (Number(v.total) || 0);
          }, 0);
          const totalFormateado = "Q" + totalVentasColab.toFixed(2);

          // Fila de “encabezado” para el colaborador
          filasParaHoja.push({
            Colaborador: colaborador,
            "": "", // celdas en blanco para las otras columnas
            "Número de Ventas": ventasColab.length,
            "Total Ventas": totalFormateado,
            Fecha: "",
            Cliente: "",
            "Monto Total": "",
            "Método de Venta": "",
            "Método de Pago": ""
          });

          // Ahora agregamos cada venta como fila separada
          ventasColab
            .sort(
              (a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime()
            )
            .forEach((venta) => {
              filasParaHoja.push({
                Colaborador: "",
                "": "",
                "Número de Ventas": "",
                "Total Ventas": "",
                Fecha: formatearFecha(venta.fecha),
                Id_Venta: venta.idVenta ? Number(venta.idVenta) : venta._docId,
                Cliente: venta.cliente?.nombre || "N/A",
                "Monto Total": "Q" + Number(venta.total || 0).toFixed(2),
                "Método de Venta": venta.tipoVenta || "N/A",
                "Método de Pago": venta.metodo_pago || "N/A"
              });
            });

          // Fila vacía al final del colaborador para separar bloques
          filasParaHoja.push({
            Colaborador: "",
            "": "",
            "Número de Ventas": "",
            "Total Ventas": "",
            Fecha: "",
            Id_Venta: "",
            Cliente: "",
            "Monto Total": "",
            "Método de Venta": "",
            "Método de Pago": ""
          });
        });

      // 5) Convertir filasParaHoja a worksheet
      const ws = XLSX.utils.json_to_sheet(filasParaHoja, {
        header: [
          "Colaborador",
          "",
          "Número de Ventas",
          "Total Ventas",
          "Fecha",
          "Id_Venta",
          "Cliente",
          "Monto Total",
          "Método de Venta",
          "Método de Pago"
        ],
        skipHeader: false
      });

      // Opcional: autoajustar ancho de columnas (estimado básico)
      const wsCols = [
        { wch: 20 }, // Colaborador
        { wch: 1 },  // columna vacía
        { wch: 15 }, // Número de Ventas
        { wch: 15 }, // Total Ventas
        { wch: 20 }, // Fecha
        { wch: 12 }, // Id_Venta
        { wch: 20 }, // Cliente
        { wch: 12 }, // Monto Total
        { wch: 15 }, // Método de Venta
        { wch: 15 }  // Método de Pago
      ];
      ws["!cols"] = wsCols;

      // 6) Añadir la worksheet al workbook con el nombre de la tienda
      XLSX.utils.book_append_sheet(wb, ws, tienda);
    });

  // 7) Finalmente, generar y descargar el archivo .xlsx
  const nombreArchivo = `Reporte_Ventas_${mesSeleccionado}.xlsx`;
  XLSX.writeFile(wb, nombreArchivo);
}

////////////////////////////////////////////////////////////////////////////////
// Suscripción a Firestore y arranque

$(document).ready(function () {
  // 1) Inicializar el input de mes al mes actual
  const hoy = new Date();
  const mesActualISO = `${hoy.getFullYear()}-${String(
    hoy.getMonth() + 1
  ).padStart(2, "0")}`;
  $("#filtroMes").val(mesActualISO);

  // 2) Listener para el botón de PDF
  $("#btnDescargarPDF").on("click", generarPDF);

  // 3) Listener para el botón de Excel
  $("#btnDescargarExcel").on("click", generarExcel);

  // 4) Suscribirse a la colección "empleados" para armar empleadosMap = { nombre → tienda }
  const empleadosQuery = query(
    collection(db, "empleados"),
    orderBy("nombre", "asc")
  );
  onSnapshot(empleadosQuery, (snapshot) => {
    empleadosMap = {};
    snapshot.forEach((docSnap) => {
      const emp = docSnap.data();
      const nombre = emp.nombre || "N/A";
      const tienda = emp.tienda || "N/A";
      empleadosMap[nombre] = tienda;
    });
    // Una vez actualizados los empleados, volver a renderizar (en caso de que ya haya ventas)
    renderizarPorTiendaYColaborador();
  });

  // 5) Suscribirse a la colección "ventas" para obtener todas las ventas
  const ventasQuery = query(
    collection(db, "ventas"),
    orderBy("fecha", "desc")
  );
  onSnapshot(ventasQuery, (snapshot) => {
    todasVentas = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      data._docId = docSnap.id; // guardamos el ID interno si no hay campo idVenta
      todasVentas.push(data);
    });
    // Una vez lleguen las ventas, renderizamos agrupado
    renderizarPorTiendaYColaborador();
  });

  // 6) Al cambiar el mes, se vuelve a dibujar en pantalla
  $("#filtroMes").on("change", renderizarPorTiendaYColaborador);
});
