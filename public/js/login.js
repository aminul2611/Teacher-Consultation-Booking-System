import {
    loginUser,
    logoutUser,
    registerUser,
} from "./rpc.js";


let selectedRole = "";


const authPanel = document.getElementById("auth-panel");
const selectedRoleHeading = document.getElementById(
    "selected-role-heading"
);
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const studentFields = document.getElementById("student-fields");
const teacherFields = document.getElementById("teacher-fields");
const statusMessage = document.getElementById("auth-status");


function showMessage(message) {
    statusMessage.textContent = message;
}


function showLoginForm() {
    loginForm.hidden = false;
    registerForm.hidden = true;
    showMessage("");
}


function showRegisterForm() {
    loginForm.hidden = true;
    registerForm.hidden = false;
    showMessage("");
}


document.querySelectorAll(".role-choice").forEach((button) => {
    button.addEventListener("click", () => {
        selectedRole = button.dataset.role;

        const roleName =
            selectedRole.charAt(0).toUpperCase() + selectedRole.slice(1);

        selectedRoleHeading.textContent = `${roleName} Login`;
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


document
    .getElementById("show-login-button")
    .addEventListener("click", showLoginForm);


document
    .getElementById("show-register-button")
    .addEventListener("click", showRegisterForm);


loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    showMessage("Logging in...");

    const formData = new FormData(loginForm);
    const email = formData.get("email").trim();
    const password = formData.get("password");

    try {
        const user = await loginUser(email, password);

        if (user.role !== selectedRole) {
            await logoutUser();
            throw new Error(
                `This account is registered as a ${user.role}. ` +
                `Choose the ${user.role} section to log in.`
            );
        }

        showMessage("Login successful. Opening your section...");

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
    }
});


registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!selectedRole) {
        showMessage("Choose Student or Teacher first.");
        return;
    }

    showMessage("Creating your account...");

    const formData = new FormData(registerForm);

    const userDetails = {
        full_name: formData.get("full_name").trim(),
        email: formData.get("email").trim(),
        password: formData.get("password"),
        role: selectedRole,
        student_id: selectedRole === "student"
            ? formData.get("student_id").trim()
            : "",
        department: selectedRole === "student"
            ? formData.get("department").trim()
            : "",
        teacher_code: selectedRole === "teacher"
            ? formData.get("teacher_code")
            : "",
    };

    try {
        await registerUser(userDetails);

        document.getElementById("login-email").value = userDetails.email;
        document.getElementById("login-password").value = "";

        showLoginForm();
        showMessage("Account created. You can now log in.");
    } catch (error) {
        showMessage(error.message);
    }
});