import {
    getProfile,
    getSessionToken,
    logoutUser,
    rpcCall,
} from "./rpc.js";
import "./profile-ui.js";

const studentName = document.getElementById("student-name");
const studentAvatar = document.getElementById("student-avatar");
const globalMessage = document.getElementById("student-message");
const refreshSlotsButton = document.getElementById("refresh-slots");
const teacherSearch = document.getElementById("teacher-search");
const teacherResults = document.getElementById("teacher-results");
const selectedTeacherPanel = document.getElementById("selected-teacher");
const selectedTeacherName = document.getElementById("selected-teacher-name");
const changeTeacherButton = document.getElementById("change-teacher");
const availableSlots = document.getElementById("available-slots");
const requestForm = document.getElementById("consultation-request-form");
const requestTeacherSelect = document.getElementById("request-teacher-select");
const preferredDate = document.getElementById("preferred-date");
const preferredDateDisplay = document.getElementById("preferred-date-display");
const preferredTime = document.getElementById("preferred-time");
const requestMessage = document.getElementById("request-message");
const appointmentsList = document.getElementById("student-appointments");
const logoutButton = document.getElementById("logout-button");

const token = getSessionToken();

function openDatePicker(input) {
    try {
        if (typeof input.showPicker === "function") {
            input.showPicker();
        } else {
            input.click();
        }
    } catch {
        input.click();
    }
}

let teachers = [];
let slots = [];
let selectedTeacher = null;

function initials(name = "Student") {
    return String(name)
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join("") || "S";
}

function setAvatar(user) {
    if (!studentAvatar) return;

    studentAvatar.replaceChildren();

    if (!user.photo_path) {
        studentAvatar.textContent = initials(user.full_name);
        return;
    }

    const image = document.createElement("img");
    image.src = user.photo_path;
    image.alt = `${user.full_name || "Student"}'s profile photo`;

    image.addEventListener("error", () => {
        studentAvatar.replaceChildren();
        studentAvatar.textContent = initials(user.full_name);
    });

    studentAvatar.append(image);
}

function showMessage(text, type = "") {
    if (!globalMessage) return;

    globalMessage.textContent = text;
    globalMessage.hidden = !text;
    globalMessage.className = `dashboard-message ${type}`.trim();
}

function createText(tag, text, className = "") {
    const element = document.createElement(tag);
    element.textContent = text ?? "";

    if (className) {
        element.className = className;
    }

    return element;
}

function createButton(
    text,
    onClick,
    className = "secondary-button"
) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = text;
    button.addEventListener("click", onClick);

    return button;
}

function formatDateTime(value) {
    if (!value) return "Time not set";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    const dateText = new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    }).format(date);

    const timeText = new Intl.DateTimeFormat(undefined, {
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);

    return `${dateText} ${timeText}`;
}

function toIsoDateTime(date, time) {
    if (!date || !time) {
        throw new Error("Choose both a date and a time.");
    }

    const localDate = new Date(`${date}T${time}`);

    if (Number.isNaN(localDate.getTime())) {
        throw new Error("Choose a valid date and time.");
    }

    return localDate.toISOString();
}

function formatInputDate(value) {
    if (!value) return "";

    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
}

function renderTeachers() {
    const query = teacherSearch.value.trim().toLowerCase();

    const matches = teachers.filter((teacher) =>
        `${teacher.full_name} ${teacher.department || ""}`
            .toLowerCase()
            .includes(query)
    );

    teacherResults.replaceChildren();

    if (!matches.length) {
        teacherResults.append(
            createText(
                "p",
                "No teachers match your search.",
                "empty-state"
            )
        );
        return;
    }

    matches.forEach((teacher) => {
        const card = document.createElement("article");
        card.className = "teacher-card";

        const details = document.createElement("div");
        details.className = "teacher-card-main";
        details.append(
            createText(
                "h3",
                teacher.full_name,
                "teacher-card-name"
            ),
            createText(
                "p",
                teacher.department || "Department not listed",
                "teacher-card-meta"
            )
        );

        if (teacher.photo_path) {
            const image = document.createElement("img");
            image.className = "teacher-profile-avatar";
            image.src = teacher.photo_path;
            image.alt = `${teacher.full_name}'s profile photo`;
            image.addEventListener("error", () => image.remove());
            card.append(image);
        }

        card.append(
            details,
            createButton(
                "View available slots",
                async () => {
                    await selectTeacher(teacher);
                },
                "secondary-button select-teacher-button"
            )
        );

        teacherResults.append(card);
    });
}

async function loadTeachers() {
    teacherResults.replaceChildren(
        createText("p", "Loading teachers...", "empty-state")
    );

    try {
        teachers = await rpcCall("get_teachers", { token });

        requestTeacherSelect.replaceChildren();

        const prompt = document.createElement("option");
        prompt.value = "";
        prompt.textContent = "Choose a teacher";
        requestTeacherSelect.append(prompt);

        teachers.forEach((teacher) => {
            const option = document.createElement("option");
            option.value = teacher.id;
            option.textContent = teacher.department
                ? `${teacher.full_name} — ${teacher.department}`
                : teacher.full_name;

            requestTeacherSelect.append(option);
        });

        renderTeachers();
    } catch (error) {
        teacherResults.replaceChildren(
            createText(
                "p",
                `Could not load teachers: ${error.message}`,
                "empty-state"
            )
        );
    }
}

async function loadAvailableSlots() {
    availableSlots.replaceChildren(
        createText(
            "p",
            "Loading available slots...",
            "empty-state"
        )
    );

    try {
        slots = await rpcCall("get_available_slots", { token });

        if (selectedTeacher) {
            renderSelectedTeacherSlots();
        }
    } catch (error) {
        availableSlots.replaceChildren(
            createText(
                "p",
                `Could not load slots: ${error.message}`,
                "empty-state"
            )
        );
    }
}

async function selectTeacher(teacher) {
    selectedTeacher = teacher;
    selectedTeacherName.textContent = teacher.full_name;
    selectedTeacherPanel.hidden = false;
    availableSlots.hidden = false;
    showMessage("");

    if (!slots.length) {
        await loadAvailableSlots();
    } else {
        renderSelectedTeacherSlots();
    }

    selectedTeacherPanel.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
    });
}

function renderSelectedTeacherSlots() {
    availableSlots.replaceChildren();

    const teacherSlots = slots.filter(
        (slot) => slot.teacher_id === selectedTeacher.id
    );

    if (!teacherSlots.length) {
        availableSlots.append(
            createText(
                "p",
                "This teacher has no available slots right now.",
                "empty-state"
            )
        );
        return;
    }

    teacherSlots.forEach((slot) => {
        const card = document.createElement("article");
        card.className = "slot-item";

        const details = document.createElement("div");
        details.className = "slot-details";
        details.append(
            createText(
                "p",
                formatDateTime(slot.starts_at),
                "slot-title"
            ),
            createText(
                "p",
                `Until ${formatDateTime(slot.ends_at)}`,
                "slot-meta"
            )
        );

        card.append(
            details,
            createButton(
                "Book this slot",
                async (event) => {
                    const button = event.currentTarget;
                    button.disabled = true;
                    button.textContent = "Booking...";

                    try {
                        const result = await rpcCall("book_slot", {
                            token,
                            slot_id: slot.id,
                        });

                        showMessage(result.message, "success");

                        await Promise.all([
                            loadAvailableSlots(),
                            loadAppointments(),
                        ]);
                    } catch (error) {
                        showMessage(error.message, "error");
                        button.disabled = false;
                        button.textContent = "Book this slot";
                    }
                },
                "primary-button book-slot-button"
            )
        );

        availableSlots.append(card);
    });
}

async function loadAppointments() {
    appointmentsList.replaceChildren(
        createText(
            "p",
            "Loading your consultations...",
            "empty-state"
        )
    );

    try {
        const data = await rpcCall(
            "get_student_appointments",
            { token }
        );

        const appointments = data.appointments || [];
        const requests = data.requests || [];

        appointmentsList.replaceChildren();

        if (!appointments.length && !requests.length) {
            appointmentsList.append(
                createText(
                    "p",
                    "You have no consultations or requests yet.",
                    "empty-state"
                )
            );
            return;
        }

        appointments.forEach((appointment) => {
            const card = document.createElement("article");
            card.className = "appointment-item";

            const details = document.createElement("div");
            details.className = "appointment-details";
            details.append(
                createText(
                    "h3",
                    appointment.teacher_name,
                    "appointment-title"
                ),
                createText(
                    "p",
                    `${formatDateTime(appointment.starts_at)} – ${formatDateTime(appointment.ends_at)}`,
                    "appointment-meta"
                ),
                createText(
                    "p",
                    `Status: ${appointment.status}`,
                    "appointment-meta"
                )
            );

            if (appointment.followup_summary) {
                details.append(
                    createText("h4", "Teacher's follow-up"),
                    createText("p", appointment.followup_summary)
                );
            }

            if (appointment.followup_action_items) {
                details.append(
                    createText(
                        "p",
                        `Action items: ${appointment.followup_action_items}`
                    )
                );
            }

            card.append(details);
            appointmentsList.append(card);
        });

        requests.forEach((request) => {
            const card = document.createElement("article");
            card.className = "appointment-item";

            const details = document.createElement("div");
            details.className = "appointment-details";
            details.append(
                createText(
                    "h3",
                    request.teacher_name,
                    "appointment-title"
                ),
                createText(
                    "p",
                    `Requested time: ${formatDateTime(request.preferred_start)}`,
                    "appointment-meta"
                ),
                createText(
                    "p",
                    `Status: ${request.status}`,
                    "appointment-meta"
                )
            );

            if (request.message) {
                details.append(
                    createText(
                        "p",
                        `Message: ${request.message}`,
                        "appointment-meta"
                    )
                );
            }

            if (request.status === "proposed" && request.proposed_start) {
                details.append(
                    createText(
                        "p",
                        `Teacher proposed: ${formatDateTime(request.proposed_start)}`,
                        "appointment-meta"
                    )
                );

                card.append(
                    createButton(
                        "Accept proposal",
                        async () => {
                            await answerProposal(request.id, true);
                        },
                        "primary-button"
                    ),
                    createButton(
                        "Decline proposal",
                        async () => {
                            await answerProposal(request.id, false);
                        }
                    )
                );
            }

            card.append(details);
            appointmentsList.append(card);
        });
    } catch (error) {
        appointmentsList.replaceChildren(
            createText(
                "p",
                `Could not load consultations: ${error.message}`,
                "empty-state"
            )
        );
    }
}

async function answerProposal(requestId, accept) {
    try {
        const result = await rpcCall("respond_to_proposal", {
            token,
            request_id: requestId,
            accept,
        });

        showMessage(result.message, "success");
        await loadAppointments();
    } catch (error) {
        showMessage(error.message, "error");
    }
}

requestForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    showMessage("Sending your request...");

    try {
        const preferredStart = toIsoDateTime(
            preferredDate.value,
            preferredTime.value
        );

        const result = await rpcCall("request_consultation", {
            token,
            teacher_id: requestTeacherSelect.value,
            preferred_start: preferredStart,
            message: requestMessage.value.trim(),
        });

        showMessage(result.message, "success");
        requestForm.reset();
        preferredDateDisplay.value = "";

        await loadAppointments();
    } catch (error) {
        showMessage(error.message, "error");
    }
});

preferredDate.min = new Date().toISOString().slice(0, 10);

preferredDate.addEventListener("change", () => {
    preferredDateDisplay.value =
        formatInputDate(preferredDate.value);
});

preferredDateDisplay.addEventListener("click", () => {
    openDatePicker(preferredDate);
});

teacherSearch.addEventListener("input", renderTeachers);

refreshSlotsButton.addEventListener("click", async () => {
    await loadAvailableSlots();
    showMessage("Available slots refreshed.", "success");
});

changeTeacherButton.addEventListener("click", () => {
    selectedTeacher = null;
    selectedTeacherPanel.hidden = true;
    availableSlots.hidden = true;
    availableSlots.replaceChildren();
});

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
        setAvatar(user);

        await Promise.all([
            loadTeachers(),
            loadAppointments(),
        ]);
    } catch (error) {
        console.error("Could not start student page:", error);
        sessionStorage.removeItem("campusconnect_session_token");
        window.location.replace("/index.html");
    }
}

startStudentPage();