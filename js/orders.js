(function (window) {
    const Smassdeal = window.Smassdeal || (window.Smassdeal = {});
    const FILTERS_KEY = "smassdeal-orders-filters";

    function readJSON(key, fallback) {
        try {
            const raw = window.localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (error) {
            return fallback;
        }
    }

    function writeJSON(key, value) {
        window.localStorage.setItem(key, JSON.stringify(value));
    }

    function normalizeText(value) {
        return String(value || "").trim();
    }

    function normalizeNumber(value) {
        const parsedValue = Number(value || 0);
        return Number.isFinite(parsedValue) ? parsedValue : 0;
    }

    function getDefaultOrderStatus(order) {
        if (order && (order.orderStatus || order.status)) {
            return normalizeText(order.orderStatus || order.status).toLowerCase();
        }

        const paymentStatus = normalizeText(order && order.paymentStatus).toLowerCase();
        return paymentStatus === "paid" ? "done" : "pending";
    }

    function normalizeOrder(order) {
        const orderStatus = getDefaultOrderStatus(order);
        const isCancelled = orderStatus === "cancel";
        const smassdealPrice = isCancelled ? 0 : normalizeNumber(order.smassdealPrice);
        const halfPaymentPrice = isCancelled ? 0 : normalizeNumber(order.halfPaymentPrice);
        const userPaidPrice = isCancelled ? 0 : normalizeNumber(order.userPaidPrice);
        const cost = isCancelled ? 0 : normalizeNumber(order.cost);

        return {
            id: order.id || `ord-${Date.now()}`,
            name: normalizeText(order.name),
            orderType: normalizeText(order.orderType),
            orderDetail: normalizeText(order.orderDetail),
            orderStatus,
            smassdealPrice,
            halfPaymentPrice,
            userPaidPrice,
            cost,
            currentDate: order.currentDate,
            deliveryDate: order.deliveryDate,
            paymentStatus: normalizeText(order.paymentStatus || "pending").toLowerCase(),
            profit: userPaidPrice - cost,
            remaining: smassdealPrice - userPaidPrice
        };
    }

    function toFirestoreOrderPayload(order) {
        const normalizedOrder = normalizeOrder(order);

        return {
            name: normalizedOrder.name,
            orderType: normalizedOrder.orderType,
            orderDetail: normalizedOrder.orderDetail,
            smassdealPrice: normalizedOrder.smassdealPrice,
            halfPaymentPrice: normalizedOrder.halfPaymentPrice,
            userPaidPrice: normalizedOrder.userPaidPrice,
            cost: normalizedOrder.cost,
            currentDate: normalizedOrder.currentDate,
            deliveryDate: normalizedOrder.deliveryDate,
            status: normalizedOrder.orderStatus,
            paymentStatus: normalizedOrder.paymentStatus
        };
    }

    async function getOrders() {
        try {
            const db = Smassdeal.firebase.getDb();
            if (!db) {
                console.warn("Firebase not initialized, returning empty orders");
                return [];
            }

            const ordersRef = window.firebase.collection(db, "orders");
            const q = window.firebase.query(ordersRef, window.firebase.orderBy("currentDate", "desc"));
            const querySnapshot = await window.firebase.getDocs(q);

            const orders = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                orders.push(normalizeOrder({ ...data, id: doc.id }));
            });

            return orders;
        } catch (error) {
            console.error("Error getting orders:", error);
            return [];
        }
    }

    async function addOrder(order) {
        try {
            const db = Smassdeal.firebase.getDb();
            if (!db) {
                throw new Error("Firebase not initialized");
            }

            const normalizedOrder = normalizeOrder(order);
            const ordersRef = window.firebase.collection(db, "orders");
            const firestorePayload = toFirestoreOrderPayload(order);
            const docRef = await window.firebase.addDoc(ordersRef, {
                ...firestorePayload,
                createdAt: new Date(),
                updatedAt: new Date()
            });

            return { ...normalizedOrder, id: docRef.id };
        } catch (error) {
            console.error("Error adding order:", error);
            throw error;
        }
    }

    async function updateOrder(id, updates) {
        try {
            const db = Smassdeal.firebase.getDb();
            if (!db) {
                throw new Error("Firebase not initialized");
            }

            const orderRef = window.firebase.doc(db, "orders", id);
            const normalizedUpdates = normalizeOrder({ ...updates, id });
            const firestorePayload = toFirestoreOrderPayload({ ...updates, id });
            await window.firebase.updateDoc(orderRef, {
                ...firestorePayload,
                updatedAt: new Date()
            });

            return normalizedUpdates;
        } catch (error) {
            console.error("Error updating order:", error);
            throw error;
        }
    }

    async function deleteOrder(id) {
        try {
            const db = Smassdeal.firebase.getDb();
            if (!db) {
                throw new Error("Firebase not initialized");
            }

            const orderRef = window.firebase.doc(db, "orders", id);
            await window.firebase.deleteDoc(orderRef);
            return true;
        } catch (error) {
            console.error("Error deleting order:", error);
            throw error;
        }
    }

    async function getOrderById(id) {
        try {
            const db = Smassdeal.firebase.getDb();
            if (!db) {
                return null;
            }

            const orderRef = window.firebase.doc(db, "orders", id);
            const docSnap = await window.firebase.getDoc(orderRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                return normalizeOrder({ ...data, id: docSnap.id });
            } else {
                return null;
            }
        } catch (error) {
            console.error("Error getting order by ID:", error);
            return null;
        }
    }

    function getOrderTypes() {
        return ["resin", "hamper", "frame", "nikahnama/pen"];
    }

    function getPaymentStatuses() {
        return ["pending", "partial", "paid"];
    }

    function getOrderStatuses() {
        return ["pending", "done", "cancel"];
    }

    async function getLatestMonth() {
        try {
            const orders = await getOrders();
            const months = orders
                .map((order) => String(order.currentDate || "").slice(0, 7))
                .filter(Boolean)
                .sort();

            return months[months.length - 1] || new Date().toISOString().slice(0, 7);
        } catch (error) {
            console.error("Error getting latest month:", error);
            return new Date().toISOString().slice(0, 7);
        }
    }

    function isClosedMonth(monthValue) {
        if (!monthValue) {
            return false;
        }

        const today = new Date();
        const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
        return monthValue < currentMonth;
    }

    function getStoredFilters() {
        return readJSON(FILTERS_KEY, {
            search: "",
            month: "",
            paymentStatus: "",
            visibility: "active"
        });
    }

    function setStoredFilters(filters) {
        writeJSON(FILTERS_KEY, filters);
    }

    async function initOrdersPage() {
        const ui = Smassdeal.ui;
        if (!ui || document.body.dataset.page !== "orders") {
            return;
        }

        const filterForm = document.getElementById("ordersFilterForm");
        const searchInput = document.getElementById("ordersSearch");
        const monthInput = document.getElementById("ordersMonth");
        const paymentStatusSelect = document.getElementById("ordersPaymentStatus");
        const visibilitySelect = document.getElementById("ordersVisibility");
        const resetButton = document.getElementById("resetOrdersFilters");
        const tableBody = document.getElementById("ordersTableBody");
        const openCreateButton = document.getElementById("openCreateOrder");
        const formPanel = document.getElementById("orderFormPanel");
        const closeFormButton = document.getElementById("closeOrderForm");
        const cancelFormButton = document.getElementById("cancelOrderForm");
        const orderForm = document.getElementById("orderForm");
        const orderStatusSelect = document.getElementById("orderStatus");
        const headerText = document.getElementById("ordersHeaderText");
        const visibilityAlert = document.getElementById("ordersVisibilityAlert");
        const deleteLabel = document.getElementById("deleteItemLabel");
        const confirmDeleteButton = document.getElementById("confirmDeleteOrder");
        const deleteModalElement = document.getElementById("deleteConfirmModal");
        const deleteModal = deleteModalElement ? new window.bootstrap.Modal(deleteModalElement) : null;

        if (!filterForm || !tableBody || !orderForm) {
            return;
        }

        paymentStatusSelect.innerHTML = `
            <option value="">All Statuses</option>
            ${getPaymentStatuses().map((status) => `<option value="${status}">${ui.capitalize(status)}</option>`).join("")}
        `;

        document.getElementById("orderType").innerHTML = `
            <option value="">Select Order Type</option>
            ${getOrderTypes().map((type) => `<option value="${type}">${type}</option>`).join("")}
        `;

        orderStatusSelect.innerHTML = `
            <option value="">Select Order Status</option>
            ${getOrderStatuses().map((status) => `<option value="${status}">${ui.capitalize(status)}</option>`).join("")}
        `;

        document.getElementById("orderPaymentStatus").innerHTML = `
            <option value="">Select Payment Status</option>
            ${getPaymentStatuses().map((status) => `<option value="${status}">${ui.capitalize(status)}</option>`).join("")}
        `;

        let filters = getStoredFilters();
        let pendingDeleteId = null;
        let pendingDeleteOrder = null;
        let renderedOrders = [];

        async function recordOrderLog(action, order) {
            if (!Smassdeal.logs || !Smassdeal.logs.logEvent) {
                return;
            }

            const orderLabel = order && order.name ? order.name : "Unknown Order";
            const orderType = order && order.orderType ? order.orderType : "N/A";
            const orderStatus = order && order.orderStatus ? order.orderStatus : "pending";

            const messageByAction = {
                create: `Created order for ${orderLabel} (${orderType}) with status ${orderStatus}.`,
                update: `Updated order for ${orderLabel} (${orderType}) with status ${orderStatus}.`,
                delete: `Deleted order for ${orderLabel} (${orderType}).`
            };

            try {
                await Smassdeal.logs.logEvent({
                    entityType: "order",
                    entityId: order && order.id ? order.id : pendingDeleteId,
                    action,
                    targetLabel: orderLabel,
                    message: messageByAction[action] || `${action} order ${orderLabel}.`
                });
            } catch (error) {
                console.warn("Unable to record order activity log:", error);
            }
        }

        function setAmountInputsReadOnly(isReadOnly) {
            [
                "orderSmassdealPrice",
                "orderHalfPaymentPrice",
                "orderUserPaidPrice",
                "orderCost"
            ].forEach((fieldId) => {
                const input = document.getElementById(fieldId);
                input.readOnly = isReadOnly;
            });
        }

        function zeroAmountInputs() {
            document.getElementById("orderSmassdealPrice").value = 0;
            document.getElementById("orderHalfPaymentPrice").value = 0;
            document.getElementById("orderUserPaidPrice").value = 0;
            document.getElementById("orderCost").value = 0;
        }

        function syncCancelledState() {
            const isCancelled = orderStatusSelect.value === "cancel";
            if (isCancelled) {
                zeroAmountInputs();
                document.getElementById("orderPaymentStatus").value = "pending";
            }

            setAmountInputsReadOnly(isCancelled);
        }

        async function syncFilterInputs() {
            searchInput.value = filters.search;
            monthInput.value = filters.month || await getLatestMonth();
            paymentStatusSelect.value = filters.paymentStatus;
            visibilitySelect.value = filters.visibility;
        }

        async function getFilteredOrders() {
            const orders = await getOrders();
            return orders
                .filter((order) => !filters.month || String(order.currentDate).slice(0, 7) === filters.month)
                .filter((order) => {
                    if (!filters.search) {
                        return true;
                    }

                    const target = `${order.name} ${order.orderType} ${order.orderDetail} ${order.orderStatus} ${order.paymentStatus}`.toLowerCase();
                    return target.includes(filters.search.toLowerCase());
                })
                .filter((order) => !filters.paymentStatus || order.paymentStatus === filters.paymentStatus)
                .filter((order) => {
                    if (filters.visibility === "all") {
                        return true;
                    }

                    return !(isClosedMonth(filters.month) && order.orderStatus === "done");
                })
                .sort((left, right) => new Date(right.currentDate) - new Date(left.currentDate));
        }

        function getOrderStatusBadge(status) {
            if (status === "done") {
                return "success";
            }

            if (status === "cancel") {
                return "danger";
            }

            return "warning";
        }

        function setFormMode(mode, order) {
            const heading = document.getElementById("orderFormHeading");
            const subheading = document.getElementById("orderFormSubheading");
            const submitLabel = document.getElementById("orderSubmitLabel");
            const orderId = document.getElementById("orderId");

            heading.textContent = mode === "edit" ? "Edit Order" : "New Order";
            subheading.textContent = mode === "edit"
                ? "Update pricing, delivery, and payment information for this order."
                : "Capture order details, pricing, payment, and delivery information.";
            submitLabel.textContent = mode === "edit" ? "Update Order" : "Create Order";
            orderId.value = order ? order.id : "";
            orderForm.dataset.mode = mode;

            orderForm.reset();
            document.getElementById("orderCurrentDate").value = new Date().toISOString().slice(0, 10);
            document.getElementById("orderDeliveryDate").value = new Date().toISOString().slice(0, 10);
            orderStatusSelect.value = "pending";
            document.getElementById("orderPaymentStatus").value = "pending";

            if (order) {
                document.getElementById("orderName").value = order.name;
                document.getElementById("orderType").value = order.orderType;
                document.getElementById("orderDetail").value = order.orderDetail;
                document.getElementById("orderSmassdealPrice").value = order.smassdealPrice;
                document.getElementById("orderHalfPaymentPrice").value = order.halfPaymentPrice;
                document.getElementById("orderUserPaidPrice").value = order.userPaidPrice;
                document.getElementById("orderCost").value = order.cost;
                document.getElementById("orderCurrentDate").value = order.currentDate;
                document.getElementById("orderDeliveryDate").value = order.deliveryDate;
                orderStatusSelect.value = order.orderStatus;
                document.getElementById("orderPaymentStatus").value = order.paymentStatus;
            }

            syncCancelledState();
            formPanel.classList.remove("hidden");
            formPanel.scrollIntoView({ behavior: "smooth", block: "start" });
        }

        function hideForm() {
            formPanel.classList.add("hidden");
            orderForm.reset();
            orderForm.dataset.mode = "create";
            orderStatusSelect.value = "pending";
            document.getElementById("orderPaymentStatus").value = "pending";
            setAmountInputsReadOnly(false);
        }

        function renderNotice() {
            const monthLabel = ui.formatMonthLabel(filters.month);
            headerText.textContent = `Showing orders for ${monthLabel}. Orders marked done from closed months stay in dashboard totals and are hidden from this list unless you choose to show all.`;

            if (isClosedMonth(filters.month) && filters.visibility !== "all") {
                visibilityAlert.innerHTML = '<div class="alert alert-warning">Orders marked done for the selected month are archived from this list after month end. They still count in dashboard totals.</div>';
                return;
            }

            if (isClosedMonth(filters.month) && filters.visibility === "all") {
                visibilityAlert.innerHTML = `<div class="alert alert-info">You are viewing all orders for ${monthLabel}, including archived done orders.</div>`;
                return;
            }

            visibilityAlert.innerHTML = "";
        }

        async function renderTable() {
            renderNotice();
            const orders = await getFilteredOrders();
            renderedOrders = orders;

            if (!orders.length) {
                tableBody.innerHTML = '<tr><td colspan="11" class="text-center py-4 text-secondary">No orders found.</td></tr>';
                return;
            }

            tableBody.innerHTML = orders.map((order) => `
                <tr>
                    <td>
                        <div class="fw-semibold">${ui.escapeHtml(order.name)}</div>
                        <div class="small text-secondary">${ui.escapeHtml(order.orderDetail)}</div>
                    </td>
                    <td>${ui.escapeHtml(order.orderType)}</td>
                    <td>${ui.formatDate(order.currentDate)}</td>
                    <td>${ui.formatDate(order.deliveryDate)}</td>
                    <td><span class="badge text-bg-${getOrderStatusBadge(order.orderStatus)}">${ui.capitalize(order.orderStatus)}</span></td>
                    <td><span class="badge text-bg-light border">${ui.capitalize(order.paymentStatus)}</span></td>
                    <td>${ui.formatCurrency(order.smassdealPrice)}</td>
                    <td>${ui.formatCurrency(order.userPaidPrice)}</td>
                    <td class="${order.profit < 0 ? "text-danger" : "text-success-strong"}">${ui.formatCurrency(order.profit)}</td>
                    <td class="${order.remaining > 0 ? "text-warning-strong" : "text-success-strong"}">${ui.formatCurrency(order.remaining)}</td>
                    <td>
                        <div class="action-group">
                            <button type="button" class="btn btn-sm btn-outline-primary rounded-3" data-action="edit" data-order-id="${order.id}">Edit</button>
                            <button type="button" class="btn btn-sm btn-outline-danger rounded-3" data-action="delete" data-order-id="${order.id}" data-order-name="${ui.escapeHtml(order.name)}">Delete</button>
                        </div>
                    </td>
                </tr>
            `).join("");
        }

        function getFormPayload() {
            return {
                name: document.getElementById("orderName").value,
                orderType: document.getElementById("orderType").value,
                orderDetail: document.getElementById("orderDetail").value,
                smassdealPrice: document.getElementById("orderSmassdealPrice").value,
                halfPaymentPrice: document.getElementById("orderHalfPaymentPrice").value,
                userPaidPrice: document.getElementById("orderUserPaidPrice").value,
                cost: document.getElementById("orderCost").value,
                currentDate: document.getElementById("orderCurrentDate").value,
                deliveryDate: document.getElementById("orderDeliveryDate").value,
                orderStatus: orderStatusSelect.value,
                paymentStatus: document.getElementById("orderPaymentStatus").value
            };
        }

        orderStatusSelect.addEventListener("change", syncCancelledState);

        filterForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            filters = {
                search: searchInput.value.trim(),
                month: monthInput.value || await getLatestMonth(),
                paymentStatus: paymentStatusSelect.value,
                visibility: visibilitySelect.value
            };
            setStoredFilters(filters);
            await renderTable();
        });

        resetButton.addEventListener("click", async () => {
            filters = {
                search: "",
                month: await getLatestMonth(),
                paymentStatus: "",
                visibility: "active"
            };
            setStoredFilters(filters);
            await syncFilterInputs();
            await renderTable();
        });

        openCreateButton.addEventListener("click", () => {
            setFormMode("create", null);
        });

        [closeFormButton, cancelFormButton].forEach((button) => {
            button.addEventListener("click", hideForm);
        });

        orderForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const mode = orderForm.dataset.mode || "create";
            const orderId = document.getElementById("orderId").value;
            const payload = getFormPayload();

            try {
                let savedOrder = null;
                if (mode === "edit" && orderId) {
                    savedOrder = await updateOrder(orderId, payload);
                    await recordOrderLog("update", savedOrder);
                    Smassdeal.auth.setFlash("Order updated successfully.", "success");
                } else {
                    savedOrder = await addOrder(payload);
                    await recordOrderLog("create", savedOrder);
                    Smassdeal.auth.setFlash("Order created successfully.", "success");
                }

                hideForm();
                await renderTable();
                ui.renderFlash();
            } catch (error) {
                console.error("Error saving order:", error);
                const message = error && error.message ? `Error saving order: ${error.message}` : "Error saving order. Please try again.";
                Smassdeal.auth.setFlash(message, "danger");
                ui.renderFlash();
            }
        });

        tableBody.addEventListener("click", async (event) => {
            const trigger = event.target.closest("[data-action]");
            if (!trigger) {
                return;
            }

            const orderId = trigger.dataset.orderId;
            if (!orderId) {
                return;
            }

            const currentOrder = renderedOrders.find((order) => order.id === orderId) || await getOrderById(orderId);

            try {
                if (trigger.dataset.action === "edit") {
                    if (currentOrder) {
                        setFormMode("edit", currentOrder);
                    } else {
                        Smassdeal.auth.setFlash("Unable to load this order for editing.", "danger");
                        ui.renderFlash();
                    }
                    return;
                }

                pendingDeleteId = orderId;
                pendingDeleteOrder = currentOrder;
                deleteLabel.textContent = currentOrder ? `order for ${currentOrder.name}` : "this item";
                if (deleteModal) {
                    deleteModal.show();
                }
            } catch (error) {
                console.error("Error handling order action:", error);
                Smassdeal.auth.setFlash("Unable to process that order action right now.", "danger");
                ui.renderFlash();
            }
        });

        confirmDeleteButton.addEventListener("click", async () => {
            if (!pendingDeleteId) {
                return;
            }

            try {
                await deleteOrder(pendingDeleteId);
                await recordOrderLog("delete", pendingDeleteOrder || { id: pendingDeleteId });
                pendingDeleteId = null;
                pendingDeleteOrder = null;
                if (deleteModal) {
                    deleteModal.hide();
                }
                Smassdeal.auth.setFlash("Order deleted successfully.", "success");
                await renderTable();
                ui.renderFlash();
            } catch (error) {
                console.error("Error deleting order:", error);
                const message = error && error.message ? `Error deleting order: ${error.message}` : "Error deleting order. Please try again.";
                Smassdeal.auth.setFlash(message, "danger");
                ui.renderFlash();
            }
        });

        await syncFilterInputs();
        hideForm();
        await renderTable();
    }

    Smassdeal.orders = {
        getOrders,
        addOrder,
        updateOrder,
        deleteOrder,
        getOrderById,
        getOrderTypes,
        getPaymentStatuses,
        getOrderStatuses,
        getLatestMonth,
        initOrdersPage
    };

    window.getOrders = getOrders;
    window.addOrder = addOrder;
    window.updateOrder = updateOrder;
    window.deleteOrder = deleteOrder;
})(window);
