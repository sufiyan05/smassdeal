(function (window) {
    const Smassdeal = window.Smassdeal || (window.Smassdeal = {});
    const FLASH_STORAGE_KEY = "smassdeal-flash";

    let currentUser = null;
    let authInitialized = false;
    let authStateListenerAttached = false;
    let authStateResolved = false;
    let resolveInitialAuthState = () => {};
    let persistencePromise = Promise.resolve();
    const initialAuthStatePromise = new Promise((resolve) => {
        resolveInitialAuthState = resolve;
    });

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

    function setFlash(message, type) {
        writeJSON(FLASH_STORAGE_KEY, {
            message,
            type: type || "success",
            createdAt: Date.now()
        });
    }

    function formatName(email) {
        const base = String(email || "")
            .split("@")[0]
            .replace(/[._-]+/g, " ")
            .trim();

        if (!base) {
            return "SMASSDEAL Admin";
        }

        return base.replace(/\b\w/g, (char) => char.toUpperCase());
    }

    function getCurrentUser() {
        return currentUser;
    }

    function normalizeSubAdminRecord(data) {
        if (!data) {
            return null;
        }

        return {
            id: data.id || "",
            email: String(data.email || "").trim().toLowerCase(),
            authUid: String(data.authUid || "").trim(),
            status: String(data.status || "active").trim().toLowerCase(),
            role: "subadmin"
        };
    }

    async function findSubAdminRecord(user) {
        try {
            const db = Smassdeal.firebase.getDb();
            if (!db || !user) {
                return null;
            }

            const subAdminsRef = window.firebase.collection(db, "subadmins");
            if (user.uid) {
                const byUid = await window.firebase.getDocs(
                    window.firebase.query(subAdminsRef, window.firebase.where("authUid", "==", user.uid))
                );

                if (!byUid.empty) {
                    const item = byUid.docs[0];
                    return normalizeSubAdminRecord({ id: item.id, ...item.data() });
                }
            }

            if (user.email) {
                const byEmail = await window.firebase.getDocs(
                    window.firebase.query(subAdminsRef, window.firebase.where("email", "==", String(user.email).trim().toLowerCase()))
                );

                if (!byEmail.empty) {
                    const item = byEmail.docs[0];
                    return normalizeSubAdminRecord({ id: item.id, ...item.data() });
                }
            }

            return null;
        } catch (error) {
            console.error("Error resolving sub admin role:", error);
            return null;
        }
    }

    async function resolveUserAccess(user) {
        const subAdminRecord = await findSubAdminRecord(user);

        if (subAdminRecord) {
            return {
                role: "subadmin",
                subAdminRecord
            };
        }

        return {
            role: "admin",
            subAdminRecord: null
        };
    }

    async function buildCurrentUser(user, fallbackEmail) {
        if (!user) {
            return null;
        }

        const email = user.email || fallbackEmail || "";
        const access = await resolveUserAccess(user);
        return {
            uid: user.uid,
            name: user.displayName || formatName(email),
            email,
            role: access.role,
            roleLabel: access.role === "subadmin" ? "Sub Admin" : "Admin",
            subAdminRecord: access.subAdminRecord,
            loginAt: new Date().toISOString(),
            emailVerified: user.emailVerified
        };
    }

    function emitAuthStateChanged() {
        window.dispatchEvent(new CustomEvent("authStateChanged", {
            detail: { user: currentUser }
        }));
    }

    function isAuthenticated() {
        return Boolean(currentUser);
    }

    function hasRole(role) {
        return Boolean(currentUser) && currentUser.role === role;
    }

    function hasAnyRole(roles) {
        if (!currentUser || !Array.isArray(roles) || !roles.length) {
            return false;
        }

        return roles.includes(currentUser.role);
    }

    function waitForAuthState() {
        return initialAuthStatePromise;
    }

    function hasResolvedAuthState() {
        return authStateResolved;
    }

    async function login(credentials) {
        const email = String(credentials.email || "").trim().toLowerCase();
        const password = String(credentials.password || "");

        console.log("Login attempt for:", email);

        if (!email || !email.includes("@")) {
            return {
                ok: false,
                message: "Enter a valid email address to continue."
            };
        }

        if (password.length < 6) {
            return {
                ok: false,
                message: "Enter a password with at least 6 characters."
            };
        }

        try {
            console.log("Firebase auth object:", Smassdeal.firebase.getAuth());
            const auth = Smassdeal.firebase.getAuth();
            await persistencePromise;
            console.log("Attempting sign in...");
            const userCredential = await window.firebase.signInWithEmailAndPassword(auth, email, password);
            console.log("Sign in successful:", userCredential.user.email);

            const user = await buildCurrentUser(userCredential.user, email);

            currentUser = user;
            setFlash("Login successful. Welcome back.", "success");

            return {
                ok: true,
                user
            };
        } catch (error) {
            console.error("Login error:", error);
            console.error("Error code:", error.code);
            console.error("Error message:", error.message);

            let message = "Login failed. Please try again.";
            switch (error.code) {
                case 'auth/user-not-found':
                    message = "No account found with this email address.";
                    break;
                case 'auth/wrong-password':
                    message = "Incorrect password. Please try again.";
                    break;
                case 'auth/invalid-email':
                    message = "Invalid email address format.";
                    break;
                case 'auth/user-disabled':
                    message = "This account has been disabled.";
                    break;
                case 'auth/too-many-requests':
                    message = "Too many failed login attempts. Please try again later.";
                    break;
                case 'auth/network-request-failed':
                    message = "Network error. Please check your connection.";
                    break;
                default:
                    message = `Login failed: ${error.message}`;
            }

            return {
                ok: false,
                message
            };
        }
    }

    async function updateProfileDetails(profileData) {
        const name = String(profileData.name || "").trim();

        if (name.length < 2) {
            return {
                ok: false,
                message: "Enter a valid name with at least 2 characters."
            };
        }

        try {
            const auth = Smassdeal.firebase.getAuth();
            const authUser = auth && auth.currentUser;

            if (!authUser) {
                return {
                    ok: false,
                    message: "No authenticated user found. Please sign in again."
                };
            }

            await window.firebase.updateProfile(authUser, { displayName: name });
            currentUser = await buildCurrentUser(authUser);
            emitAuthStateChanged();

            return {
                ok: true,
                user: currentUser,
                message: "Profile updated successfully."
            };
        } catch (error) {
            console.error("Profile update error:", error);
            return {
                ok: false,
                message: `Profile update failed: ${error.message}`
            };
        }
    }

    async function changePassword(passwordData) {
        const currentPassword = String(passwordData.currentPassword || "");
        const newPassword = String(passwordData.newPassword || "");
        const confirmPassword = String(passwordData.confirmPassword || "");

        if (!currentPassword) {
            return {
                ok: false,
                message: "Enter your current password to continue."
            };
        }

        if (newPassword.length < 6) {
            return {
                ok: false,
                message: "New password must be at least 6 characters long."
            };
        }

        if (newPassword !== confirmPassword) {
            return {
                ok: false,
                message: "New password and confirm password do not match."
            };
        }

        try {
            const auth = Smassdeal.firebase.getAuth();
            const authUser = auth && auth.currentUser;

            if (!authUser || !authUser.email) {
                return {
                    ok: false,
                    message: "No authenticated user found. Please sign in again."
                };
            }

            const credential = window.firebase.EmailAuthProvider.credential(authUser.email, currentPassword);
            await window.firebase.reauthenticateWithCredential(authUser, credential);
            await window.firebase.updatePassword(authUser, newPassword);

            return {
                ok: true,
                message: "Password changed successfully."
            };
        } catch (error) {
            console.error("Password change error:", error);

            let message = "Password change failed. Please try again.";
            switch (error.code) {
                case "auth/wrong-password":
                case "auth/invalid-credential":
                    message = "Your current password is incorrect.";
                    break;
                case "auth/weak-password":
                    message = "Your new password is too weak.";
                    break;
                case "auth/too-many-requests":
                    message = "Too many attempts. Please try again later.";
                    break;
                default:
                    message = `Password change failed: ${error.message}`;
            }

            return {
                ok: false,
                message
            };
        }
    }

    async function logout() {
        try {
            const auth = Smassdeal.firebase.getAuth();
            await window.firebase.signOut(auth);
            currentUser = null;
            setFlash("You have been logged out.", "info");
            window.location.href = "index.html";
        } catch (error) {
            console.error("Logout error:", error);
            // Force logout even if Firebase signOut fails
            currentUser = null;
            setFlash("You have been logged out.", "info");
            window.location.href = "index.html";
        }
    }

    function requireAuth(allowedRoles) {
        if (!isAuthenticated()) {
            setFlash("Please sign in to access the admin panel.", "warning");
            window.location.href = "index.html";
            return false;
        }

        if (Array.isArray(allowedRoles) && allowedRoles.length && !hasAnyRole(allowedRoles)) {
            setFlash("You do not have permission to access that page.", "warning");
            window.location.href = "dashboard.html";
            return false;
        }

        return true;
    }

    function redirectIfAuthenticated() {
        if (isAuthenticated()) {
            window.location.href = "dashboard.html";
            return true;
        }

        return false;
    }

    function initAuthStateListener() {
        if (authInitialized) return;

        // Wait for Firebase to be initialized
        if (!Smassdeal.firebase || !Smassdeal.firebase.getAuth) {
            console.log("Firebase not ready, waiting...");
            setTimeout(initAuthStateListener, 100);
            return;
        }

        console.log("Initializing auth state listener...");
        const auth = Smassdeal.firebase.getAuth();

        // Set persistence to local storage to maintain auth state across browser sessions
        persistencePromise = window.firebase.setPersistence(auth, window.firebase.browserLocalPersistence).then(() => {
            console.log("Firebase auth persistence set to local storage");
        }).catch((error) => {
            console.error("Error setting auth persistence:", error);
        });

        // Prevent multiple listeners
        if (authStateListenerAttached) {
            console.log("Auth state listener already attached, skipping");
            return;
        }
        authStateListenerAttached = true;

        window.firebase.onAuthStateChanged(auth, async (user) => {
            console.log("Auth state changed:", user ? `User: ${user.email}` : "No user");
            if (user) {
                currentUser = await buildCurrentUser(user);
                console.log("Current user set:", currentUser);
            } else {
                currentUser = null;
                console.log("Current user cleared");
            }

            if (!authStateResolved) {
                authStateResolved = true;
                resolveInitialAuthState(currentUser);
            }

            // Dispatch custom event for auth state changes
            emitAuthStateChanged();
        });

        authInitialized = true;
        console.log("Auth state listener initialized");
    }

    // Initialize auth state listener when the module loads
    initAuthStateListener();

    Smassdeal.auth = {
        getCurrentUser,
        isAuthenticated,
        hasRole,
        hasAnyRole,
        login,
        logout,
        requireAuth,
        redirectIfAuthenticated,
        updateProfileDetails,
        changePassword,
        setFlash,
        initAuthStateListener,
        waitForAuthState,
        hasResolvedAuthState
    };

    console.log("Smassdeal.auth initialized:", !!Smassdeal.auth);
})(window);
