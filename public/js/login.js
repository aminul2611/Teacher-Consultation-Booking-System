import {
    loginUser,
    logoutUser,
    registerUser,
} from "./rpc.js";

let selectedRole = "";

const authPanel = document.getElementById("auth-panel");
const selectedRoleHeading = document.getElementById("selected-role-heading");
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const studentFields = document.getElementById("student-fields");
const teacherFields = document.getElementById("teacher-fields");
const statusMessage = document.getElementById("auth-status");
const loginTab = document.getElementById("show-login-button");
const registerTab = document.getElementById("show-register-button");

function showMessage(message) {
    statusMessage.textContent = message;
}

function showLoginForm() {
    loginForm.hidden = false;
    registerForm.hidden = true;

    loginTab.classList.add("active");
    registerTab.classList.remove("active");

    showMessage("");
}

function showRegisterForm() {
    loginForm.hidden = true;
    registerForm.hidden = false;

    loginTab.classList.remove("active");
    registerTab.classList.add("active");

    showMessage("");
}

document.querySelectorAll(".role-button").forEach((button) => {
    button.addEventListener("click", () => {
        selectedRole = button.dataset.role;

        document.querySelectorAll(".role-button").forEach((roleButton) => {
            roleButton.classList.toggle("selected", roleButton === button);
        });

        const roleName =
            selectedRole.charAt(0).toUpperCase() + selectedRole.slice(1);

        selectedRoleHeading.textContent = `${roleName} sign in`;

        studentFields.hidden = selectedRole !== "student";
        teacherFields.hidden = selectedRole !== "teacher";
        authPanel.hidden = false;

        showLoginForm();

        authPanel.scrollIntoView({
            behavior: "smooth",
            block: "start",
        });
    });
});

loginTab.addEventListener("click", showLoginForm);
registerTab.addEventListener("click", showRegisterForm);

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!selectedRole) {
        showMessage("Choose Student or Teacher first.");
        return;
    }

    const submitButton = loginForm.querySelector(
        'button[type="submit"]'
    );

    const formData = new FormData(loginForm);
    const email = formData.get("email").trim();
    const password = formData.get("password");

    submitButton.disabled = true;
    submitButton.textContent = "Signing in...";
    showMessage("");

    try {
        const user = await loginUser(email, password);

        if (user.role !== selectedRole) {
            await logoutUser();

            throw new Error(
                `This account is registered as a ${user.role}. ` +
                `Choose the ${user.role} workspace.`
            );
        }

        if (user.role === "student") {
            window.location.href = "/student.html";
        } else if (user.role === "teacher") {
            window.location.href = "/teacher.html";
        } else {
            await logoutUser();
            throw new Error("This account has an unsupported role.");
        }
    } catch (error) {
        showMessage(error.message);
        submitButton.disabled = false;
        submitButton.textContent = "Sign in";
    }
});

registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!selectedRole) {
        showMessage("Choose Student or Teacher first.");
        return;
    }

    const submitButton = registerForm.querySelector(
        'button[type="submit"]'
    );

    const formData = new FormData(registerForm);

    const department =
        selectedRole === "student"
            ? document.getElementById("student-department").value.trim()
            : document.getElementById("teacher-department").value.trim();

    const userDetails = {
        full_name: formData.get("full_name").trim(),
        email: formData.get("email").trim(),
        password: formData.get("password"),
        role: selectedRole,
        student_id:
            selectedRole === "student"
                ? document.getElementById("student-id").value.trim()
                : "",
        department,
        teacher_code:
            selectedRole === "teacher"
                ? document.getElementById("teacher-code").value
                : "",
    };

    submitButton.disabled = true;
    submitButton.textContent = "Creating account...";
    showMessage("");

    try {
        await registerUser(userDetails);

        document.getElementById("login-email").value = userDetails.email;
        document.getElementById("login-password").value = "";

        showLoginForm();
        showMessage("Account created. Sign in with your email and password.");
    } catch (error) {
        showMessage(error.message);
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Create account";
    }
});