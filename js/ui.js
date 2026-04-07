(function (window, document) {
    const Smassdeal = window.Smassdeal || (window.Smassdeal = {});
    const FLASH_STORAGE_KEY = "smassdeal-flash";
    const DASHBOARD_MONTH_KEY = "smassdeal-dashboard-month";
    const THEME_STORAGE_KEY = "smassdeal-theme";

    function readJSON(key, fallback) {
        try {
            const raw = window.localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (error) {
            return fallback;
        }
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function capitalize(value) {
        return String(value || "").charAt(0).toUpperCase() + String(value || "").slice(1);
    }

    function formatCurrency(value) {
        return `Rs. ${Number(value || 0).toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })}`;
    }

    function formatDate(value) {
        if (!value) {
            return "N/A";
        }

        return new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        });
    }

    function formatMonthLabel(value) {
        if (!value) {
            return "Current Month";
        }

        const [year, month] = value.split("-");
        return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("en-US", {
            month: "long",
            year: "numeric"
        });
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute("data-theme", theme);
        document.documentElement.setAttribute("data-bs-theme", theme);
        window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    }

    function syncThemeToggle() {
        const toggle = document.getElementById("themeToggle");
        const icon = document.getElementById("themeToggleIcon");
        if (!toggle || !icon) {
            return;
        }

        const isDark = document.documentElement.getAttribute("data-theme") === "dark";
        icon.className = isDark ? "bi bi-sun-fill" : "bi bi-moon-stars-fill";
        toggle.setAttribute("aria-label", isDark ? "Switch to light theme" : "Switch to dark theme");
        toggle.setAttribute("title", isDark ? "Switch to light theme" : "Switch to dark theme");
    }

    function bindThemeToggle() {
        const toggle = document.getElementById("themeToggle");
        if (!toggle) {
            return;
        }

        toggle.addEventListener("click", () => {
            const currentTheme = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
            applyTheme(currentTheme === "dark" ? "light" : "dark");
            syncThemeToggle();
        });

        syncThemeToggle();
    }

    function populateUserProfile() {
        const auth = Smassdeal.auth;
        if (!auth) {
            return;
        }

        const user = auth.getCurrentUser();
        if (!user) {
            return;
        }

        document.querySelectorAll("[data-user-name]").forEach((node) => {
            node.textContent = user.name;
        });

        document.querySelectorAll("[data-user-email]").forEach((node) => {
            node.textContent = user.email;
        });

        document.querySelectorAll("[data-user-role]").forEach((node) => {
            node.textContent = user.roleLabel || "Admin";
        });
    }

    function highlightNavigation() {
        const page = document.body.dataset.page;
        document.querySelectorAll("[data-nav]").forEach((node) => {
            node.classList.toggle("active", node.dataset.nav === page);
        });
    }

    function applyRoleVisibility() {
        if (!Smassdeal.auth || !Smassdeal.auth.getCurrentUser()) {
            return;
        }

        document.querySelectorAll("[data-role-visible]").forEach((node) => {
            const roles = String(node.dataset.roleVisible || "")
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean);

            if (!roles.length) {
                node.classList.remove("d-none");
                return;
            }

            node.classList.toggle("d-none", !Smassdeal.auth.hasAnyRole(roles));
        });
    }

    function renderFlash() {
        const host = document.getElementById("pageAlert") || document.getElementById("loginAlert");
        if (!host) {
            return;
        }

        const flash = readJSON(FLASH_STORAGE_KEY, null);
        if (!flash || !flash.message) {
            host.innerHTML = "";
            return;
        }

        host.innerHTML = `<div class="alert alert-${flash.type || "success"}">${escapeHtml(flash.message)}</div>`;
        window.localStorage.removeItem(FLASH_STORAGE_KEY);
    }

    function bindLogout() {
        const logoutButton = document.getElementById("logoutConfirmBtn");
        if (!logoutButton || !Smassdeal.auth) {
            return;
        }

        logoutButton.addEventListener("click", () => {
            Smassdeal.auth.logout();
        });
    }

    function bindLoginForm() {
        if (document.body.dataset.page !== "login" || !Smassdeal.auth) {
            console.log("bindLoginForm: Not on login page or auth not ready");
            return;
        }

        console.log("bindLoginForm: Initializing login form");

        const form = document.getElementById("loginForm");
        const passwordInput = document.getElementById("password");
        const togglePassword = document.getElementById("togglePassword");
        const togglePasswordIcon = document.getElementById("togglePasswordIcon");

        console.log("bindLoginForm: Elements found - form:", !!form, "password:", !!passwordInput, "toggle:", !!togglePassword, "icon:", !!togglePasswordIcon);

        if (!form || !passwordInput || !togglePassword || !togglePasswordIcon) {
            console.error("bindLoginForm: Some elements not found");
            return;
        }

        console.log("bindLoginForm: Binding password toggle event");

        togglePassword.addEventListener("click", () => {
            console.log("bindLoginForm: Password toggle clicked");
            const isHidden = passwordInput.type === "password";
            passwordInput.type = isHidden ? "text" : "password";
            togglePasswordIcon.className = isHidden ? "bi bi-eye-slash" : "bi bi-eye";
            togglePassword.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
        });

        form.addEventListener("submit", async (event) => {
            console.log("bindLoginForm: Form submit event triggered");
            event.preventDefault();

            // Show loading state
            const submitBtn = form.querySelector('button[type="submit"]');
            console.log("bindLoginForm: Submit button found:", !!submitBtn);
            const originalText = submitBtn.textContent;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Signing in...';

            try {
                const result = await Smassdeal.auth.login({
                    email: document.getElementById("email").value,
                    password: document.getElementById("password").value,
                    remember: document.getElementById("remember").checked
                });

                if (!result.ok) {
                    const host = document.getElementById("loginAlert");
                    host.innerHTML = `<div class="alert alert-danger rounded-4 border-0">${escapeHtml(result.message)}</div>`;
                    // Reset button state on error
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalText;
                    return;
                }

                // Success - check auth state and redirect if needed
                console.log("Login successful, checking auth state...");
                window.location.href = "dashboard.html";
                // Reset button state
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            } catch (error) {
                console.error("Login error:", error);
                const host = document.getElementById("loginAlert");
                host.innerHTML = `<div class="alert alert-danger rounded-4 border-0">Login failed: ${escapeHtml(error.message)}</div>`;
                // Reset button state on error
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            }
        });
    }

    async function renderDashboard() {
        if (document.body.dataset.page !== "dashboard" || !Smassdeal.orders || !Smassdeal.investments) {
            return;
        }

        const monthForm = document.getElementById("dashboardMonthForm");
        const monthInput = document.getElementById("dashboardMonth");
        const statsHost = document.getElementById("dashboardStats");
        const recentOrdersTableBody = document.getElementById("recentOrdersTableBody");
        const quickInsightValue = document.getElementById("quickInsightValue");
        const quickInsightText = document.getElementById("quickInsightText");
        const recentOrdersSubtitle = document.getElementById("recentOrdersSubtitle");

        if (!monthForm || !monthInput || !statsHost || !recentOrdersTableBody) {
            return;
        }

        const selectedMonth = window.localStorage.getItem(DASHBOARD_MONTH_KEY) || await Smassdeal.orders.getLatestMonth();
        monthInput.value = selectedMonth;

        async function draw(monthValue) {
            const monthLabel = formatMonthLabel(monthValue);
            const orders = (await Smassdeal.orders.getOrders()).filter((order) => String(order.currentDate).slice(0, 7) === monthValue);
            const investments = (await Smassdeal.investments.getInvestments()).filter((investment) => String(investment.currentDate).slice(0, 7) === monthValue);

            const totalOrders = orders.length;
            const totalRevenue = orders.reduce((sum, order) => sum + Number(order.userPaidPrice || 0), 0);
            const totalInvestment = investments.reduce((sum, investment) => sum + Number(investment.price || 0), 0);
            const totalProfit = orders.reduce((sum, order) => sum + Number(order.profit || 0), 0);

            const statCards = [
                {
                    label: "Total Orders",
                    value: Number(totalOrders).toLocaleString("en-IN"),
                    icon: "bi-bag-check",
                    note: `Orders for ${monthLabel}`
                },
                {
                    label: "Total Revenue",
                    value: formatCurrency(totalRevenue),
                    icon: "bi-currency-rupee",
                    note: `Received payments for ${monthLabel}`
                },
                {
                    label: "Total Investment",
                    value: formatCurrency(totalInvestment),
                    icon: "bi-wallet2",
                    note: `Investments for ${monthLabel}`
                },
                {
                    label: "Total Profit",
                    value: formatCurrency(totalProfit),
                    icon: "bi-graph-up-arrow",
                    note: `Paid amount minus order cost for ${monthLabel}`
                }
            ];

            statsHost.innerHTML = statCards.map((card) => `
                <div class="col-md-6 col-xl-3">
                    <div class="panel-card metric-card p-4 h-100">
                        <div class="d-flex align-items-start justify-content-between gap-3">
                            <div>
                                <div class="metric-caption fw-semibold mb-2">${card.label}</div>
                                <div class="h2 fw-bold metric-value mb-2">${card.value}</div>
                                <div class="small text-secondary">${card.note}</div>
                            </div>
                            <span class="stat-icon">
                                <i class="bi ${card.icon}"></i>
                            </span>
                        </div>
                    </div>
                </div>
            `).join("");

            quickInsightValue.textContent = formatCurrency(totalProfit);
            quickInsightText.textContent = `${monthLabel} total profit based on paid amount minus order cost.`;
            recentOrdersSubtitle.textContent = `The last five orders from ${monthLabel}.`;

            const recentOrders = [...orders]
                .sort((left, right) => new Date(right.currentDate) - new Date(left.currentDate))
                .slice(0, 5);

            if (!recentOrders.length) {
                recentOrdersTableBody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-secondary">No orders found yet.</td></tr>';
                return;
            }

            recentOrdersTableBody.innerHTML = recentOrders.map((order) => `
                <tr>
                    <td>
                        <div class="fw-semibold">${escapeHtml(order.name)}</div>
                        <div class="small text-secondary">${order.deliveryDate ? `Delivery ${formatDate(order.deliveryDate)}` : "No delivery date"}</div>
                    </td>
                    <td><span class="order-type-pill">${escapeHtml(order.orderType)}</span></td>
                    <td>${formatDate(order.currentDate)}</td>
                    <td><span class="badge-soft">${capitalize(order.orderStatus || "pending")}</span></td>
                    <td>${formatCurrency(order.userPaidPrice)}</td>
                    <td class="${order.profit < 0 ? "text-danger" : ""}">${formatCurrency(order.profit)}</td>
                </tr>
            `).join("");
        }

        monthForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const nextMonth = monthInput.value || await Smassdeal.orders.getLatestMonth();
            window.localStorage.setItem(DASHBOARD_MONTH_KEY, nextMonth);
            await draw(nextMonth);
        });

        await draw(selectedMonth);
    }

    async function bootProtectedPage() {
        if (document.body.dataset.guard !== "auth" || !Smassdeal.auth) {
            return true;
        }

        await Smassdeal.auth.waitForAuthState();

        const allowedRoles = String(document.body.dataset.allowedRoles || "")
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean);

        if (!Smassdeal.auth.requireAuth(allowedRoles)) {
            return false;
        }

        return true;
    }

    Smassdeal.ui = {
        escapeHtml,
        capitalize,
        formatCurrency,
        formatDate,
        formatMonthLabel,
        renderFlash
    };

    document.addEventListener("DOMContentLoaded", async () => {
        console.log("UI: DOMContentLoaded fired, initializing UI...");

        // Wait for Firebase and auth to be ready
        await new Promise((resolve) => {
            const checkReady = () => {
                if (Smassdeal.firebase && Smassdeal.auth) {
                    console.log("UI: Firebase and auth ready");
                    resolve();
                } else {
                    console.log("UI: Waiting for Firebase and auth...");
                    setTimeout(checkReady, 50);
                }
            };
            checkReady();
        });

        await Smassdeal.auth.waitForAuthState();

        if (document.body.dataset.page === "login" && Smassdeal.auth.isAuthenticated()) {
            console.log("UI: Authenticated user detected on login page, redirecting to dashboard");
            window.location.href = "dashboard.html";
            return;
        }

        console.log("UI: Starting bindLoginForm");
        bindLoginForm();

        console.log("UI: Checking bootProtectedPage");
        if (!await bootProtectedPage()) {
            console.log("UI: bootProtectedPage returned false, stopping initialization");
            return;
        }

        console.log("UI: Continuing with protected page initialization");
        populateUserProfile();
        applyRoleVisibility();
        highlightNavigation();
        bindThemeToggle();
        bindLogout();
        renderFlash();
        await renderDashboard();

        if (Smassdeal.orders) {
            await Smassdeal.orders.initOrdersPage();
        }

        if (Smassdeal.investments) {
            await Smassdeal.investments.initInvestmentsPage();
        }

        if (Smassdeal.logs) {
            await Smassdeal.logs.initLogsPage();
        }

        if (Smassdeal.subadmins) {
            await Smassdeal.subadmins.initSubAdminsPage();
        }

        if (Smassdeal.profile) {
            await Smassdeal.profile.initProfilePage();
        }
    });
})(window, document);
