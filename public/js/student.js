import {
    getProfile,
    getSessionToken,
    logoutUser,
} from "./rpc.js";


const studentName = document.getElementById("student-name");
const profileAvatar = document.getElementById("profile-avatar");
const slotsStatus = document.getElementById("slots-status");
const appointmentsStatus = document.getElementById("appointments-status");
const logoutButton = document.getElementById("logout-button");


function showInitials(fullName) {
    return fullName
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join("");
}


async function loadStudentPage() {
    if (!getSessionToken()) {
        window.location.replace("/login.html");
        return;
    }

    try {
        const user = await getProfile();

        if (user.role !== "student") {
            if (user.role === "teacher") {
                window.location.replace("/teacher.html");
            } else {
                window.location.replace("/login.html");
            }
            return;
        }

        studentName.textContent = user.full_name;
        profileAvatar.textContent = showInitials(user.full_name);

        slotsStatus.textContent =
            "Available slots will appear here after booking RPC is connected.";

        appointmentsStatus.textContent =
            "Your appointments and requests will appear here after booking RPC is connected.";
    } catch {
        sessionStorage.removeItem("campusconnect_session_token");
        window.location.replace("/login.html");
    }
}


logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    logoutButton.textContent = "Logging out...";

    try {
        await logoutUser();
    } finally {
        window.location.replace("/login.html");
    }
});


loadStudentPage();