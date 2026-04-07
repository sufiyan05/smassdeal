(function (window) {
    const Smassdeal = window.Smassdeal || (window.Smassdeal = {});
    const FILTERS_KEY = "smassdeal-subadmins-filters";

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

    function toDate(value) {
        if (!value) {
            return null;
        }

        if (value instanceof Date) {
            return value;
        }

        if (typeof value.toDate === "function") {
            return value.toDate();
        }

        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    function formatDateTime(value) {
        const date = toDate(value);
        if (!date) {
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

    function normalizeSubAdmin(subAdmin) {
        return {
            id: subAdmin.id || "",
            name: String(subAdmin.name || "").trim(),
            email: String(subAdmin.email || "").trim().toLowerCase(),
            authUid: String(subAdmin.authUid || "").trim(),
            role: "subadmin",
            phone: String(subAdmin.phone || "").trim(),
            status: String(subAdmin.status || "active").trim().toLowerCase(),
            notes: String(subAdmin.notes || "").trim(),
            createdAt: subAdmin.createdAt || null,
            updatedAt: subAdmin.updatedAt || null
        };
    }

    function bindPasswordToggle(buttonId, inputId, iconId) {
        const button = document.getElementById(buttonId);
        const input = document.getElementById(inputId);
        const icon = document.getElementById(iconId);

        if (!button || !input || !icon) {
            return;
        }

        button.addEventListener("click", () => {
            const isHidden = input.type === "password";
            input.type = isHidden ? "text" : "password";
            icon.className = isHidden ? "bi bi-eye-slash" : "bi bi-eye";
            button.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
        });
    }

    async function createSubAdminLogin(email, password) {
        const appName = `subadmin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const secondaryApp = window.firebase.initializeApp(Smassdeal.firebase.config, appName);
        const secondaryAuth = window.firebase.getAuth(secondaryApp);
        let createdUser = null;

        async function cleanup(options) {
            const shouldDeleteUser = Boolean(options && options.deleteUser);

            try {
                if (shouldDeleteUser && createdUser && window.firebase.deleteUser) {
                    await window.firebase.deleteUser(createdUser);
                }
            } catch (error) {
                console.error("Error deleting created sub admin auth user:", error);
            }

            try {
                await window.firebase.signOut(secondaryAuth);
            } catch (error) {
                console.error("Error signing out secondary auth:", error);
            }

            if (window.firebase.deleteApp) {
                try {
                    await window.firebase.deleteApp(secondaryApp);
                } catch (error) {
                    console.error("Error deleting secondary Firebase app:", error);
                }
            }
        }

        try {
            const credential = await window.firebase.createUserWithEmailAndPassword(secondaryAuth, email, password);
            createdUser = credential.user;
            return {
                uid: credential.user.uid,
                cleanup
            };
        } catch (error) {
            await cleanup();
            throw error;
        }
    }

    async function getSubAdmins() {
        try {
            const db = Smassdeal.firebase.getDb();
            if (!db) {
                console.warn("Firebase not initialized, returning empty sub admins");
                return [];
            }

            const subAdminsRef = window.firebase.collection(db, "subadmins");
            const querySnapshot = await window.firebase.getDocs(subAdminsRef);

            const subAdmins = [];
            querySnapshot.forEach((item) => {
                subAdmins.push(normalizeSubAdmin({ ...item.data(), id: item.id }));
            });

            return subAdmins.sort((left, right) => {
                const rightDate = toDate(right.createdAt || right.updatedAt);
                const leftDate = toDate(left.createdAt || left.updatedAt);
                return (rightDate ? rightDate.getTime() : 0) - (leftDate ? leftDate.getTime() : 0);
            });
        } catch (error) {
            console.error("Error getting sub admins:", error);
            return [];
        }
    }

    async function addSubAdmin(subAdmin) {
        const password = String(subAdmin.password || "");
        let loginAccount = null;

        if (password.length < 6) {
            throw new Error("Password must be at least 6 characters long.");
        }

        try {
            const db = Smassdeal.firebase.getDb();
            if (!db) {
                throw new Error("Firebase not initialized");
            }

            const normalizedSubAdmin = normalizeSubAdmin(subAdmin);
            loginAccount = await createSubAdminLogin(normalizedSubAdmin.email, password);
            const subAdminsRef = window.firebase.collection(db, "subadmins");
            const now = new Date();
            const docRef = await window.firebase.addDoc(subAdminsRef, {
                name: normalizedSubAdmin.name,
                email: normalizedSubAdmin.email,
                authUid: loginAccount.uid,
                role: normalizedSubAdmin.role,
                phone: normalizedSubAdmin.phone,
                status: normalizedSubAdmin.status,
                notes: normalizedSubAdmin.notes,
                createdAt: now,
                updatedAt: now
            });

            await loginAccount.cleanup();

            return { ...normalizedSubAdmin, id: docRef.id, authUid: loginAccount.uid, createdAt: now, updatedAt: now };
        } catch (error) {
            if (loginAccount) {
                await loginAccount.cleanup({ deleteUser: true });
            }
            console.error("Error adding sub admin:", error);
            throw error;
        }
    }

    async function updateSubAdmin(id, updates) {
        try {
            const db = Smassdeal.firebase.getDb();
            if (!db) {
                throw new Error("Firebase not initialized");
            }

            const subAdminRef = window.firebase.doc(db, "subadmins", id);
            const normalizedUpdates = normalizeSubAdmin({ ...updates, id });

            if (normalizedUpdates.authUid && normalizedUpdates.email !== String(updates.originalEmail || "").trim().toLowerCase()) {
                throw new Error("Email cannot be changed for a sub admin login from this panel.");
            }

            await window.firebase.updateDoc(subAdminRef, {
                name: normalizedUpdates.name,
                email: normalizedUpdates.email,
                authUid: normalizedUpdates.authUid,
                role: normalizedUpdates.role,
                phone: normalizedUpdates.phone,
                status: normalizedUpdates.status,
                notes: normalizedUpdates.notes,
                updatedAt: new Date()
            });

            return normalizedUpdates;
        } catch (error) {
            console.error("Error updating sub admin:", error);
            throw error;
        }
    }

    async function deleteSubAdmin(id) {
        try {
            const db = Smassdeal.firebase.getDb();
            if (!db) {
                throw new Error("Firebase not initialized");
            }

            const subAdminRef = window.firebase.doc(db, "subadmins", id);
            await window.firebase.deleteDoc(subAdminRef);
            return true;
        } catch (error) {
            console.error("Error deleting sub admin:", error);
            throw error;
        }
    }

    async function getSubAdminById(id) {
        try {
            const db = Smassdeal.firebase.getDb();
            if (!db) {
                return null;
            }

            const subAdminRef = window.firebase.doc(db, "subadmins", id);
            const docSnap = await window.firebase.getDoc(subAdminRef);

            if (docSnap.exists()) {
                return normalizeSubAdmin({ ...docSnap.data(), id: docSnap.id });
            }

            return null;
        } catch (error) {
            console.error("Error getting sub admin by ID:", error);
            return null;
        }
    }

    function getStoredFilters() {
        return readJSON(FILTERS_KEY, {
            search: "",
            status: ""
        });
    }

    function setStoredFilters(filters) {
        writeJSON(FILTERS_KEY, filters);
    }

    async function initSubAdminsPage() {
        const ui = Smassdeal.ui;
        if (!ui || document.body.dataset.page !== "subadmins") {
            return;
        }

        const filterForm = document.getElementById("subAdminsFilterForm");
        const searchInput = document.getElementById("subAdminsSearch");
        const statusSelect = document.getElementById("subAdminsStatus");
        const resetButton = document.getElementById("resetSubAdminsFilters");
        const tableBody = document.getElementById("subAdminsTableBody");
        const openCreateButton = document.getElementById("openCreateSubAdmin");
        const formPanel = document.getElementById("subAdminFormPanel");
        const subAdminForm = document.getElementById("subAdminForm");
        const closeFormButton = document.getElementById("closeSubAdminForm");
        const cancelFormButton = document.getElementById("cancelSubAdminForm");
        const emailInput = document.getElementById("subAdminEmail");
        const passwordInput = document.getElementById("subAdminPassword");
        const passwordField = document.getElementById("subAdminPasswordField");
        const passwordHelp = document.getElementById("subAdminPasswordHelp");
        const emailHelp = document.getElementById("subAdminEmailHelp");
        const deleteLabel = document.getElementById("deleteItemLabel");
        const confirmDeleteButton = document.getElementById("confirmDeleteSubAdmin");
        const headerText = document.getElementById("subAdminsHeaderText");
        const deleteModalElement = document.getElementById("deleteConfirmModal");
        const deleteModal = deleteModalElement ? new window.bootstrap.Modal(deleteModalElement) : null;

        if (!filterForm || !tableBody || !subAdminForm) {
            return;
        }

        let filters = getStoredFilters();
        let pendingDeleteId = null;

        bindPasswordToggle("toggleSubAdminPassword", "subAdminPassword", "toggleSubAdminPasswordIcon");

        function syncFilterInputs() {
            searchInput.value = filters.search;
            statusSelect.value = filters.status;
        }

        async function getFilteredSubAdmins() {
            const subAdmins = await getSubAdmins();
            return subAdmins
                .filter((subAdmin) => {
                    if (!filters.search) {
                        return true;
                    }

                    return `${subAdmin.name} ${subAdmin.email} ${subAdmin.phone} ${subAdmin.notes}`
                        .toLowerCase()
                        .includes(filters.search.toLowerCase());
                })
                .filter((subAdmin) => !filters.status || subAdmin.status === filters.status);
        }

        function setFormMode(mode, subAdmin) {
            const heading = document.getElementById("subAdminFormHeading");
            const subheading = document.getElementById("subAdminFormSubheading");
            const submitLabel = document.getElementById("subAdminSubmitLabel");
            const subAdminId = document.getElementById("subAdminId");
            const isEditMode = mode === "edit";
            const hasLogin = Boolean(subAdmin && subAdmin.authUid);

            heading.textContent = isEditMode ? "Edit Sub Admin" : "New Sub Admin";
            subheading.textContent = isEditMode
                ? "Update the selected sub admin details."
                : "Save a new sub admin record with contact, login email, and password.";
            submitLabel.textContent = isEditMode ? "Update Sub Admin" : "Create Sub Admin";
            subAdminId.value = subAdmin ? subAdmin.id : "";
            subAdminId.dataset.authUid = subAdmin && subAdmin.authUid ? subAdmin.authUid : "";
            subAdminId.dataset.originalEmail = subAdmin && subAdmin.email ? subAdmin.email : "";
            subAdminForm.dataset.mode = mode;

            subAdminForm.reset();
            document.getElementById("subAdminStatus").value = "active";
            passwordInput.value = "";
            passwordInput.required = !isEditMode;
            passwordField.classList.toggle("d-none", isEditMode);
            emailInput.readOnly = hasLogin;
            emailHelp.textContent = hasLogin
                ? "Email is locked because this sub admin already has a Firebase login."
                : "This email will be used for the sub admin login.";
            passwordHelp.textContent = "Set a login password for the new sub admin account.";

            if (subAdmin) {
                document.getElementById("subAdminName").value = subAdmin.name;
                emailInput.value = subAdmin.email;
                document.getElementById("subAdminPhone").value = subAdmin.phone;
                document.getElementById("subAdminStatus").value = subAdmin.status;
                document.getElementById("subAdminNotes").value = subAdmin.notes;
            } else {
                emailInput.value = "";
            }

            formPanel.classList.remove("hidden");
            formPanel.scrollIntoView({ behavior: "smooth", block: "start" });
        }

        function hideForm() {
            formPanel.classList.add("hidden");
            subAdminForm.reset();
            subAdminForm.dataset.mode = "create";
            document.getElementById("subAdminStatus").value = "active";
            passwordInput.required = true;
            passwordField.classList.remove("d-none");
            emailInput.readOnly = false;
            emailHelp.textContent = "This email will be used for the sub admin login.";
            passwordHelp.textContent = "Set a login password for the new sub admin account.";
        }

        async function renderTable() {
            const subAdmins = await getFilteredSubAdmins();
            headerText.textContent = filters.status
                ? `Showing ${ui.capitalize(filters.status)} sub admin records.`
                : "Manage sub admin contact and status details.";

            if (!subAdmins.length) {
                tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-secondary">No sub admins found.</td></tr>';
                return;
            }

            tableBody.innerHTML = subAdmins.map((subAdmin) => `
                <tr>
                    <td>
                        <div class="fw-semibold">${ui.escapeHtml(subAdmin.name)}</div>
                        <div class="small text-secondary">${ui.escapeHtml(subAdmin.notes || "No notes added")}</div>
                    </td>
                    <td>${ui.escapeHtml(subAdmin.email)}</td>
                    <td>${ui.escapeHtml(subAdmin.phone || "N/A")}</td>
                    <td><span class="badge-soft">${ui.capitalize(subAdmin.status)}</span></td>
                    <td>${formatDateTime(subAdmin.createdAt || subAdmin.updatedAt)}</td>
                    <td>
                        <div class="action-group">
                            <button type="button" class="btn btn-sm btn-outline-primary rounded-3" data-action="edit" data-subadmin-id="${subAdmin.id}">Edit</button>
                            <button type="button" class="btn btn-sm btn-outline-danger rounded-3" data-action="delete" data-subadmin-id="${subAdmin.id}">Delete</button>
                        </div>
                    </td>
                </tr>
            `).join("");
        }

        function getFormPayload() {
            return {
                name: document.getElementById("subAdminName").value,
                email: emailInput.value,
                authUid: document.getElementById("subAdminId").dataset.authUid || "",
                originalEmail: document.getElementById("subAdminId").dataset.originalEmail || "",
                phone: document.getElementById("subAdminPhone").value,
                status: document.getElementById("subAdminStatus").value,
                notes: document.getElementById("subAdminNotes").value,
                password: passwordInput.value
            };
        }

        filterForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            filters = {
                search: searchInput.value.trim(),
                status: statusSelect.value
            };
            setStoredFilters(filters);
            await renderTable();
        });

        resetButton.addEventListener("click", async () => {
            filters = {
                search: "",
                status: ""
            };
            setStoredFilters(filters);
            syncFilterInputs();
            await renderTable();
        });

        openCreateButton.addEventListener("click", () => {
            setFormMode("create", null);
        });

        [closeFormButton, cancelFormButton].forEach((button) => {
            button.addEventListener("click", hideForm);
        });

        subAdminForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const mode = subAdminForm.dataset.mode || "create";
            const subAdminId = document.getElementById("subAdminId").value;
            const payload = getFormPayload();

            try {
                if (mode === "edit" && subAdminId) {
                    await updateSubAdmin(subAdminId, payload);
                    Smassdeal.auth.setFlash("Sub admin updated successfully.", "success");
                } else {
                    await addSubAdmin(payload);
                    Smassdeal.auth.setFlash("Sub admin created successfully.", "success");
                }

                hideForm();
                await renderTable();
                ui.renderFlash();
            } catch (error) {
                console.error("Error saving sub admin:", error);
                Smassdeal.auth.setFlash(error.message || "Error saving sub admin. Please try again.", "danger");
                ui.renderFlash();
            }
        });

        tableBody.addEventListener("click", async (event) => {
            const trigger = event.target.closest("[data-action]");
            if (!trigger) {
                return;
            }

            const subAdminId = trigger.dataset.subadminId;
            if (trigger.dataset.action === "edit") {
                const subAdmin = await getSubAdminById(subAdminId);
                if (subAdmin) {
                    setFormMode("edit", subAdmin);
                }
                return;
            }

            const subAdmin = await getSubAdminById(subAdminId);
            pendingDeleteId = subAdminId;
            deleteLabel.textContent = subAdmin ? subAdmin.name : "this sub admin";
            if (deleteModal) {
                deleteModal.show();
            }
        });

        confirmDeleteButton.addEventListener("click", async () => {
            if (!pendingDeleteId) {
                return;
            }

            try {
                await deleteSubAdmin(pendingDeleteId);
                pendingDeleteId = null;
                if (deleteModal) {
                    deleteModal.hide();
                }
                Smassdeal.auth.setFlash("Sub admin deleted successfully.", "success");
                await renderTable();
                ui.renderFlash();
            } catch (error) {
                console.error("Error deleting sub admin:", error);
                Smassdeal.auth.setFlash("Error deleting sub admin. Please try again.", "danger");
                ui.renderFlash();
            }
        });

        syncFilterInputs();
        hideForm();
        await renderTable();
    }

    Smassdeal.subadmins = {
        getSubAdmins,
        addSubAdmin,
        updateSubAdmin,
        deleteSubAdmin,
        getSubAdminById,
        initSubAdminsPage
    };
})(window);
