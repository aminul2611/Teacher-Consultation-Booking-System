import {
    loginUser,
    logoutUser,
    registerUser,
} from "./rpc.js";

const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const loginTab = document.getElementById("login-tab");
const registerTab = document.getElementById("register-tab");
const formTitle = document.getElementById("form-title");
const formDescription = document.getElementById("form-description");
const statusMessage = document.getElementById("auth-status");
const photoInput = document.getElementById("profile-photo");
const photoPreview = document.getElementById("photo-preview");

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

function showMessage(message) {
    statusMessage.textContent = message;
}

function showLoginForm() {
    loginForm.hidden = false;
    registerForm.hidden = true;
    loginTab.classList.add("active");
    registerTab.classList.remove("active");
    formTitle.textContent = "Welcome back";
    formDescription.textContent = "Sign in to your teacher account.";
    showMessage("");
}

function showRegisterForm() {
    loginForm.hidden = true;
    registerForm.hidden = false;
    loginTab.classList.remove("active");
    registerTab.classList.add("active");
    formTitle.textContent = "Create your account";
    formDescription.textContent = "Set up your teacher profile.";
    showMessage("");
}

function readPhotoAsDataUrl(file) {
    if (!file) {
        return Promise.resolve("");
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

photoInput.addEventListener("change", () => {
    const file = photoInput.files[0];

    if (!file) {
        photoPreview.replaceChildren();
        photoPreview.textContent = "T";
        return;
    }

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        showMessage("Choose a JPG, PNG, or WebP image.");
        photoInput.value = "";
        photoPreview.replaceChildren();
        photoPreview.textContent = "T";
        return;
    }

    if (file.size > MAX_PHOTO_BYTES) {
        showMessage("The profile picture must be 2 MB or smaller.");
        photoInput.value = "";
        photoPreview.replaceChildren();
        photoPreview.textContent = "T";
        return;
    }

    const image = document.createElement("img");
    image.alt = "Selected profile picture";
    image.src = URL.createObjectURL(file);

    photoPreview.replaceChildren(image);
    showMessage("");
});

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitButton = loginForm.querySelector('button[type="submit"]');
    const formData = new FormData(loginForm);

    submitButton.disabled = true;
    submitButton.textContent = "Signing in...";
    showMessage("");

    try {
        const user = await loginUser(
            formData.get("email").trim(),
            formData.get("password")
        );

        if (user.role !== "teacher") {
            await logoutUser();
            throw new Error("This account is not registered as a teacher.");
        }

        window.location.href = "/teacher.html";
    } catch (error) {
        showMessage(error.message);
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
        const photoData = await readPhotoAsDataUrl(
            photoInput.files[0]
        );

        const userDetails = {
            full_name: document.getElementById("register-name").value.trim(),
            email: document.getElementById("register-email").value.trim(),
            password: document.getElementById("register-password").value,
            role: "teacher",
            student_id: "",
            department: document
                .getElementById("teacher-department")
                .value.trim(),
            teacher_code: document
                .getElementById("teacher-code")
                .value,
            photo_data: photoData,
        };

        await registerUser(userDetails);

        document.getElementById("login-email").value = userDetails.email;
        document.getElementById("login-password").value = "";

        registerForm.reset();
        photoPreview.replaceChildren();
        photoPreview.textContent = "T";

        showLoginForm();
        showMessage("Account created. Sign in with your email and password.");
    } catch (error) {
        showMessage(error.message);
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Create teacher account";
    }
});