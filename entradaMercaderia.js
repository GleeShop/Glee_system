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

      // Leer datos del usuario (rol y tienda) desde localStorage
      const loggedUserRole  = localStorage.getItem("loggedUserRole")  || "";
      const loggedUserStore = localStorage.getItem("loggedUserStore") || "";

      // Esta variable definirá la tienda para filtrar facturas
      let currentStore = "";

      // Decidir si es admin o no => mostrar un filtro de tienda o forzar la tienda
      if (loggedUserRole.toLowerCase() === "admin") {
        // Es admin: se mostrará "adminStoreFilter" con un select de tiendas
        document.getElementById("adminStoreFilter").style.display = "block";
        document.getElementById("invoiceTitle").textContent = "Registro de Facturas (Todas las Tiendas)";
      } else {
        // No es admin => filtrar solo por su tienda
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

      // Si es admin, cargar el combo de tiendas y setear evento
      if (loggedUserRole.toLowerCase() === "admin") {
        document.addEventListener("DOMContentLoaded", () => {
          loadStoreFilter();
          document.getElementById("storeSelect").addEventListener("change", function () {
            currentStore = this.value;
            if (currentStore) {
              document.getElementById("invoiceTitle").textContent = `Registro de Facturas: ${currentStore}`;
            } else {
              document.getElementById("invoiceTitle").textContent = "Registro de Facturas (Todas las Tiendas)";
            }
            loadInvoices();
          });
        });
      }

      /*****************************************************
       * CARGAR PRODUCTOS (opcionalmente se puede filtrar)
       *****************************************************/
      async function loadAllProductsForInvoice(storeName = "") {
        try {
          const productosRef = collection(db, "productos");
          let q;
          // Si quisieras filtrar, podrías hacerlo
          if (storeName) {
            // Filtrado extra => no implementado
            q = query(productosRef, orderBy("codigo"));
          } else {
            q = query(productosRef, orderBy("codigo"));
          }
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
       * MOSTRAR/POBLAR SELECT DE PRODUCTOS
       *****************************************************/
      function populateProductSelect(select) {
        select.innerHTML = "";
        const defaultOption = document.createElement("option");
        defaultOption.value = "";
        defaultOption.textContent = "Seleccione producto";
        select.appendChild(defaultOption);

        allProducts.forEach((prod) => {
          const option = document.createElement("option");
          option.value = prod.id;
          option.textContent = `${prod.codigo} - ${prod.descripcion}`;
          select.appendChild(option);
        });
      }

      /*****************************************************
       * CARGAR TIENDAS PARA EL SELECT de la factura
       *****************************************************/
      async function loadInvoiceStores() {
        try {
          const tiendasRef = collection(db, "tiendas");
          const qTiendas   = query(tiendasRef, orderBy("nombre"));
          const snapshot   = await getDocs(qTiendas);

          const storeSelect = document.getElementById("invoiceStore");
          storeSelect.innerHTML = "<option value=''>Seleccione tienda</option>";
          snapshot.forEach(docSnap => {
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
       * MOSTRAR FORMULARIO PARA AGREGAR FACTURA
       *****************************************************/
      async function showAddInvoiceForm() {
        document.getElementById("invoiceForm").reset();
        document.getElementById("invoiceId").value = "";
        document.querySelector("#invoiceItemsTable tbody").innerHTML = "";
        document.getElementById("invoiceOverallTotal").value = "";

        await loadInvoiceStores();
        await loadAllProductsForInvoice(); // Cargar productos

        // Si no es admin => forzar la tienda del localStorage
        if (loggedUserRole.toLowerCase() !== "admin") {
          document.getElementById("invoiceStore").value = loggedUserStore;
        }

        invoiceItems = [];
        renderInvoiceItems();
        updateOverallTotal();
        new bootstrap.Modal(document.getElementById("invoiceModal")).show();
      }

      /*****************************************************
       * AGREGAR UN PRODUCTO A LA FACTURA
       *****************************************************/
      function addInvoiceItem() {
        const tbody = document.querySelector("#invoiceItemsTable tbody");
        const row = tbody.insertRow();

        // Celda producto
        const cellProduct = row.insertCell(0);
        const select = document.createElement("select");
        select.className = "form-select";
        populateProductSelect(select);
        select.addEventListener("change", function() {
          const selectedId = select.value;
          const priceInput = row.cells[2].querySelector("input[name='price']");
          if (selectedId) {
            const prod = allProducts.find(p => p.id === selectedId);
            if (prod) {
              priceInput.value = prod.precio;
            }
          } else {
            priceInput.value = "0";
          }
          updateInvoiceItemRow(row);
        });
        cellProduct.appendChild(select);

        // Celda cantidad
        const cellQuantity = row.insertCell(1);
        const quantityInput = document.createElement("input");
        quantityInput.type = "number";
        quantityInput.name = "quantity";
        quantityInput.className = "form-control";
        quantityInput.value = "0";
        quantityInput.addEventListener("input", function() {
          updateInvoiceItemRow(row);
        });
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

      function updateInvoiceItemRow(row) {
        const quantity = parseFloat(row.cells[1].querySelector("input[name='quantity']").value);
        const price    = parseFloat(row.cells[2].querySelector("input[name='price']").value);
        const total    = isNaN(quantity * price) ? 0 : quantity * price;
        row.cells[3].textContent = total.toFixed(2);

        const tbody = document.querySelector("#invoiceItemsTable tbody");
        let items = [];
        for (let r of tbody.rows) {
          const prodSelect = r.cells[0].querySelector("select");
          const qty = parseFloat(r.cells[1].querySelector("input[name='quantity']").value);
          const prc = parseFloat(r.cells[2].querySelector("input[name='price']").value);
          const tot = isNaN(qty * prc) ? 0 : qty * prc;
          if (prodSelect && prodSelect.value) {
            items.push({ productId: prodSelect.value, quantity: qty, price: prc, total: tot });
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
        const prod = allProducts.find(p => p.id === productId);
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
       * CREAR/ACTUALIZAR FACTURA
       *****************************************************/
      async function saveInvoice() {
        try {
          const invoiceId     = document.getElementById("invoiceId").value;
          const invoiceNumber = document.getElementById("invoiceNumber").value.trim();
          const invoiceDate   = document.getElementById("invoiceDate").value;
          const invoiceStore  = document.getElementById("invoiceStore").value;

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
            // Actualizar factura existente
            await updateDoc(doc(db, "facturas", invoiceId), invoiceData);
          } else {
            // Crear factura nueva y actualizar inventario
            const newInvoiceRef = await addDoc(collection(db, "facturas"), invoiceData);
            for (const item of invoiceItems) {
              const prodRef = doc(db, "productos", item.productId);
              const prodDoc = await getDoc(prodRef);
              if (prodDoc.exists()) {
                const prodData = prodDoc.data();
                const currentStock = (prodData.stock && prodData.stock[invoiceStore]) || 0;
                const newStock = currentStock + item.quantity;
                const updatedStock = {
                  ...prodData.stock,
                  [invoiceStore]: newStock
                };
                await updateDoc(prodRef, { stock: updatedStock });
              }
            }
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

          // Verificar si el usuario es admin o no
          if (loggedUserRole.toLowerCase() === "admin") {
            // Si es admin y no ha seleccionado tienda => ver todas
            // Si es admin y ha seleccionado tienda => filtrar
            const storeSelected = document.getElementById("storeSelect")?.value || "";
            if (storeSelected) {
              q = query(facturasRef, where("invoiceStore", "==", storeSelected), orderBy("invoiceDate", "desc"));
            } else {
              q = query(facturasRef, orderBy("invoiceDate", "desc"));
            }
          } else {
            // No admin => filtrar por su tienda
            const store = loggedUserStore || "";
            q = query(facturasRef, where("invoiceStore", "==", store), orderBy("invoiceDate", "desc"));
          }

          const snapshot = await getDocs(q);
          // Recargar productos para mostrar nombres en la tabla
          await loadAllProductsForInvoice();

          const tbody = document.querySelector("#facturasTable tbody");
          tbody.innerHTML = "";

          snapshot.forEach((docSnap) => {
            const invoice = docSnap.data();
            const row = tbody.insertRow();

            if (invoice.status === "anulado") {
              row.classList.add("table-warning");
            }
            row.insertCell(0).textContent = invoice.invoiceNumber;

            // Fecha
            const dateStr = invoice.invoiceDate && invoice.invoiceDate.toDate
              ? invoice.invoiceDate.toDate().toLocaleDateString()
              : "";
            row.insertCell(1).textContent = dateStr;

            // Tienda
            row.insertCell(2).textContent = invoice.invoiceStore || "-";

            // Estado
            row.insertCell(3).textContent = invoice.status ? invoice.status.toUpperCase() : "ACTIVO";

            // Listado de productos
            const productsList = (invoice.items || []).map(item => {
              const prod = allProducts.find(p => p.id === item.productId);
              return prod ? `${prod.codigo} - ${prod.descripcion}` : item.productId;
            }).join(", ");
            row.insertCell(4).textContent = productsList;

            // Total
            row.insertCell(5).textContent = invoice.overallTotal;

            // Acciones
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

          document.getElementById("detailInvoiceNumber").textContent = invoice.invoiceNumber;
          const dateStr = invoice.invoiceDate && invoice.invoiceDate.toDate
            ? invoice.invoiceDate.toDate().toLocaleDateString()
            : "";
          document.getElementById("detailInvoiceDate").textContent = dateStr;
          document.getElementById("detailInvoiceStore").textContent = invoice.invoiceStore || "-";
          document.getElementById("detailInvoiceStatus").textContent = invoice.status
            ? invoice.status.toUpperCase()
            : "ACTIVO";

          const tbody = document.getElementById("detailInvoiceItems");
          tbody.innerHTML = "";
          (invoice.items || []).forEach(item => {
            const tr = document.createElement("tr");
            const prod = allProducts.find(p => p.id === item.productId);
            const prodText = prod ? `${prod.codigo} - ${prod.descripcion}` : item.productId;
            tr.innerHTML = `
              <td>${prodText}</td>
              <td>${item.quantity}</td>
              <td>Q ${parseFloat(item.price).toFixed(2)}</td>
              <td>Q ${parseFloat(item.total).toFixed(2)}</td>
            `;
            tbody.appendChild(tr);
          });
          document.getElementById("detailInvoiceOverallTotal").textContent =
            parseFloat(invoice.overallTotal).toFixed(2);

          new bootstrap.Modal(document.getElementById("invoiceDetailsModal")).show();
        } catch (error) {
          console.error("Error al cargar detalles de factura:", error);
          alert("Error al cargar detalles: " + error.message);
        }
      }

      /*****************************************************
       * EXPORTAR COMPROBANTE COMO IMAGEN
       *****************************************************/
      function exportInvoiceComprobante() {
        const container = document.getElementById("invoiceDetailsContainer");
        html2canvas(container).then((canvas) => {
          const imgData = canvas.toDataURL("image/png");
          const link = document.createElement("a");
          link.download = "comprobante_factura.png";
          link.href = imgData;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        });
      }

      /*****************************************************
       * EDITAR FACTURA
       *****************************************************/
      async function editInvoice(invoiceId) {
        try {
          const docRef = doc(db, "facturas", invoiceId);
          const docSnap = await getDoc(docRef);
          if (!docSnap.exists()) {
            alert("Factura no encontrada.");
            return;
          }
          const invoice = docSnap.data();

          document.getElementById("invoiceId").value = invoiceId;
          document.getElementById("invoiceNumber").value = invoice.invoiceNumber;
          if (invoice.invoiceDate && invoice.invoiceDate.seconds) {
            document.getElementById("invoiceDate").value = new Date(invoice.invoiceDate.seconds * 1000)
              .toISOString()
              .slice(0, 10);
          } else {
            document.getElementById("invoiceDate").value = "";
          }

          await loadInvoiceStores();        // cargar combo de tiendas
          await loadAllProductsForInvoice(); // cargar productos

          document.getElementById("invoiceStore").value = invoice.invoiceStore || "";

          invoiceItems = invoice.items || [];
          renderInvoiceItems();
          updateOverallTotal();

          new bootstrap.Modal(document.getElementById("invoiceModal")).show();
        } catch (error) {
          alert("Error al cargar factura: " + error.message);
        }
      }

      /*****************************************************
       * ELIMINAR FACTURA
       *****************************************************/
      async function deleteInvoice(invoiceId) {
        if (!confirm("¿Está seguro de eliminar esta factura?")) return;
        try {
          await deleteDoc(doc(db, "facturas", invoiceId));
          loadInvoices();
        } catch (error) {
          alert("Error al eliminar la factura: " + error.message);
        }
      }

      /*****************************************************
       * ANULAR FACTURA
       *****************************************************/
      async function anularInvoice(invoiceId) {
        if (!confirm("¿Está seguro de anular esta factura? Se revertirá el inventario.")) return;
        try {
          const docRef = doc(db, "facturas", invoiceId);
          const docSnap = await getDoc(docRef);
          if (!docSnap.exists()) {
            alert("Factura no encontrada.");
            return;
          }
          const invoice = docSnap.data();
          if (invoice.status !== "activo") {
            alert("La factura ya se encuentra anulada o con otro estado.");
            return;
          }
          // Revertir stock
          for (const item of invoice.items || []) {
            const prodRef = doc(db, "productos", item.productId);
            const prodDoc = await getDoc(prodRef);
            if (prodDoc.exists()) {
              const prod = prodDoc.data();
              let updatedStock = prod.stock || {};
              updatedStock[invoice.invoiceStore] = (updatedStock[invoice.invoiceStore] || 0) - item.quantity;
              await updateDoc(prodRef, { stock: updatedStock });
            }
          }
          // Cambiar status
          await updateDoc(docRef, { status: "anulado" });
          alert("Factura anulada y el inventario fue revertido.");
          loadInvoices();
        } catch (error) {
          alert("Error al anular factura: " + error.message);
        }
      }

      /*****************************************************
       * EXPORTAR LISTADO DE FACTURAS COMO IMAGEN
       *****************************************************/
      function exportInvoicesImage() {
        const container = document.getElementById("exportFacturasContainer");
        html2canvas(container).then((canvas) => {
          const imgData = canvas.toDataURL("image/png");
          const link = document.createElement("a");
          link.download = "listado_facturas.png";
          link.href = imgData;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        });
      }

      /*****************************************************
       * INICIALIZACIÓN AL CARGAR LA PÁGINA
       *****************************************************/
      document.addEventListener("DOMContentLoaded", async () => {
        // Cargar productos para mostrar nombres en la tabla
        await loadAllProductsForInvoice();
        // Cargar facturas al inicio
        loadInvoices();
      });

      // Exponer funciones globalmente para usar en onclick
      window.showAddInvoiceForm     = showAddInvoiceForm;
      window.addInvoiceItem         = addInvoiceItem;
      window.removeInvoiceItem      = removeInvoiceItem;
      window.saveInvoice            = saveInvoice;
      window.loadInvoices           = loadInvoices;
      window.viewInvoiceDetails     = viewInvoiceDetails;
      window.exportInvoiceComprobante = exportInvoiceComprobante;
      window.editInvoice            = editInvoice;
      window.deleteInvoice          = deleteInvoice;
      window.anularInvoice          = anularInvoice;
      window.exportInvoicesImage    = exportInvoicesImage;
