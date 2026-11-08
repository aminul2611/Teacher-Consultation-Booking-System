import {
    loginUser,
    logoutUser,
    registerUser,
} from "./rpc.js";

const loginTab = document.getElementById("teacher-login-tab");
const registerTab = document.getElementById("teacher-register-tab");

const loginPanel = document.getElementById("teacher-login-panel");
const registerPanel = document.getElementById("teacher-register-panel");

const loginForm = document.getElementById("teacher-login-form");
const registerForm = document.getElementById("teacher-register-form");

const heading = document.getElementById("teacher-auth-heading");
const description = document.getElementById("teacher-auth-description");
const messageBox = document.getElementById("teacher-auth-message");

const photoInput = document.getElementById("teacher-profile-photo");
const photoPreview = document.getElementById("teacher-photo-preview");

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
];

function showMessage(message, type = "error") {
    messageBox.textContent = message;
    messageBox.className = `form-message ${type}`;
    messageBox.hidden = !message;
}

function getInputValue(id) {
    const input = document.getElementById(id);

    if (!input) {
        throw new Error(`Required form field is missing: ${id}`);
    }

    return input.value.trim();
}

function showLoginForm(clearMessage = true) {
    loginPanel.hidden = false;
    registerPanel.hidden = true;

    loginTab.classList.add("active");
    registerTab.classList.remove("active");

    loginTab.setAttribute("aria-selected", "true");
    registerTab.setAttribute("aria-selected", "false");

    heading.textContent = "Welcome back";
    description.textContent = "Sign in to your teacher account.";

    if (clearMessage) {
        showMessage("");
    }
}

function showRegisterForm() {
    loginPanel.hidden = true;
    registerPanel.hidden = false;

    loginTab.classList.remove("active");
    registerTab.classList.add("active");

    loginTab.setAttribute("aria-selected", "false");
    registerTab.setAttribute("aria-selected", "true");

    heading.textContent = "Create your account";
    description.textContent = "Set up your teacher profile.";

    showMessage("");
}

function resetPhotoPreview() {
    photoPreview.src = "";
    photoPreview.hidden = true;
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
            new Error("The profile picture must be 2 MB or smaller.")
        );
    }

    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.addEventListener("load", () => {
            resolve(reader.result);
        });

        reader.addEventListener("error", () => {
            reject(new Error("Could not read the selected picture."));
        });

        reader.readAsDataURL(file);
    });
}

loginTab.addEventListener("click", () => {
    showLoginForm();
});

registerTab.addEventListener("click", showRegisterForm);

document
    .querySelectorAll("[data-password-toggle]")
    .forEach((button) => {
        button.addEventListener("click", () => {
            const inputId = button.dataset.passwordToggle;
            const input = document.getElementById(inputId);

            if (!input) {
                showMessage(`Password field is missing: ${inputId}`);
                return;
            }

            const showPassword = input.type === "password";

            input.type = showPassword ? "text" : "password";
            button.textContent = showPassword ? "Hide" : "Show";
            button.setAttribute(
                "aria-label",
                showPassword ? "Hide password" : "Show password"
            );
            button.setAttribute(
                "aria-pressed",
                String(showPassword)
            );
        });
    });

photoInput.addEventListener("change", () => {
    const file = photoInput.files[0];

    if (!file) {
        resetPhotoPreview();
        showMessage("");
        return;
    }

    if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
        photoInput.value = "";
        resetPhotoPreview();
        showMessage("Choose a JPG, PNG, or WebP image.");
        return;
    }

    if (file.size > MAX_PHOTO_BYTES) {
        photoInput.value = "";
        resetPhotoPreview();
        showMessage("The profile picture must be 2 MB or smaller.");
        return;
    }

    photoPreview.src = URL.createObjectURL(file);
    photoPreview.hidden = false;
    showMessage("");
});

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitButton = loginForm.querySelector(
        'button[type="submit"]'
    );
    const formData = new FormData(loginForm);

    submitButton.disabled = true;
    submitButton.textContent = "Signing in...";
    showMessage("");

    try {
        const user = await loginUser(
            String(formData.get("email") || "").trim(),
            String(formData.get("password") || "")
        );

        if (user.role !== "teacher") {
            await logoutUser();
            showMessage("This account is not registered as a teacher.");
            return;
        }

        showMessage(
            "Login successful! Opening your teacher dashboard...",
            "success"
        );

        window.setTimeout(() => {
            window.location.href = "/teacher.html";
        }, 1000);
    } catch (error) {
        const errorText = error.message || "";

        if (/email|password|incorrect|invalid credential/i.test(errorText)) {
            showMessage(
                "Email or password is incorrect. Please try again."
            );
        } else {
            showMessage(errorText || "Login failed. Please try again.");
        }
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Sign in";
    }
});

registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitButton = registerForm.querySelector(
        'button[type="submit"]'
    );

    submitButton.disabled = true;
    submitButton.textContent = "Creating account...";
    showMessage("");

    try {
        const password = getInputValue("teacher-register-password");
        const confirmPassword = getInputValue(
            "teacher-confirm-password"
        );

        if (password !== confirmPassword) {
            throw new Error("The passwords do not match.");
        }

        const photoData = await readPhotoAsDataUrl(
            photoInput.files[0]
        );

        const teacherDetails = {
            full_name: getInputValue("teacher-full-name"),
            email: getInputValue("teacher-register-email"),
            password,
            role: "teacher",
            student_id: getInputValue("teacher-id"),
            department: getInputValue("teacher-department"),
            teacher_code: "",
            photo_data: photoData,
        };

        await registerUser(teacherDetails);

        const loginEmail = document.getElementById(
            "teacher-login-email"
        );

        if (loginEmail) {
            loginEmail.value = teacherDetails.email;
        }

        registerForm.reset();
        resetPhotoPreview();

        showLoginForm(false);
        showMessage(
            "Account submitted for approval. You can sign in after approval.",
            "success"
        );
    } catch (error) {
        showMessage(
            error.message || "Account creation failed. Please try again."
        );
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Create teacher account";
    }
});

showLoginForm();