(function (window) {
    const Smassdeal = window.Smassdeal || (window.Smassdeal = {});
    const FILTERS_KEY = "smassdeal-logs-filters";

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

    function normalizeCreatedAt(value) {
        if (!value) {
            return "";
        }

        if (typeof value === "string") {
            return value;
        }

        if (value instanceof Date) {
            return value.toISOString();
        }

        if (value && typeof value.toDate === "function") {
            return value.toDate().toISOString();
        }

        if (value && typeof value.seconds === "number") {
            return new Date(value.seconds * 1000).toISOString();
        }

        const parsedValue = new Date(value);
        return Number.isNaN(parsedValue.getTime()) ? "" : parsedValue.toISOString();
    }

    function normalizeLog(log) {
        return {
            id: log.id || "",
            entityType: normalizeText(log.entityType).toLowerCase(),
            entityId: normalizeText(log.entityId),
            action: normalizeText(log.action).toLowerCase(),
            actorName: normalizeText(log.actorName),
            actorEmail: normalizeText(log.actorEmail),
            actorRole: normalizeText(log.actorRole),
            targetLabel: normalizeText(log.targetLabel),
            message: normalizeText(log.message),
            createdAt: normalizeCreatedAt(log.createdAt)
        };
    }

    function formatDateTime(value) {
        if (!value) {
            return "N/A";
        }

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return "N/A";
        }

        return date.toLocaleString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function getStoredFilters() {
        return readJSON(FILTERS_KEY, {
            search: "",
            entityType: "",
            action: ""
        });
    }

    function setStoredFilters(filters) {
        writeJSON(FILTERS_KEY, filters);
    }

    async function logEvent(eventData) {
        try {
            const db = Smassdeal.firebase && Smassdeal.firebase.getDb ? Smassdeal.firebase.getDb() : null;
            if (!db) {
                console.warn("Firebase not initialized, skipping activity log");
                return false;
            }

            const currentUser = Smassdeal.auth && Smassdeal.auth.getCurrentUser ? Smassdeal.auth.getCurrentUser() : null;
            const logsRef = window.firebase.collection(db, "activityLogs");
            const payload = {
                entityType: normalizeText(eventData.entityType).toLowerCase(),
                entityId: normalizeText(eventData.entityId),
                action: normalizeText(eventData.action).toLowerCase(),
                actorName: normalizeText(currentUser && currentUser.name) || "Unknown User",
                actorEmail: normalizeText(currentUser && currentUser.email),
                actorRole: normalizeText(currentUser && currentUser.roleLabel),
                targetLabel: normalizeText(eventData.targetLabel),
                message: normalizeText(eventData.message),
                createdAt: new Date().toISOString()
            };

            await window.firebase.addDoc(logsRef, payload);
            return true;
        } catch (error) {
            console.error("Error writing activity log:", error);
            return false;
        }
    }

    async function getLogs() {
        try {
            const db = Smassdeal.firebase && Smassdeal.firebase.getDb ? Smassdeal.firebase.getDb() : null;
            if (!db) {
                console.warn("Firebase not initialized, returning empty activity logs");
                return [];
            }

            const logsRef = window.firebase.collection(db, "activityLogs");
            const logsQuery = window.firebase.query(logsRef, window.firebase.orderBy("createdAt", "desc"));
            const querySnapshot = await window.firebase.getDocs(logsQuery);
            const logs = [];

            querySnapshot.forEach((doc) => {
                logs.push(normalizeLog({ ...doc.data(), id: doc.id }));
            });

            return logs;
        } catch (error) {
            console.error("Error getting activity logs:", error);
            return [];
        }
    }

    async function initLogsPage() {
        const ui = Smassdeal.ui;
        if (!ui || document.body.dataset.page !== "logs") {
            return;
        }

        const filterForm = document.getElementById("logsFilterForm");
        const searchInput = document.getElementById("logsSearch");
        const entityTypeSelect = document.getElementById("logsEntityType");
        const actionSelect = document.getElementById("logsAction");
        const resetButton = document.getElementById("resetLogsFilters");
        const tableBody = document.getElementById("logsTableBody");

        if (!filterForm || !tableBody || !searchInput || !entityTypeSelect || !actionSelect) {
            return;
        }

        let filters = getStoredFilters();

        function syncFilterInputs() {
            searchInput.value = filters.search;
            entityTypeSelect.value = filters.entityType;
            actionSelect.value = filters.action;
        }

        async function getFilteredLogs() {
            const logs = await getLogs();
            return logs
                .filter((log) => !filters.entityType || log.entityType === filters.entityType)
                .filter((log) => !filters.action || log.action === filters.action)
                .filter((log) => {
                    if (!filters.search) {
                        return true;
                    }

                    const target = `${log.actorName} ${log.actorEmail} ${log.entityType} ${log.action} ${log.targetLabel} ${log.message}`.toLowerCase();
                    return target.includes(filters.search.toLowerCase());
                });
        }

        async function renderTable() {
            const logs = await getFilteredLogs();

            if (!logs.length) {
                tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-secondary">No log events found.</td></tr>';
                return;
            }

            tableBody.innerHTML = logs.map((log) => `
                <tr>
                    <td>${ui.escapeHtml(formatDateTime(log.createdAt))}</td>
                    <td>
                        <div class="fw-semibold">${ui.escapeHtml(log.actorName || "Unknown User")}</div>
                        <div class="small text-secondary">${ui.escapeHtml(log.actorEmail || "No email")}</div>
                    </td>
                    <td>${ui.escapeHtml(ui.capitalize(log.entityType || "event"))}</td>
                    <td><span class="badge text-bg-light border">${ui.escapeHtml(ui.capitalize(log.action || "event"))}</span></td>
                    <td>${ui.escapeHtml(log.targetLabel || "-")}</td>
                    <td>${ui.escapeHtml(log.message || "-")}</td>
                </tr>
            `).join("");
        }

        filterForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            filters = {
                search: searchInput.value.trim(),
                entityType: entityTypeSelect.value,
                action: actionSelect.value
            };
            setStoredFilters(filters);
            await renderTable();
        });

        resetButton.addEventListener("click", async () => {
            filters = {
                search: "",
                entityType: "",
                action: ""
            };
            setStoredFilters(filters);
            syncFilterInputs();
            await renderTable();
        });

        syncFilterInputs();
        await renderTable();
    }

    Smassdeal.logs = {
        logEvent,
        getLogs,
        initLogsPage
    };
})(window);
