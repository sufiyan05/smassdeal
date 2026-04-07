(function (window) {
    const Smassdeal = window.Smassdeal || (window.Smassdeal = {});

    const firebase = {
        config: {
            apiKey: "AIzaSyDKEsnaS0THAQmM-Aspp5yShZcDe3y14gA",
            authDomain: "smassdeal-52ad8.firebaseapp.com",
            projectId: "smassdeal-52ad8",
            storageBucket: "smassdeal-52ad8.firebasestorage.app",
            messagingSenderId: "78784437581",
            appId: "1:78784437581:web:1e6f0f211a9b50b0b8ab04",
            measurementId: "G-MNRKM5QS29"
        },

        app: null,
        auth: null,
        db: null,

        isConfigured() {
            return !Object.values(this.config).some((value) => String(value).startsWith("YOUR_"));
        },

        initializeFirebase() {
            if (!this.isConfigured()) {
                return {
                    ready: false,
                    message: "Firebase config placeholder detected. Local demo storage is active."
                };
            }

            try {
                if (!this.app) {
                    console.log("Initializing Firebase app...");
                    this.app = window.firebase.initializeApp(this.config);
                    console.log("Firebase app initialized");
                    this.auth = window.firebase.getAuth(this.app);
                    console.log("Firebase auth initialized");
                    this.db = window.firebase.getFirestore(this.app);
                    console.log("Firebase firestore initialized");
                }
                return {
                    ready: true,
                    message: "Firebase initialized successfully."
                };
            } catch (error) {
                console.error("Firebase initialization error:", error);
                return {
                    ready: false,
                    message: `Firebase initialization failed: ${error.message}`
                };
            }
        },

        getAuth() {
            return this.auth;
        },

        getDb() {
            return this.db;
        }
    };

    Smassdeal.firebase = firebase;

    // Auto-initialize Firebase when the script loads
    const initResult = firebase.initializeFirebase();
    if (initResult.ready) {
        console.log("Firebase initialized:", initResult.message);
        // Make sure Smassdeal.firebase is set
        if (!window.Smassdeal) window.Smassdeal = {};
        window.Smassdeal.firebase = firebase;
        console.log("Smassdeal.firebase set:", !!window.Smassdeal.firebase);
    } else {
        console.warn("Firebase initialization failed:", initResult.message);
    }
})(window);
