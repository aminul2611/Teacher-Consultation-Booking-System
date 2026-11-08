import {
    loginUser,
    logoutUser,
    registerUser,
} from "./rpc.js";

const loginTab = document.getElementById("login-tab");
const registerTab = document.getElementById("register-tab");

const loginPanel = document.getElementById("login-panel");
const registerPanel = document.getElementById("register-panel");

const loginForm = document.getElementById("student-login-form");
const registerForm = document.getElementById("student-register-form");

const heading = document.getElementById("auth-heading");
const description = document.getElementById("auth-description");
const messageBox = document.getElementById("auth-message");

const photoInput = document.getElementById("student-photo");
const photoPreview = document.getElementById("student-photo-preview");

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
];

function showMessage(message, type = "error") {
    if (!messageBox) {
        return;
    }

    messageBox.textContent = message;
    messageBox.className = `form-message ${type}`;
    messageBox.hidden = !message;
}

function showLoginForm(clearMessage = true) {
    loginPanel.hidden = false;
    registerPanel.hidden = true;

    loginTab.classList.add("active");
    registerTab.classList.remove("active");

    loginTab.setAttribute("aria-selected", "true");
    registerTab.setAttribute("aria-selected", "false");

    heading.textContent = "Welcome back";
    description.textContent = "Sign in to your student account.";

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
    description.textContent =
        "Create your Campus Connect student account.";

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

loginTab.addEventListener("click", showLoginForm);
registerTab.addEventListener("click", showRegisterForm);

document
    .querySelectorAll("[data-password-toggle]")
    .forEach((button) => {
        button.addEventListener("click", () => {
            const inputId = button.dataset.passwordToggle;
            const input = document.getElementById(inputId);

            if (!input) {
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
            formData.get("email").trim(),
            formData.get("password")
        );

        if (user.role !== "student") {
            await logoutUser();
            showMessage(
                "This account is not registered as a student."
            );
            return;
        }

        showMessage(
            "Login successful! Redirecting to your student dashboard…",
            "success"
        );

        window.setTimeout(() => {
            window.location.href = "/student.html";
        }, 1000);
    } catch (error) {
        const errorText = error.message || "";

        if (
            /email|password|incorrect|invalid credential/i.test(errorText)
        ) {
            showMessage(
                "Email or password is incorrect. Please try again."
            );
        } else {
            showMessage(
                errorText || "Login failed. Please try again."
            );
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

    const password = document.getElementById(
        "student-register-password"
    ).value;

    const confirmPassword = document.getElementById(
        "student-confirm-password"
    ).value;

    if (password !== confirmPassword) {
        showMessage("The passwords do not match.");
        return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Creating account...";
    showMessage("");

    try {
        const photoData = await readPhotoAsDataUrl(
            photoInput.files[0]
        );

        const userDetails = {
            full_name: document
                .getElementById("student-full-name")
                .value.trim(),
            email: document
                .getElementById("student-register-email")
                .value.trim(),
            password,
            role: "student",
            student_id: document
                .getElementById("student-id")
                .value.trim(),
            department: document
                .getElementById("student-department")
                .value.trim(),
            teacher_code: "",
            photo_data: photoData,
        };

        await registerUser(userDetails);

        document.getElementById("student-login-email").value =
            userDetails.email;

        registerForm.reset();
        resetPhotoPreview();
        showLoginForm(false);

        showMessage(
            "Account created successfully. Please sign in.",
            "success"
        );
    } catch (error) {
        showMessage(
            error.message || "Account creation failed. Please try again."
        );
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Create student account";
    }
});

showLoginForm();