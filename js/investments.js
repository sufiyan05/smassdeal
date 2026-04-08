(function (window) {
    const Smassdeal = window.Smassdeal || (window.Smassdeal = {});
    const FILTERS_KEY = "smassdeal-investments-filters";

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

    function normalizeOptionalText(value) {
        return String(value || "").trim();
    }

    function normalizeOptionalNumber(value) {
        if (value === "" || value === null || typeof value === "undefined") {
            return null;
        }

        const parsedValue = Number(value);
        return Number.isFinite(parsedValue) ? parsedValue : null;
    }

    function normalizeInvestment(investment) {
        return {
            id: investment.id || "",
            productName: normalizeOptionalText(investment.productName),
            orderType: normalizeOptionalText(investment.orderType),
            currentDate: investment.currentDate,
            price: Number(investment.price || 0),
            quantity: normalizeOptionalNumber(investment.quantity),
            remark: normalizeOptionalText(investment.remark)
        };
    }

    async function getInvestments() {
        try {
            const db = Smassdeal.firebase.getDb();
            if (!db) {
                console.warn("Firebase not initialized, returning empty investments");
                return [];
            }

            const investmentsRef = window.firebase.collection(db, "investments");
            const q = window.firebase.query(investmentsRef, window.firebase.orderBy("currentDate", "desc"));
            const querySnapshot = await window.firebase.getDocs(q);

            const investments = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                investments.push(normalizeInvestment({ ...data, id: doc.id }));
            });

            return investments;
        } catch (error) {
            console.error("Error getting investments:", error);
            return [];
        }
    }

    async function addInvestment(investment) {
        try {
            const db = Smassdeal.firebase.getDb();
            if (!db) {
                throw new Error("Firebase not initialized");
            }

            const normalizedInvestment = normalizeInvestment(investment);
            const investmentsRef = window.firebase.collection(db, "investments");
            const docRef = await window.firebase.addDoc(investmentsRef, {
                productName: normalizedInvestment.productName,
                orderType: normalizedInvestment.orderType,
                currentDate: normalizedInvestment.currentDate,
                price: normalizedInvestment.price,
                quantity: normalizedInvestment.quantity,
                remark: normalizedInvestment.remark,
                createdAt: new Date(),
                updatedAt: new Date()
            });

            return { ...normalizedInvestment, id: docRef.id };
        } catch (error) {
            console.error("Error adding investment:", error);
            throw error;
        }
    }

    async function updateInvestment(id, updates) {
        try {
            const db = Smassdeal.firebase.getDb();
            if (!db) {
                throw new Error("Firebase not initialized");
            }

            const investmentRef = window.firebase.doc(db, "investments", id);
            const normalizedUpdates = normalizeInvestment({ ...updates, id });
            await window.firebase.updateDoc(investmentRef, {
                productName: normalizedUpdates.productName,
                orderType: normalizedUpdates.orderType,
                currentDate: normalizedUpdates.currentDate,
                price: normalizedUpdates.price,
                quantity: normalizedUpdates.quantity,
                remark: normalizedUpdates.remark,
                updatedAt: new Date()
            });

            return normalizedUpdates;
        } catch (error) {
            console.error("Error updating investment:", error);
            throw error;
        }
    }

    async function deleteInvestment(id) {
        try {
            const db = Smassdeal.firebase.getDb();
            if (!db) {
                throw new Error("Firebase not initialized");
            }

            const investmentRef = window.firebase.doc(db, "investments", id);
            await window.firebase.deleteDoc(investmentRef);
            return true;
        } catch (error) {
            console.error("Error deleting investment:", error);
            throw error;
        }
    }

    async function getInvestmentById(id) {
        try {
            const db = Smassdeal.firebase.getDb();
            if (!db) {
                return null;
            }

            const investmentRef = window.firebase.doc(db, "investments", id);
            const docSnap = await window.firebase.getDoc(investmentRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                return normalizeInvestment({ ...data, id: docSnap.id });
            } else {
                return null;
            }
        } catch (error) {
            console.error("Error getting investment by ID:", error);
            return null;
        }
    }

    async function getLatestMonth() {
        try {
            const investments = await getInvestments();
            const months = investments
                .map((investment) => String(investment.currentDate || "").slice(0, 7))
                .filter(Boolean)
                .sort();

            return months[months.length - 1] || new Date().toISOString().slice(0, 7);
        } catch (error) {
            console.error("Error getting latest month:", error);
            return new Date().toISOString().slice(0, 7);
        }
    }

    function getStoredFilters() {
        return readJSON(FILTERS_KEY, {
            search: "",
            month: ""
        });
    }

    function setStoredFilters(filters) {
        writeJSON(FILTERS_KEY, filters);
    }

    async function initInvestmentsPage() {
        const ui = Smassdeal.ui;
        if (!ui || document.body.dataset.page !== "investments") {
            return;
        }

        const filterForm = document.getElementById("investmentsFilterForm");
        const searchInput = document.getElementById("investmentsSearch");
        const monthInput = document.getElementById("investmentsMonth");
        const resetButton = document.getElementById("resetInvestmentsFilters");
        const tableBody = document.getElementById("investmentsTableBody");
        const openCreateButton = document.getElementById("openCreateInvestment");
        const formPanel = document.getElementById("investmentFormPanel");
        const investmentForm = document.getElementById("investmentForm");
        const closeFormButton = document.getElementById("closeInvestmentForm");
        const cancelFormButton = document.getElementById("cancelInvestmentForm");
        const deleteLabel = document.getElementById("deleteItemLabel");
        const confirmDeleteButton = document.getElementById("confirmDeleteInvestment");
        const deleteModalElement = document.getElementById("deleteConfirmModal");
        const deleteModal = deleteModalElement ? new window.bootstrap.Modal(deleteModalElement) : null;
        const headerText = document.getElementById("investmentsHeaderText");
        const monthlyTotalsTitle = document.getElementById("investmentsMonthlyTotalsTitle");
        const monthlyTotalsNote = document.getElementById("investmentsMonthlyTotalsNote");
        const monthlyTotalsGrid = document.getElementById("investmentsMonthlyTotalsGrid");
        const allTotalsNote = document.getElementById("investmentsAllTotalsNote");
        const allTotalsGrid = document.getElementById("investmentsAllTotalsGrid");

        if (!filterForm || !tableBody || !investmentForm) {
            return;
        }

        document.getElementById("investmentOrderType").innerHTML = `
            <option value="">Select Investment Type</option>
            ${Smassdeal.orders.getOrderTypes().map((type) => `<option value="${type}">${type}</option>`).join("")}
        `;

        let filters = getStoredFilters();
        if (!filters.month) {
            filters.month = await getLatestMonth();
            setStoredFilters(filters);
        }
        let pendingDeleteId = null;
        let pendingDeleteInvestment = null;

        async function recordInvestmentLog(action, investment) {
            if (!Smassdeal.logs || !Smassdeal.logs.logEvent) {
                return;
            }

            const investmentLabel = investment && investment.productName ? investment.productName : "Unknown Investment";
            const investmentType = investment && investment.orderType ? investment.orderType : "N/A";

            const messageByAction = {
                create: `Created investment ${investmentLabel} (${investmentType}).`,
                update: `Updated investment ${investmentLabel} (${investmentType}).`,
                delete: `Deleted investment ${investmentLabel} (${investmentType}).`
            };

            try {
                await Smassdeal.logs.logEvent({
                    entityType: "investment",
                    entityId: investment && investment.id ? investment.id : pendingDeleteId,
                    action,
                    targetLabel: investmentLabel,
                    message: messageByAction[action] || `${action} investment ${investmentLabel}.`
                });
            } catch (error) {
                console.warn("Unable to record investment activity log:", error);
            }
        }

        async function syncFilterInputs() {
            searchInput.value = filters.search;
            monthInput.value = filters.month || await getLatestMonth();
        }

        async function getFilteredInvestments(allInvestments) {
            const investments = Array.isArray(allInvestments) ? allInvestments : await getInvestments();
            return investments
                .filter((investment) => !filters.month || String(investment.currentDate).slice(0, 7) === filters.month)
                .filter((investment) => {
                    if (!filters.search) {
                        return true;
                    }

                    return `${investment.productName} ${investment.orderType} ${investment.remark || ""}`
                        .toLowerCase()
                        .includes(filters.search.toLowerCase());
                })
                .sort((left, right) => new Date(right.currentDate) - new Date(left.currentDate));
        }

        function summarizeInvestments(investments) {
            return {
                count: investments.length,
                quantity: investments.reduce((sum, investment) => sum + Number(investment.quantity || 0), 0),
                amount: investments.reduce((sum, investment) => sum + Number(investment.price || 0), 0)
            };
        }

        function buildSummaryItems(summary) {
            return [
                { label: "Entries", value: Number(summary.count || 0).toLocaleString("en-IN") },
                { label: "Quantity", value: Number(summary.quantity || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 }) },
                { label: "Amount", value: ui.formatCurrency(summary.amount) }
            ];
        }

        function renderSummaryGrid(host, summary) {
            if (!host) {
                return;
            }

            const items = buildSummaryItems(summary);
            host.innerHTML = items.map((item) => `
                <div class="col-6 col-md-4">
                    <div class="border rounded-4 p-3 h-100">
                        <div class="small text-secondary mb-1">${item.label}</div>
                        <div class="fw-bold">${item.value}</div>
                    </div>
                </div>
            `).join("");
        }

        async function renderTotals(allInvestments) {
            const investments = Array.isArray(allInvestments) ? allInvestments : await getInvestments();
            const monthLabel = ui.formatMonthLabel(filters.month);
            const monthlyInvestments = investments.filter((investment) => !filters.month || String(investment.currentDate).slice(0, 7) === filters.month);
            const monthlySummary = summarizeInvestments(monthlyInvestments);
            const allSummary = summarizeInvestments(investments);

            if (monthlyTotalsTitle) {
                monthlyTotalsTitle.textContent = `${monthLabel} Summary`;
            }

            if (monthlyTotalsNote) {
                monthlyTotalsNote.textContent = `Full totals for ${monthLabel}, including records hidden by the current search.`;
            }

            if (allTotalsNote) {
                allTotalsNote.textContent = "Full totals across every investment record.";
            }

            renderSummaryGrid(monthlyTotalsGrid, monthlySummary);
            renderSummaryGrid(allTotalsGrid, allSummary);
        }

        function setFormMode(mode, investment) {
            const heading = document.getElementById("investmentFormHeading");
            const subheading = document.getElementById("investmentFormSubheading");
            const submitLabel = document.getElementById("investmentSubmitLabel");
            const investmentId = document.getElementById("investmentId");

            heading.textContent = mode === "edit" ? "Edit Investment" : "New Investment";
            subheading.textContent = mode === "edit"
                ? "Update an existing investment record for accurate cost tracking."
                : "Record a new investment entry with category and pricing details.";
            submitLabel.textContent = mode === "edit" ? "Update Investment" : "Create Investment";
            investmentId.value = investment ? investment.id : "";
            investmentForm.dataset.mode = mode;

            investmentForm.reset();
            document.getElementById("investmentCurrentDate").value = new Date().toISOString().slice(0, 10);

            if (investment) {
                document.getElementById("investmentProductName").value = investment.productName;
                document.getElementById("investmentOrderType").value = investment.orderType;
                document.getElementById("investmentCurrentDate").value = investment.currentDate;
                document.getElementById("investmentPrice").value = investment.price;
                document.getElementById("investmentQuantity").value = investment.quantity ?? "";
                document.getElementById("investmentRemark").value = investment.remark;
            }

            formPanel.classList.remove("hidden");
            formPanel.scrollIntoView({ behavior: "smooth", block: "start" });
        }

        function hideForm() {
            formPanel.classList.add("hidden");
            investmentForm.reset();
            investmentForm.dataset.mode = "create";
        }

        async function renderTable() {
            headerText.textContent = `Track outgoing investment costs for ${ui.formatMonthLabel(filters.month)}.`;
            const allInvestments = await getInvestments();
            await renderTotals(allInvestments);
            const investments = await getFilteredInvestments(allInvestments);

            if (!investments.length) {
                tableBody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-secondary">No investments found.</td></tr>';
                return;
            }

            tableBody.innerHTML = investments.map((investment) => `
                <tr>
                    <td class="fw-semibold">${ui.escapeHtml(investment.productName)}</td>
                    <td>${ui.escapeHtml(investment.orderType)}</td>
                    <td>${ui.formatDate(investment.currentDate)}</td>
                    <td>${investment.quantity ?? "-"}</td>
                    <td>${ui.formatCurrency(investment.price)}</td>
                    <td>${investment.remark ? ui.escapeHtml(investment.remark) : "-"}</td>
                    <td>
                        <div class="action-group">
                            <button type="button" class="btn btn-sm btn-outline-primary rounded-3" data-action="edit" data-investment-id="${investment.id}">Edit</button>
                            <button type="button" class="btn btn-sm btn-outline-danger rounded-3" data-action="delete" data-investment-id="${investment.id}">Delete</button>
                        </div>
                    </td>
                </tr>
            `).join("");
        }

        function getFormPayload() {
            return {
                productName: document.getElementById("investmentProductName").value,
                orderType: document.getElementById("investmentOrderType").value,
                currentDate: document.getElementById("investmentCurrentDate").value,
                quantity: document.getElementById("investmentQuantity").value,
                price: document.getElementById("investmentPrice").value,
                remark: document.getElementById("investmentRemark").value
            };
        }

        filterForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            filters = {
                search: searchInput.value.trim(),
                month: monthInput.value || await getLatestMonth()
            };
            setStoredFilters(filters);
            await renderTable();
        });

        resetButton.addEventListener("click", async () => {
            filters = {
                search: "",
                month: await getLatestMonth()
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

        investmentForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const mode = investmentForm.dataset.mode || "create";
            const investmentId = document.getElementById("investmentId").value;
            const payload = getFormPayload();

            try {
                let savedInvestment = null;
                if (mode === "edit" && investmentId) {
                    savedInvestment = await updateInvestment(investmentId, payload);
                    await recordInvestmentLog("update", savedInvestment);
                    Smassdeal.auth.setFlash("Investment updated successfully.", "success");
                } else {
                    savedInvestment = await addInvestment(payload);
                    await recordInvestmentLog("create", savedInvestment);
                    Smassdeal.auth.setFlash("Investment created successfully.", "success");
                }

                hideForm();
                await renderTable();
                ui.renderFlash();
            } catch (error) {
                console.error("Error saving investment:", error);
                Smassdeal.auth.setFlash("Error saving investment. Please try again.", "danger");
                ui.renderFlash();
            }
        });

        tableBody.addEventListener("click", async (event) => {
            const trigger = event.target.closest("[data-action]");
            if (!trigger) {
                return;
            }

            const investmentId = trigger.dataset.investmentId;
            if (trigger.dataset.action === "edit") {
                const investment = await getInvestmentById(investmentId);
                if (investment) {
                    setFormMode("edit", investment);
                }
                return;
            }

            const investment = await getInvestmentById(investmentId);
            pendingDeleteId = investmentId;
            pendingDeleteInvestment = investment;
            deleteLabel.textContent = investment ? `investment ${investment.productName}` : "this item";
            if (deleteModal) {
                deleteModal.show();
            }
        });

        confirmDeleteButton.addEventListener("click", async () => {
            if (!pendingDeleteId) {
                return;
            }

            try {
                await deleteInvestment(pendingDeleteId);
                await recordInvestmentLog("delete", pendingDeleteInvestment || { id: pendingDeleteId });
                pendingDeleteId = null;
                pendingDeleteInvestment = null;
                if (deleteModal) {
                    deleteModal.hide();
                }
                Smassdeal.auth.setFlash("Investment deleted successfully.", "success");
                await renderTable();
                ui.renderFlash();
            } catch (error) {
                console.error("Error deleting investment:", error);
                Smassdeal.auth.setFlash("Error deleting investment. Please try again.", "danger");
                ui.renderFlash();
            }
        });

        await syncFilterInputs();
        hideForm();
        await renderTable();
    }

    Smassdeal.investments = {
        getInvestments,
        addInvestment,
        updateInvestment,
        deleteInvestment,
        getInvestmentById,
        getLatestMonth,
        initInvestmentsPage
    };

    window.getInvestments = getInvestments;
    window.addInvestment = addInvestment;
    window.updateInvestment = updateInvestment;
    window.deleteInvestment = deleteInvestment;
})(window);
