(function (window, document) {
    const Smassdeal = window.Smassdeal || (window.Smassdeal = {});

    async function initProfilePage() {
        if (document.body.dataset.page !== "profile" || !Smassdeal.auth) {
            return;
        }

        const profileForm = document.getElementById("profileDetailsForm");
        const passwordForm = document.getElementById("profilePasswordForm");
        const nameInput = document.getElementById("profileName");
        const emailInput = document.getElementById("profileEmail");
        const profileAlert = document.getElementById("profileAlert");
        const passwordAlert = document.getElementById("passwordAlert");

        if (!profileForm || !passwordForm || !nameInput || !emailInput) {
            return;
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

        bindPasswordToggle("toggleCurrentPassword", "currentPassword", "toggleCurrentPasswordIcon");
        bindPasswordToggle("toggleNewPassword", "newPassword", "toggleNewPasswordIcon");
        bindPasswordToggle("toggleConfirmPassword", "confirmPassword", "toggleConfirmPasswordIcon");

        function renderUser() {
            const user = Smassdeal.auth.getCurrentUser();
            if (!user) {
                return;
            }

            nameInput.value = user.name || "";
            emailInput.value = user.email || "";
        }

        renderUser();

        window.addEventListener("authStateChanged", () => {
            renderUser();
        });

        profileForm.addEventListener("submit", async (event) => {
            event.preventDefault();

            const submitButton = profileForm.querySelector('button[type="submit"]');
            const originalText = submitButton.textContent;
            submitButton.disabled = true;
            submitButton.textContent = "Saving...";

            const result = await Smassdeal.auth.updateProfileDetails({
                name: nameInput.value
            });

            profileAlert.innerHTML = `<div class="alert alert-${result.ok ? "success" : "danger"}">${Smassdeal.ui.escapeHtml(result.message)}</div>`;

            submitButton.disabled = false;
            submitButton.textContent = originalText;
        });

        passwordForm.addEventListener("submit", async (event) => {
            event.preventDefault();

            const submitButton = passwordForm.querySelector('button[type="submit"]');
            const originalText = submitButton.textContent;
            submitButton.disabled = true;
            submitButton.textContent = "Updating...";

            const result = await Smassdeal.auth.changePassword({
                currentPassword: document.getElementById("currentPassword").value,
                newPassword: document.getElementById("newPassword").value,
                confirmPassword: document.getElementById("confirmPassword").value
            });

            passwordAlert.innerHTML = `<div class="alert alert-${result.ok ? "success" : "danger"}">${Smassdeal.ui.escapeHtml(result.message)}</div>`;

            if (result.ok) {
                passwordForm.reset();
            }

            submitButton.disabled = false;
            submitButton.textContent = originalText;
        });
    }

    Smassdeal.profile = {
        initProfilePage
    };
})(window, document);
