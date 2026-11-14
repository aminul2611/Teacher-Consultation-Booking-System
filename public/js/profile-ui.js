import { getProfile, updateProfile } from "./rpc.js";

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const initializedButtons = new WeakSet();

function initials(name = "User") {
    return String(name)
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() || "")
        .join("") || "U";
}

function photoUrl(path) {
    if (!path) return "";
    if (/^(https?:|data:|\/)/i.test(path)) return path;
    return `/${path.replace(/^\.?\//, "")}`;
}

function addStyles() {
    if (document.getElementById("profile-dialog-styles")) return;

    const style = document.createElement("style");
    style.id = "profile-dialog-styles";
    style.textContent = `
        .profile-dialog {
            width: min(92vw, 540px);
            max-height: 90vh;
            padding: 0;
            border: 0;
            border-radius: 20px;
            color: #173653;
            box-shadow: 0 24px 70px #102b4640;
        }
        .profile-dialog::backdrop {
            background: #10243c88;
            backdrop-filter: blur(3px);
        }
        .profile-dialog-inner { padding: 26px; }
        .profile-dialog-header {
            display: flex;
            justify-content: space-between;
            gap: 14px;
            margin-bottom: 20px;
        }
        .profile-dialog-header h2 { margin: 0 0 6px; }
        .profile-dialog-header p { margin: 0; color: #718096; }
        .profile-close {
            border: 0;
            background: none;
            color: #52677d;
            font-size: 28px;
            cursor: pointer;
        }
        .profile-photo-row {
            display: flex;
            align-items: center;
            gap: 16px;
            margin-bottom: 20px;
        }
        .profile-photo-preview,
        .profile-photo-fallback {
            width: 76px;
            height: 76px;
            flex: 0 0 76px;
            border-radius: 50%;
            object-fit: cover;
            background: #e8f1ff;
            color: #1767c2;
            display: grid;
            place-items: center;
            font-weight: 700;
            font-size: 23px;
        }
        .profile-fields {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 14px;
        }
        .profile-field {
            display: grid;
            gap: 6px;
            min-width: 0;
        }
        .profile-field-wide { grid-column: 1 / -1; }
        .profile-field label { font-size: 13px; font-weight: 650; }
        .profile-field input {
            box-sizing: border-box;
            width: 100%;
            min-height: 42px;
            padding: 10px 12px;
            border: 1px solid #d4deeb;
            border-radius: 9px;
            font: inherit;
        }
        .profile-field input[readonly] {
            background: #f3f6fa;
            color: #718096;
        }
        .profile-message {
            margin: 14px 0 0;
            color: #b42318;
            font-size: 14px;
        }
        .profile-message.success { color: #16794b; }
        .profile-actions {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            margin-top: 20px;
        }
        .profile-actions button {
            min-height: 42px;
            padding: 0 16px;
            border: 1px solid #d4deeb;
            border-radius: 9px;
            background: #fff;
            color: #173653;
            font: inherit;
            font-weight: 650;
            cursor: pointer;
        }
        .profile-actions #profile-save-button {
            border-color: #2678d4;
            background: #2678d4;
            color: #fff;
        }
        .profile-actions button:disabled {
            opacity: .65;
            cursor: wait;
        }
        @media (max-width: 520px) {
            .profile-fields { grid-template-columns: 1fr; }
            .profile-field-wide { grid-column: auto; }
            .profile-dialog-inner { padding: 20px; }
        }
    `;
    document.head.append(style);
}

function createDialog() {
    let dialog = document.getElementById("profile-dialog");
    if (dialog) return dialog;

    addStyles();

    dialog = document.createElement("dialog");
    dialog.id = "profile-dialog";
    dialog.className = "profile-dialog";
    dialog.innerHTML = `
        <div class="profile-dialog-inner">
            <div class="profile-dialog-header">
                <div>
                    <h2>My profile</h2>
                    <p>Edit your profile details.</p>
                </div>
                <button
                    id="profile-close-button"
                    class="profile-close"
                    type="button"
                    aria-label="Close"
                >&times;</button>
            </div>

            <form id="profile-form">
                <div class="profile-photo-row">
                    <img
                        id="profile-photo-preview"
                        class="profile-photo-preview"
                        alt="Profile photo"
                        hidden
                    >
                    <div
                        id="profile-photo-fallback"
                        class="profile-photo-fallback"
                    >U</div>
                    <div class="profile-field">
                        <label for="profile-photo">Profile photo</label>
                        <input
                            id="profile-photo"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                        >
                        <small>JPG, PNG, or WebP; maximum 2 MB.</small>
                    </div>
                </div>

                <div class="profile-fields">
                    <div class="profile-field profile-field-wide">
                        <label for="profile-name">Full name</label>
                        <input id="profile-name" maxlength="120" required>
                    </div>

                    <div class="profile-field profile-field-wide">
                        <label for="profile-email">Email address</label>
                        <input id="profile-email" type="email" readonly>
                    </div>

                    <div class="profile-field">
                        <label for="profile-id" id="profile-id-label">ID</label>
                        <input id="profile-id" readonly>
                    </div>

                    <div class="profile-field">
                        <label for="profile-phone">Phone number</label>
                        <input id="profile-phone" type="tel" maxlength="30">
                    </div>

                    <div class="profile-field profile-field-wide">
                        <label for="profile-department">Department</label>
                        <input id="profile-department" maxlength="120">
                    </div>
                </div>

                <p
                    id="profile-message"
                    class="profile-message"
                    role="status"
                    aria-live="polite"
                    hidden
                ></p>

                <div class="profile-actions">
                    <button id="profile-cancel-button" type="button">
                        Cancel
                    </button>
                    <button id="profile-save-button" type="submit">
                        Save changes
                    </button>
                </div>
            </form>
        </div>`;

    document.body.append(dialog);
    return dialog;
}

function renderHeader(user) {
    const avatarId =
        user.role === "teacher" ? "teacher-avatar" : "student-avatar";

    const avatar =
        document.getElementById(avatarId) ||
        document.getElementById("profile-avatar");

    const nameId =
        user.role === "teacher" ? "teacher-name" : "student-name";
    const name = document.getElementById(nameId);

    if (name) {
        name.textContent = user.full_name || "User";
    }

    if (!avatar) return;

    avatar.replaceChildren();

    const url = photoUrl(user.photo_path);

    if (!url) {
        avatar.textContent = initials(user.full_name);
        return;
    }

    const image = document.createElement("img");
    image.src = url;
    image.alt = `${user.full_name || "User"}'s profile photo`;

    image.addEventListener("error", () => {
        avatar.replaceChildren();
        avatar.textContent = initials(user.full_name);
    });

    avatar.append(image);
}

function readPhoto(file) {
    if (!file) return Promise.resolve("");

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

export function initializeProfileUI({
    profile = null,
    onProfileUpdated = () => {},
} = {}) {
    const openButton = document.getElementById("profile-open-button");

    if (!openButton || initializedButtons.has(openButton)) return;
    initializedButtons.add(openButton);

    const dialog = createDialog();
    const form = document.getElementById("profile-form");
    const message = document.getElementById("profile-message");
    const photoInput = document.getElementById("profile-photo");
    const preview = document.getElementById("profile-photo-preview");
    const fallback = document.getElementById("profile-photo-fallback");
    const saveButton = document.getElementById("profile-save-button");

    const nameInput = document.getElementById("profile-name");
    const emailInput = document.getElementById("profile-email");
    const idLabel = document.getElementById("profile-id-label");
    const idInput = document.getElementById("profile-id");
    const phoneInput = document.getElementById("profile-phone");
    const departmentInput = document.getElementById("profile-department");

    function showMessage(text, type = "error") {
        message.textContent = text;
        message.hidden = !text;
        message.className = `profile-message ${type}`;
    }

    function fill(user) {
        nameInput.value = user.full_name || "";
        emailInput.value = user.email || "";
        idLabel.textContent = user.role === "teacher" ? "Teacher ID" : "Student ID";
        idInput.value = user.student_id || "";
        phoneInput.value = user.phone_number || "";
        departmentInput.value = user.department || "";

        const url = photoUrl(user.photo_path);
        preview.hidden = !url;
        fallback.hidden = Boolean(url);

        if (url) {
            preview.src = url;
        } else {
            preview.removeAttribute("src");
            fallback.textContent = initials(user.full_name);
        }

        renderHeader(user);
    }

    if (profile) fill(profile);

    getProfile()
        .then(renderHeader)
        .catch((error) => console.error("Profile load failed:", error));

    openButton.addEventListener("click", async () => {
        showMessage("");

        try {
            fill(await getProfile());
            dialog.showModal();
        } catch (error) {
            showMessage(error.message || "Could not load your profile.");
            dialog.showModal();
        }
    });

    document
        .getElementById("profile-close-button")
        .addEventListener("click", () => dialog.close());

    document
        .getElementById("profile-cancel-button")
        .addEventListener("click", () => dialog.close());

    dialog.addEventListener("click", (event) => {
        if (event.target === dialog) dialog.close();
    });

    photoInput.addEventListener("change", () => {
        const file = photoInput.files[0];
        if (!file) return;

        if (
            !ALLOWED_PHOTO_TYPES.includes(file.type) ||
            file.size > MAX_PHOTO_BYTES
        ) {
            photoInput.value = "";
            showMessage("Choose a JPG, PNG, or WebP image up to 2 MB.");
            return;
        }

        preview.src = URL.createObjectURL(file);
        preview.hidden = false;
        fallback.hidden = true;
        showMessage("");
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        showMessage("");

        saveButton.disabled = true;
        saveButton.textContent = "Saving...";

        try {
            const updated = await updateProfile({
                full_name: nameInput.value.trim(),
                phone_number: phoneInput.value.trim(),
                department: departmentInput.value.trim(),
                photo_data: await readPhoto(photoInput.files[0]),
            });

            fill(updated);
            onProfileUpdated(updated);
            photoInput.value = "";

            showMessage("Profile updated successfully.", "success");
        } catch (error) {
            showMessage(
                error.message || "Could not update your profile."
            );
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = "Save changes";
        }
    });
}

function startProfileUI() {
    initializeProfileUI();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startProfileUI, {
        once: true,
    });
} else {
    startProfileUI();
}