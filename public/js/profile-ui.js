import {
    getProfile,
    updateProfile,
} from "./rpc.js";

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
];


function getInitials(name = "User") {
    return String(name)
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join("");
}


function showProfileMessage(messageBox, message, type = "error") {
    if (!messageBox) return;

    messageBox.textContent = message;
    messageBox.hidden = !message;
    messageBox.className = `profile-message ${type}`;
}


function readPhotoAsDataUrl(file) {
    if (!file) {
        return Promise.resolve("");
    }

    if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
        return Promise.reject(
            new Error("Choose a JPG, PNG, or WebP image.")
        );
    }

    if (file.size > MAX_PHOTO_BYTES) {
        return Promise.reject(
            new Error("Profile photo must be 2 MB or smaller.")
        );
    }

    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.addEventListener("load", () => {
            resolve(reader.result);
        });

        reader.addEventListener("error", () => {
            reject(new Error("Could not read the selected photo."));
        });

        reader.readAsDataURL(file);
    });
}


function getPhotoUrl(photoPath) {
    if (!photoPath) return "";

    if (
        photoPath.startsWith("http://") ||
        photoPath.startsWith("https://") ||
        photoPath.startsWith("data:") ||
        photoPath.startsWith("/")
    ) {
        return photoPath;
    }

    return `/${photoPath.replace(/^\.?\//, "")}`;
}


export function initializeProfileUI({
    profile,
    onProfileUpdated = () => {},
} = {}) {
    const openButton = document.getElementById("profile-open-button");
    const dialog = document.getElementById("profile-dialog");
    const closeButton = document.getElementById("profile-close-button");
    const cancelButton = document.getElementById("profile-cancel-button");
    const form = document.getElementById("profile-form");
    const messageBox = document.getElementById("profile-message");

    const nameInput = document.getElementById("profile-name");
    const emailInput = document.getElementById("profile-email");
    const idInput = document.getElementById("profile-id");
    const phoneInput = document.getElementById("profile-phone");
    const departmentInput = document.getElementById(
        "profile-department"
    );
    const photoInput = document.getElementById("profile-photo");
    const photoPreview = document.getElementById(
        "profile-photo-preview"
    );
    const photoFallback = document.getElementById(
        "profile-photo-fallback"
    );
    const saveButton = document.getElementById("profile-save-button");

    if (
        !openButton ||
        !dialog ||
        !form ||
        !nameInput ||
        !emailInput ||
        !idInput ||
        !phoneInput ||
        !departmentInput ||
        !photoInput ||
        !photoPreview ||
        !photoFallback ||
        !saveButton
    ) {
        console.error("The profile form is missing an expected element.");
        return;
    }

    function fillProfile(user) {
        nameInput.value = user.full_name || "";
        emailInput.value = user.email || "";
        idInput.value = user.student_id || "";
        phoneInput.value = user.phone_number || "";
        departmentInput.value = user.department || "";

        const photoUrl = getPhotoUrl(user.photo_path);

        if (photoUrl) {
            photoPreview.src = photoUrl;
            photoPreview.hidden = false;
            photoFallback.hidden = true;
        } else {
            photoPreview.removeAttribute("src");
            photoPreview.hidden = true;
            photoFallback.textContent = getInitials(user.full_name);
            photoFallback.hidden = false;
        }
    }

    if (profile) {
        fillProfile(profile);
    }

    openButton.addEventListener("click", async () => {
        showProfileMessage(messageBox, "");

        try {
            const freshProfile = await getProfile();
            fillProfile(freshProfile);
            dialog.showModal();
        } catch (error) {
            showProfileMessage(
                messageBox,
                error.message || "Could not load your profile."
            );
            dialog.showModal();
        }
    });

    closeButton?.addEventListener("click", () => {
        dialog.close();
    });

    cancelButton?.addEventListener("click", () => {
        dialog.close();
    });

    dialog.addEventListener("click", (event) => {
        if (event.target === dialog) {
            dialog.close();
        }
    });

    photoInput.addEventListener("change", () => {
        const file = photoInput.files[0];

        if (!file) {
            return;
        }

        if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
            photoInput.value = "";
            showProfileMessage(
                messageBox,
                "Choose a JPG, PNG, or WebP image."
            );
            return;
        }

        if (file.size > MAX_PHOTO_BYTES) {
            photoInput.value = "";
            showProfileMessage(
                messageBox,
                "Profile photo must be 2 MB or smaller."
            );
            return;
        }

        photoPreview.src = URL.createObjectURL(file);
        photoPreview.hidden = false;
        photoFallback.hidden = true;
        showProfileMessage(messageBox, "");
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        showProfileMessage(messageBox, "");

        saveButton.disabled = true;
        saveButton.textContent = "Saving...";

        try {
            const photoData = await readPhotoAsDataUrl(
                photoInput.files[0]
            );

            const updatedProfile = await updateProfile({
                full_name: nameInput.value.trim(),
                phone_number: phoneInput.value.trim(),
                department: departmentInput.value.trim(),
                photo_data: photoData,
            });

            fillProfile(updatedProfile);
            onProfileUpdated(updatedProfile);

            photoInput.value = "";

            showProfileMessage(
                messageBox,
                "Profile updated successfully.",
                "success"
            );
        } catch (error) {
            showProfileMessage(
                messageBox,
                error.message || "Could not update your profile."
            );
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = "Save changes";
        }
    });
}