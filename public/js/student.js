import {
    getProfile,
    getSessionToken,
    logoutUser,
    rpcCall,
} from "./rpc.js";
import { initializeProfileUI } from "./profile-ui.js";

const studentName = document.getElementById("student-name");
const profileAvatar = document.getElementById("profile-avatar");
const slotsStatus = document.getElementById("slots-status");
const availableSlots = document.getElementById("available-slots");
const teacherSelect = document.getElementById("teacher-select");
const requestForm = document.getElementById("request-form");
const requestStatus = document.getElementById("request-status");
const appointmentsStatus = document.getElementById("appointments-status");
const appointmentsList = document.getElementById("appointments-list");
const logoutButton = document.getElementById("logout-button");

const token = getSessionToken();

function showInitials(fullName = "") {
    return fullName
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join("") || "S";
}

function showProfileAvatar(user) {
    profileAvatar.replaceChildren();

    if (!user.photo_path) {
        profileAvatar.textContent = showInitials(user.full_name);
        return;
    }

    const image = document.createElement("img");
    image.src = user.photo_path;
    image.alt = `${user.full_name}'s profile picture`;

    image.addEventListener("error", () => {
        profileAvatar.replaceChildren();
        profileAvatar.textContent = showInitials(user.full_name);
    });

    profileAvatar.append(image);
}

function formatDateTime(value) {
    if (!value) {
        return "Time not set";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(date);
}

function createTextElement(tagName, text, className = "") {
    const element = document.createElement(tagName);
    element.textContent = text;

    if (className) {
        element.className = className;
    }

    return element;
}

function createButton(
    label,
    onClick,
    className = "button button-primary"
) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.addEventListener("click", onClick);

    return button;
}

function convertToIsoDateTime(date, time) {
    const localDateTime = new Date(`${date}T${time}`);

    if (Number.isNaN(localDateTime.getTime())) {
        throw new Error("Choose a valid date and time.");
    }

    return localDateTime.toISOString();
}

async function loadAvailableSlots() {
    slotsStatus.textContent = "Loading available slots...";
    availableSlots.replaceChildren();

    try {
        const slots = await rpcCall("get_available_slots", { token });

        if (!slots.length) {
            slotsStatus.textContent =
                "There are no available slots right now.";
            return;
        }

        slotsStatus.textContent = `${slots.length} available slot(s).`;

        slots.forEach((slot) => {
            const card = document.createElement("article");
            card.className = "data-card";

            card.append(
                createTextElement("h3", slot.teacher_name),
                createTextElement(
                    "p",
                    `Starts: ${formatDateTime(slot.starts_at)}`
                ),
                createTextElement(
                    "p",
                    `Ends: ${formatDateTime(slot.ends_at)}`
                )
            );

            const bookButton = createButton(
                "Book this slot",
                async () => {
                    bookButton.disabled = true;
                    bookButton.textContent = "Booking...";

                    try {
                        const result = await rpcCall("book_slot", {
                            token,
                            slot_id: slot.id,
                        });

                        slotsStatus.textContent = result.message;
                        await refreshStudentData();
                    } catch (error) {
                        slotsStatus.textContent = error.message;
                        bookButton.disabled = false;
                        bookButton.textContent = "Book this slot";
                    }
                }
            );

            card.append(bookButton);
            availableSlots.append(card);
        });
    } catch (error) {
        slotsStatus.textContent =
            `Could not load available slots: ${error.message}`;
    }
}

async function loadTeachers() {
    teacherSelect.replaceChildren();

    const firstOption = document.createElement("option");
    firstOption.value = "";
    firstOption.textContent = "Choose a teacher";
    teacherSelect.append(firstOption);

    try {
        const teachers = await rpcCall("get_teachers", { token });

        teachers.forEach((teacher) => {
            const option = document.createElement("option");
            option.value = teacher.id;
            option.textContent = teacher.department
                ? `${teacher.full_name} — ${teacher.department}`
                : teacher.full_name;

            teacherSelect.append(option);
        });
    } catch (error) {
        requestStatus.textContent =
            `Could not load teachers: ${error.message}`;
    }
}

async function loadAppointmentsAndRequests() {
    appointmentsStatus.textContent =
        "Loading your appointments and requests...";
    appointmentsList.replaceChildren();

    try {
        const data = await rpcCall("get_student_appointments", { token });
        const appointments = data.appointments || [];
        const requests = data.requests || [];

        if (appointments.length === 0 && requests.length === 0) {
            appointmentsStatus.textContent =
                "You do not have any appointments or requests yet.";
            return;
        }

        appointmentsStatus.textContent = "";

        if (appointments.length > 0) {
            appointmentsList.append(
                createTextElement("h3", "Appointments", "section-title")
            );

            appointments.forEach((appointment) => {
                const card = document.createElement("article");
                card.className = "data-card";

                card.append(
                    createTextElement("h4", appointment.teacher_name),
                    createTextElement(
                        "p",
                        `Starts: ${formatDateTime(appointment.starts_at)}`
                    ),
                    createTextElement(
                        "p",
                        `Ends: ${formatDateTime(appointment.ends_at)}`
                    ),
                    createTextElement(
                        "p",
                        `Status: ${appointment.status}`
                    )
                );

                appointmentsList.append(card);
            });
        }

        if (requests.length > 0) {
            appointmentsList.append(
                createTextElement("h3", "Time requests", "section-title")
            );

            requests.forEach((request) => {
                const card = document.createElement("article");
                card.className = "data-card";

                card.append(
                    createTextElement("h4", request.teacher_name),
                    createTextElement(
                        "p",
                        `Preferred time: ${formatDateTime(request.preferred_start)}`
                    ),
                    createTextElement("p", `Status: ${request.status}`)
                );

                if (request.message) {
                    card.append(
                        createTextElement("p", `Message: ${request.message}`)
                    );
                }

                if (request.proposed_start) {
                    card.append(
                        createTextElement(
                            "p",
                            `Teacher proposed: ${formatDateTime(request.proposed_start)}`
                        ),
                        createButton(
                            "Accept proposed time",
                            async () => {
                                await respondToProposal(request.id, true);
                            }
                        ),
                        createButton(
                            "Decline proposed time",
                            async () => {
                                await respondToProposal(request.id, false);
                            },
                            "button button-outline"
                        )
                    );
                }

                appointmentsList.append(card);
            });
        }
    } catch (error) {
        appointmentsStatus.textContent =
            `Could not load your activity: ${error.message}`;
    }
}

async function respondToProposal(requestId, accept) {
    appointmentsStatus.textContent = "Saving your response...";

    try {
        const result = await rpcCall("respond_to_proposal", {
            token,
            request_id: requestId,
            accept,
        });

        appointmentsStatus.textContent = result.message;
        await loadAppointmentsAndRequests();
    } catch (error) {
        appointmentsStatus.textContent = error.message;
    }
}

async function refreshStudentData() {
    await Promise.all([
        loadAvailableSlots(),
        loadAppointmentsAndRequests(),
    ]);
}

requestForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    requestStatus.textContent = "Sending your request...";

    const formData = new FormData(requestForm);
    const teacherId = formData.get("teacher_id");
    const date = formData.get("date");
    const time = formData.get("time");
    const message = String(formData.get("message") || "").trim();

    try {
        const preferredStart = convertToIsoDateTime(date, time);

        const result = await rpcCall("request_consultation", {
            token,
            teacher_id: teacherId,
            preferred_start: preferredStart,
            message,
        });

        requestStatus.textContent = result.message;
        requestForm.reset();
        await loadAppointmentsAndRequests();
    } catch (error) {
        requestStatus.textContent = error.message;
    }
});

document
    .getElementById("refresh-slots-button")
    .addEventListener("click", loadAvailableSlots);

document
    .getElementById("refresh-activity-button")
    .addEventListener("click", loadAppointmentsAndRequests);

logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    logoutButton.textContent = "Logging out...";

    try {
        await logoutUser();
    } finally {
        window.location.replace("/index.html");
    }
});

async function startStudentPage() {
    if (!token) {
        window.location.replace("/index.html");
        return;
    }

    try {
        const user = await getProfile();

        if (user.role !== "student") {
            window.location.replace(
                user.role === "teacher"
                    ? "/teacher.html"
                    : "/index.html"
            );
            return;
        }

        studentName.textContent = user.full_name || "Student";
        showProfileAvatar(user);

        initializeProfileUI({
            profile: user,
            onProfileUpdated: (updatedProfile) => {
                studentName.textContent =
                    updatedProfile.full_name || "Student";
                showProfileAvatar(updatedProfile);
            },
        });

        await Promise.all([
            loadTeachers(),
            refreshStudentData(),
        ]);
    } catch (error) {
        console.error("Could not start student page:", error);
        sessionStorage.removeItem("campusconnect_session_token");
        window.location.replace("/index.html");
    }
}

startStudentPage();