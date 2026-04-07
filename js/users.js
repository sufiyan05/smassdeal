(function (window) {
    const Smassdeal = window.Smassdeal || (window.Smassdeal = {});

    function normalizeUserRecord(data, id) {
        if (!data) {
            return null;
        }

        return {
            id: String(id || data.authUid || "").trim(),
            email: String(data.email || "").trim().toLowerCase(),
            name: String(data.name || "").trim(),
            role: String(data.role || "subadmin").trim().toLowerCase() === "admin" ? "admin" : "subadmin",
            status: String(data.status || "active").trim().toLowerCase(),
            createdAt: data.createdAt || null,
            updatedAt: data.updatedAt || null,
            phone: String(data.phone || "").trim(),
            notes: String(data.notes || "").trim()
        };
    }

    function buildUserPayload(data, overrides) {
        const source = data && typeof data === "object" ? data : {};
        const options = overrides || {};
        const { authUid, ...rest } = source;

        return {
            ...rest,
            email: String(options.email != null ? options.email : rest.email || "").trim().toLowerCase(),
            name: String(options.name != null ? options.name : rest.name || "").trim(),
            role: String(options.role != null ? options.role : rest.role || "subadmin").trim().toLowerCase() === "admin"
                ? "admin"
                : "subadmin",
            status: String(options.status != null ? options.status : rest.status || "active").trim().toLowerCase(),
            createdAt: options.createdAt !== undefined ? options.createdAt : (rest.createdAt || new Date())
        };
    }

    function getDb() {
        return Smassdeal.firebase && typeof Smassdeal.firebase.getDb === "function"
            ? Smassdeal.firebase.getDb()
            : null;
    }

    async function getUserByAuthUid(authUid) {
        const db = getDb();
        const uid = String(authUid || "").trim();
        if (!db || !uid) {
            return null;
        }

        const userRef = window.firebase.doc(db, "users", uid);
        const userSnapshot = await window.firebase.getDoc(userRef);
        return userSnapshot.exists() ? normalizeUserRecord(userSnapshot.data(), userSnapshot.id) : null;
    }

    async function findUserRecord(user) {
        try {
            const db = getDb();
            if (!db || !user) {
                return null;
            }

            if (user.uid) {
                const userByUid = await getUserByAuthUid(user.uid);
                if (userByUid) {
                    return userByUid;
                }
            }

            if (user.email) {
                const usersRef = window.firebase.collection(db, "users");
                const byEmail = await window.firebase.getDocs(
                    window.firebase.query(usersRef, window.firebase.where("email", "==", String(user.email).trim().toLowerCase()))
                );

                if (!byEmail.empty) {
                    const item = byEmail.docs[0];
                    return normalizeUserRecord(item.data(), item.id);
                }
            }

            return null;
        } catch (error) {
            console.error("Error resolving user record from users collection:", error);
            return null;
        }
    }

    async function upsertUser(authUid, data, options) {
        const db = getDb();
        const uid = String(authUid || "").trim();
        if (!db) {
            throw new Error("Firebase not initialized");
        }

        if (!uid) {
            throw new Error("Missing authUid for users collection sync.");
        }

        const userRef = window.firebase.doc(db, "users", uid);
        const payload = buildUserPayload(data, options);

        if (options && options.merge === false) {
            await window.firebase.setDoc(userRef, payload);
        } else {
            await window.firebase.setDoc(userRef, payload, { merge: true });
        }

        return normalizeUserRecord(payload, uid);
    }

    async function removeUserByAuthUid(authUid) {
        const db = getDb();
        const uid = String(authUid || "").trim();
        if (!db || !uid) {
            return false;
        }

        const userRef = window.firebase.doc(db, "users", uid);
        await window.firebase.deleteDoc(userRef);
        return true;
    }

    Smassdeal.users = {
        getUserByAuthUid,
        findUserRecord,
        upsertUser,
        removeUserByAuthUid
    };
})(window);
