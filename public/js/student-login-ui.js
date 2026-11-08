document.addEventListener("DOMContentLoaded", () => {
    const loginTab = document.getElementById("login-tab");
    const registerTab = document.getElementById("register-tab");
    const loginPanel = document.getElementById("login-panel");
    const registerPanel = document.getElementById("register-panel");
    const heading = document.getElementById("auth-heading");
    const description = document.getElementById("auth-description");

    if (
        !loginTab ||
        !registerTab ||
        !loginPanel ||
        !registerPanel ||
        !heading ||
        !description
    ) {
        console.error("Student login tabs could not find their HTML elements.");
        return;
    }

    function showPanel(panelName) {
        const showLogin = panelName === "login";

        loginPanel.hidden = !showLogin;
        registerPanel.hidden = showLogin;

        loginTab.classList.toggle("active", showLogin);
        registerTab.classList.toggle("active", !showLogin);

        loginTab.setAttribute("aria-selected", String(showLogin));
        registerTab.setAttribute("aria-selected", String(!showLogin));

        heading.textContent = showLogin ? "Welcome back" : "Create your account";
        description.textContent = showLogin
            ? "Sign in to your student account."
            : "Create your Campus Connect student account.";
    }

    loginTab.addEventListener("click", () => showPanel("login"));
    registerTab.addEventListener("click", () => showPanel("register"));

    document.querySelectorAll("[data-password-toggle]").forEach((button) => {
        button.addEventListener("click", () => {
            const inputId = button.getAttribute("data-password-toggle");
            const passwordInput = document.getElementById(inputId);

            if (!passwordInput) {
                console.error(`Password input not found: ${inputId}`);
                return;
            }

            const shouldShowPassword = passwordInput.type === "password";

            passwordInput.type = shouldShowPassword ? "text" : "password";
            button.textContent = shouldShowPassword ? "Hide" : "Show";
            button.setAttribute("aria-pressed", String(shouldShowPassword));
            button.setAttribute(
                "aria-label",
                shouldShowPassword ? "Hide password" : "Show password"
            );
        });
    });

    showPanel("login");
});