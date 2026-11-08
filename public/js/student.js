import {
    getProfile,
    getSessionToken,
    logoutUser,
    rpcCall,
} from "./rpc.js";

if ("scrollRestoration" in history) {
    history.scrollRestoration = "manual";
}

window.addEventListener("pageshow", () => {
    window.scrollTo(0, 0);
});

const messageBox = document.getElementById("student-message");
const studentName = document.getElementById("student-name");
const studentAvatar = document.getElementById("student-avatar");

const teacherSearch = document.getElementById("teacher-search");
const teacherResults = document.getElementById("teacher-results");
const selectedTeacherPanel = document.getElementById("selected-teacher");
const selectedTeacherName = document.getElementById("selected-teacher-name");
const changeTeacherButton = document.getElementById("change-teacher");

const slotsContainer = document.getElementById("available-slots");
const appointmentsContainer = document.getElementById("student-appointments");

const requestForm = document.getElementById("consultation-request-form");
const requestTeacherSelect = document.getElementById("request-teacher-select");
const preferredDateInput = document.getElementById("preferred-date");
const preferredDateDisplay = document.getElementById(
    "preferred-date-display"
);
const preferredTimeInput = document.getElementById("preferred-time");

const refreshButton = document.getElementById("refresh-slots");
const logoutButton = document.getElementById("logout-button");

let sessionToken = "";
let teachers = [];
let availableSlots = [];
let selectedTeacher = null;

function showMessage(message, type = "error") {
    messageBox.textContent = message;
    messageBox.className = `dashboard-message ${type}`;
    messageBox.hidden = !message;
}

function getLocalDateString(date = new Date()) {
    const localDate = new Date(date);
    localDate.setMinutes(
        localDate.getMinutes() - localDate.getTimezoneOffset()
    );
    return localDate.toISOString().slice(0, 10);
}

function formatDateForDisplay(isoDate) {
    if (!isoDate) {
        return "";
    }

    const [year, month, day] = isoDate.split("-");
    return `${day}/${month}/${year}`;
}

function setupDatePicker() {
    preferredDateInput.min = getLocalDateString();

    preferredDateInput.addEventListener("change", () => {
        preferredDateDisplay.value = formatDateForDisplay(
            preferredDateInput.value
        );
    });

    preferredDateDisplay.addEventListener("click", () => {
        try {
            if (typeof preferredDateInput.showPicker === "function") {
                preferredDateInput.showPicker();
            } else {
                preferredDateInput.click();
            }
        } catch {
            preferredDateInput.click();
        }
    });
}

function toArray(result, possibleKeys = []) {
    if (Array.isArray(result)) {
        return result;
    }

    if (result && typeof result === "object") {
        for (const key of possibleKeys) {
            if (Array.isArray(result[key])) {
                return result[key];
            }
        }
    }

    return [];
}

function getTeacherId(item) {
    return (
        item.teacher_id ??
        item.teacher?.id ??
        item.teacher?.teacher_id ??
        item.id ??
        ""
    );
}

function getTeacherName(item) {
    return (
        item.teacher_name ||
        item.teacher_full_name ||
        item.teacher?.full_name ||
        item.teacher?.name ||
        item.full_name ||
        item.name ||
        "Teacher"
    );
}

function getTeacherDepartment(teacher) {
    return teacher.department || teacher.teacher_department || "";
}

function getStartTime(item) {
    return (
        item.starts_at ||
        item.start_at ||
        item.preferred_start ||
        item.appointment_time ||
        item.date_time ||
        ""
    );
}

function getEndTime(item) {
    return item.ends_at || item.end_at || "";
}

function formatDateTime(value) {
    if (!value) {
        return "Time not specified";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(date);
}

function getInitials(name) {
    return String(name || "Student")
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join("");
}

function setAvatar(photoPath, name) {
    studentAvatar.replaceChildren();

    if (!photoPath) {
        studentAvatar.textContent = getInitials(name);
        return;
    }

    const image = document.createElement("img");
    image.alt = "";
    image.src = photoPath.startsWith("/")
        ? photoPath
        : `/${photoPath.replace(/^\.?\//, "")}`;

    image.addEventListener("error", () => {
        image.remove();
        studentAvatar.textContent = getInitials(name);
    });

    studentAvatar.appendChild(image);
}

function createTextElement(tagName, className, text) {
    const element = document.createElement(tagName);
    element.className = className;
    element.textContent = text;
    return element;
}

function populateRequestTeacherSelect() {
    requestTeacherSelect.replaceChildren();

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Choose a teacher";
    requestTeacherSelect.appendChild(placeholder);

    teachers.forEach((teacher) => {
        const option = document.createElement("option");
        option.value = teacher.id || teacher.teacher_id || "";
        option.textContent = getTeacherName(teacher);
        requestTeacherSelect.appendChild(option);
    });
}

function renderTeacherResults(searchText = "") {
    teacherResults.replaceChildren();
    teacherResults.hidden = false;
    selectedTeacherPanel.hidden = true;
    slotsContainer.hidden = true;

    const query = searchText.trim().toLowerCase();

    const filteredTeachers = teachers.filter((teacher) => {
        const searchableText = [
            getTeacherName(teacher),
            getTeacherDepartment(teacher),
        ]
            .join(" ")
            .toLowerCase();

        return searchableText.includes(query);
    });

    if (filteredTeachers.length === 0) {
        teacherResults.appendChild(
            createTextElement(
                "p",
                "empty-state",
                query
                    ? "No teacher matches your search."
                    : "No teachers are available right now."
            )
        );
        return;
    }

    filteredTeachers.forEach((teacher) => {
        const card = document.createElement("article");
        card.className = "teacher-card";

        const details = document.createElement("div");
        details.className = "teacher-card-main";

        details.appendChild(
            createTextElement(
                "strong",
                "teacher-card-name",
                getTeacherName(teacher)
            )
        );

        const department = getTeacherDepartment(teacher);

        details.appendChild(
            createTextElement(
                "span",
                "teacher-card-meta",
                department || "Teacher"
            )
        );

        const button = document.createElement("button");
        button.className = "secondary-button select-teacher-button";
        button.type = "button";
        button.textContent = "View available slots";

        button.addEventListener("click", () => {
            selectTeacher(teacher);
        });

        card.append(details, button);
        teacherResults.appendChild(card);
    });
}

function selectTeacher(teacher) {
    selectedTeacher = teacher;

    teacherResults.hidden = true;
    selectedTeacherPanel.hidden = false;
    slotsContainer.hidden = false;

    selectedTeacherName.textContent = getTeacherName(teacher);

    const teacherId = teacher.id || teacher.teacher_id || "";
    requestTeacherSelect.value = String(teacherId);

    renderSelectedTeacherSlots();
}

function getSlotsForSelectedTeacher() {
    if (!selectedTeacher) {
        return [];
    }

    const selectedId = String(
        selectedTeacher.id || selectedTeacher.teacher_id || ""
    );
    const selectedName = getTeacherName(selectedTeacher).toLowerCase();

    return availableSlots.filter((slot) => {
        const slotTeacherId = String(getTeacherId(slot));

        if (slotTeacherId && selectedId && slotTeacherId === selectedId) {
            return true;
        }

        return getTeacherName(slot).toLowerCase() === selectedName;
    });
}

function renderSelectedTeacherSlots() {
    slotsContainer.replaceChildren();

    if (!selectedTeacher) {
        slotsContainer.hidden = true;
        return;
    }

    slotsContainer.hidden = false;

    const teacherSlots = getSlotsForSelectedTeacher();

    if (teacherSlots.length === 0) {
        slotsContainer.appendChild(
            createTextElement(
                "p",
                "empty-state",
                "This teacher has no available slots right now. You can request another time below."
            )
        );
        return;
    }

    teacherSlots.forEach((slot) => {
        const card = document.createElement("article");
        card.className = "slot-item";

        const details = document.createElement("div");
        details.className = "slot-details";

        details.appendChild(
            createTextElement(
                "strong",
                "slot-title",
                formatDateTime(getStartTime(slot))
            )
        );

        const endTime = getEndTime(slot);
        const timeText = endTime
            ? `Ends ${formatDateTime(endTime)}`
            : getTeacherDepartment(selectedTeacher) || "Available consultation";

        details.appendChild(
            createTextElement("span", "slot-meta", timeText)
        );

        const button = document.createElement("button");
        button.className = "primary-button book-slot-button";
        button.type = "button";
        button.textContent = "Book this time";
        button.disabled = !(slot.id || slot.slot_id);

        button.addEventListener("click", async () => {
            await bookSlot(slot, button);
        });

        card.append(details, button);
        slotsContainer.appendChild(card);
    });
}

function normalizeAppointments(result) {
    if (Array.isArray(result)) {
        return result;
    }

    if (!result || typeof result !== "object") {
        return [];
    }

    const lists = [
        result.appointments,
        result.requests,
        result.bookings,
        result.items,
    ].filter(Array.isArray);

    return lists.flat();
}

function renderAppointments(appointments) {
    appointmentsContainer.replaceChildren();

    if (appointments.length === 0) {
        appointmentsContainer.appendChild(
            createTextElement(
                "p",
                "empty-state",
                "You have no consultation requests or bookings yet."
            )
        );
        return;
    }

    appointments.forEach((item) => {
        const card = document.createElement("article");
        card.className = "appointment-item";

        const details = document.createElement("div");
        details.className = "appointment-details";

        const isRequest =
            item.type === "request" ||
            Boolean(item.preferred_start);

        const title = isRequest
            ? `Requested consultation with ${getTeacherName(item)}`
            : `Consultation with ${getTeacherName(item)}`;

        details.appendChild(
            createTextElement("strong", "appointment-title", title)
        );

        details.appendChild(
            createTextElement(
                "span",
                "appointment-meta",
                formatDateTime(getStartTime(item))
            )
        );

        const statusText = String(item.status || "pending");
        const statusClass = statusText
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-");

        const status = createTextElement(
            "span",
            `status-badge status-${statusClass}`,
            statusText.charAt(0).toUpperCase() + statusText.slice(1)
        );

        card.append(details, status);
        appointmentsContainer.appendChild(card);
    });
}

async function loadDashboardData() {
    const results = await Promise.allSettled([
        rpcCall("get_teachers", { token: sessionToken }),
        rpcCall("get_available_slots", { token: sessionToken }),
        rpcCall("get_student_appointments", { token: sessionToken }),
    ]);

    const [teachersResult, slotsResult, appointmentsResult] = results;
    const errors = [];

    if (teachersResult.status === "fulfilled") {
        teachers = toArray(
            teachersResult.value,
            ["teachers", "items"]
        );

        populateRequestTeacherSelect();

        if (selectedTeacher) {
            const updatedTeacher = teachers.find(
                (teacher) =>
                    String(teacher.id || teacher.teacher_id) ===
                    String(selectedTeacher.id || selectedTeacher.teacher_id)
            );

            if (updatedTeacher) {
                selectedTeacher = updatedTeacher;
            }
        }

        renderTeacherResults(teacherSearch.value);
    } else {
        teachers = [];
        populateRequestTeacherSelect();
        renderTeacherResults(teacherSearch.value);
        errors.push(teachersResult.reason.message);
    }

    if (slotsResult.status === "fulfilled") {
        availableSlots = toArray(slotsResult.value, ["slots", "items"]);
        renderSelectedTeacherSlots();
    } else {
        availableSlots = [];
        renderSelectedTeacherSlots();
        errors.push(slotsResult.reason.message);
    }

    if (appointmentsResult.status === "fulfilled") {
        renderAppointments(
            normalizeAppointments(appointmentsResult.value)
        );
    } else {
        renderAppointments([]);
        errors.push(appointmentsResult.reason.message);
    }

    if (errors.length > 0) {
        showMessage(errors[0]);
    }
}

async function bookSlot(slot, button) {
    button.disabled = true;
    button.textContent = "Booking...";

    try {
        await rpcCall("book_slot", {
            token: sessionToken,
            slot_id: slot.id || slot.slot_id,
        });

        await loadDashboardData();
        showMessage("Consultation booked successfully.", "success");
    } catch (error) {
        showMessage(error.message || "Could not book this time.");
        button.disabled = false;
        button.textContent = "Book this time";
    }
}

teacherSearch.addEventListener("input", () => {
    selectedTeacher = null;
    renderTeacherResults(teacherSearch.value);
});

changeTeacherButton.addEventListener("click", () => {
    selectedTeacher = null;
    requestTeacherSelect.value = "";
    renderTeacherResults(teacherSearch.value);
});

refreshButton.addEventListener("click", async () => {
    showMessage("Refreshing teachers and available slots...", "success");

    try {
        await loadDashboardData();

        if (!messageBox.classList.contains("error")) {
            showMessage("");
        }
    } catch (error) {
        showMessage(error.message || "Could not refresh the dashboard.");
    }
});

requestForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    showMessage("");

    const submitButton = requestForm.querySelector(
        'button[type="submit"]'
    );
    const formData = new FormData(requestForm);

    const preferredDate = preferredDateInput.value;
    const preferredTime = preferredTimeInput.value;
    const requestedDateTime = new Date(
        `${preferredDate}T${preferredTime}`
    );

    if (
        !preferredDate ||
        !preferredTime ||
        Number.isNaN(requestedDateTime.getTime()) ||
        requestedDateTime <= new Date()
    ) {
        showMessage("Choose a future date and time.");
        return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Sending...";

    try {
        await rpcCall("request_consultation", {
            token: sessionToken,
            teacher_id: formData.get("teacher_id"),
            preferred_start: `${preferredDate}T${preferredTime}`,
            message: String(formData.get("message") || "").trim(),
        });

        requestForm.reset();
        preferredDateDisplay.value = "";
        preferredDateInput.min = getLocalDateString();

        await loadDashboardData();
        showMessage("Consultation request sent successfully.", "success");
    } catch (error) {
        showMessage(error.message || "Could not send your request.");
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Send request";
    }
});

logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    logoutButton.textContent = "Logging out...";

    try {
        await logoutUser();
    } catch {
        // The local session is cleared by logoutUser even if the server is unavailable.
    }

    showMessage(
        "You've been logged out successfully. See you again soon!",
        "success"
    );

    logoutButton.textContent = "Logged out";

    window.setTimeout(() => {
        window.location.replace("/index.html");
    }, 1500);
});

async function startStudentDashboard() {
    sessionToken = getSessionToken();

    if (!sessionToken) {
        window.location.href = "/student-login.html";
        return;
    }

    setupDatePicker();

    try {
        const profile = await getProfile();

        if (profile.role !== "student") {
            await logoutUser();
            window.location.href = "/index.html";
            return;
        }

        studentName.textContent = profile.full_name || "Student";
        setAvatar(profile.photo_path, profile.full_name);

        await loadDashboardData();
    } catch (error) {
        showMessage(error.message || "Please sign in again.");

        window.setTimeout(() => {
            window.location.href = "/student-login.html";
        }, 1200);
    }
}

startStudentDashboard();