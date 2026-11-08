import {
    getProfile,
    getSessionToken,
    logoutUser,
    rpcCall,
} from "./rpc.js";

const token = getSessionToken();

const teacherAvatar = document.getElementById("teacher-avatar");
const teacherName = document.getElementById("teacher-name");
const messageBox = document.getElementById("teacher-message");

const availabilityForm = document.getElementById(
    "teacher-availability-form"
);
const dateDisplay = document.getElementById("slot-start-date-display");
const dateInput = document.getElementById("slot-start-date");
const startTimeInput = document.getElementById("slot-start-time");
const endTimeInput = document.getElementById("slot-end-time");

const slotsList = document.getElementById("teacher-slots");
const refreshSlotsButton = document.getElementById(
    "teacher-refresh-slots"
);

const requestsList = document.getElementById("teacher-requests");
const refreshRequestsButton = document.getElementById(
    "teacher-refresh-requests"
);

const logoutButton = document.getElementById("teacher-logout-button");

function showMessage(message, type = "") {
    if (!messageBox) return;

    messageBox.textContent = message;
    messageBox.hidden = !message;
    messageBox.dataset.type = type;
}

function getTodayISODate() {
    const today = new Date();
    today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
    return today.toISOString().slice(0, 10);
}

function formatDateInput(value) {
    if (!value) return "";

    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
}

function connectDatePicker() {
    if (!dateInput || !dateDisplay) return;

    dateInput.min = getTodayISODate();

    const control = dateDisplay.closest(
        ".teacher-date-picker-control"
    );

    control?.addEventListener("click", (event) => {
        if (event.target === dateInput) return;

        if (typeof dateInput.showPicker === "function") {
            dateInput.showPicker();
        } else {
            dateInput.focus();
            dateInput.click();
        }
    });

    dateInput.addEventListener("change", () => {
        dateDisplay.value = formatDateInput(dateInput.value);
    });
}

connectDatePicker();

function getInitials(name = "Teacher") {
    return name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() || "")
        .join("");
}

function showAvatar(user) {
    if (!teacherAvatar) return;

    teacherAvatar.replaceChildren();

    if (!user.photo_path) {
        teacherAvatar.textContent = getInitials(user.full_name);
        return;
    }

    const image = document.createElement("img");
    image.src = user.photo_path;
    image.alt = `${user.full_name}'s profile picture`;

    image.addEventListener("error", () => {
        teacherAvatar.replaceChildren();
        teacherAvatar.textContent = getInitials(user.full_name);
    });

    teacherAvatar.append(image);
}

function formatDateTime(value) {
    if (!value) return "Time not set";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
}

function makeElement(tag, text, className = "") {
    const element = document.createElement(tag);
    element.textContent = text;

    if (className) {
        element.className = className;
    }

    return element;
}

function makeButton(text, className, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = text;
    button.addEventListener("click", onClick);
    return button;
}

function showEmptyState(container, text) {
    if (!container) return;

    container.replaceChildren(
        makeElement("p", text, "teacher-empty-state")
    );
}

async function loadTeacherSlots() {
    if (!slotsList || !token) return;

    showEmptyState(slotsList, "Loading your available slots...");

    try {
        const slots = await rpcCall("get_teacher_slots", { token });

        if (!Array.isArray(slots) || slots.length === 0) {
            showEmptyState(
                slotsList,
                "You have not added any available times yet."
            );
            return;
        }

        slotsList.replaceChildren();

        slots.forEach((slot) => {
            const card = document.createElement("article");
            card.className = "teacher-slot-card";

            card.append(
                makeElement(
                    "h3",
                    `${formatDateTime(slot.starts_at)} – ${formatDateTime(slot.ends_at)}`,
                    "teacher-slot-title"
                ),
                makeElement(
                    "p",
                    `Status: ${slot.status === "booked" ? "Booked" : "Available"}`,
                    "teacher-slot-meta"
                )
            );

            if (slot.status === "booked" && slot.student_name) {
                card.append(
                    makeElement("p", `Booked by: ${slot.student_name}`)
                );
            }

            slotsList.append(card);
        });
    } catch (error) {
        showEmptyState(
            slotsList,
            `Could not load slots: ${error.message}`
        );
    }
}

async function respondToRequest(requestId, action, proposedStart = "") {
    showMessage("Saving your response...");

    try {
        const result = await rpcCall("respond_to_request", {
            token,
            request_id: requestId,
            action,
            proposed_start: proposedStart,
        });

        showMessage(
            result?.message || "Your response has been saved.",
            "success"
        );

        await Promise.all([
            loadTeacherRequests(),
            loadTeacherSlots(),
        ]);
    } catch (error) {
        showMessage(error.message, "error");
    }
}

function makeProposalForm(request) {
    const form = document.createElement("form");
    form.className = "teacher-proposal-form";

    const label = makeElement("label", "Suggest another date and time");
    const input = document.createElement("input");
    input.type = "datetime-local";
    input.required = true;

    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    input.min = now.toISOString().slice(0, 16);

    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "teacher-secondary-button";
    submit.textContent = "Send proposal";

    form.append(label, input, submit);

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const proposedDate = new Date(input.value);

        if (
            !input.value ||
            Number.isNaN(proposedDate.getTime()) ||
            proposedDate <= new Date()
        ) {
            showMessage("Choose a future date and time.", "error");
            return;
        }

        submit.disabled = true;
        submit.textContent = "Sending...";

        await respondToRequest(
            request.id,
            "propose",
            proposedDate.toISOString()
        );

        submit.disabled = false;
        submit.textContent = "Send proposal";
    });

    return form;
}

async function loadTeacherRequests() {
    if (!requestsList || !token) return;

    showEmptyState(requestsList, "Loading student requests...");

    try {
        const requests = await rpcCall(
            "get_teacher_requests",
            { token }
        );

        if (!Array.isArray(requests) || requests.length === 0) {
            showEmptyState(
                requestsList,
                "There are no student requests yet."
            );
            return;
        }

        requestsList.replaceChildren();

        requests.forEach((request) => {
            const card = document.createElement("article");
            card.className = "teacher-request-item";

            card.append(
                makeElement(
                    "h3",
                    request.student_name || "Student"
                ),
                makeElement(
                    "p",
                    request.student_id
                        ? `Student ID: ${request.student_id}`
                        : "Student ID not provided"
                ),
                makeElement(
                    "p",
                    `Preferred time: ${formatDateTime(request.preferred_start)}`
                ),
                makeElement(
                    "p",
                    `Status: ${request.status || "pending"}`
                )
            );

            if (request.message) {
                card.append(makeElement("p", `Message: ${request.message}`));
            }

            if (request.proposed_start) {
                card.append(
                    makeElement(
                        "p",
                        `Proposed time: ${formatDateTime(request.proposed_start)}`
                    )
                );
            }

            if (request.status === "pending") {
                const actions = document.createElement("div");
                actions.className = "teacher-request-actions";

                actions.append(
                    makeButton(
                        "Accept",
                        "teacher-primary-button",
                        () => respondToRequest(request.id, "accept")
                    ),
                    makeButton(
                        "Decline",
                        "teacher-secondary-button",
                        () => respondToRequest(request.id, "decline")
                    )
                );

                card.append(actions, makeProposalForm(request));
            }

            requestsList.append(card);
        });
    } catch (error) {
        showEmptyState(
            requestsList,
            `Could not load requests: ${error.message}`
        );
    }
}

availabilityForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const date = dateInput?.value;
    const startTime = startTimeInput?.value;
    const endTime = endTimeInput?.value;

    if (!date || !startTime || !endTime) {
        showMessage("Choose a date, start time, and end time.", "error");
        return;
    }

    const startsAt = new Date(`${date}T${startTime}`);
    const endsAt = new Date(`${date}T${endTime}`);

    if (startsAt <= new Date()) {
        showMessage("Choose a future date and start time.", "error");
        return;
    }

    if (endsAt <= startsAt) {
        showMessage("End time must be later than start time.", "error");
        return;
    }

    const submitButton = availabilityForm.querySelector(
        'button[type="submit"]'
    );

    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Adding...";
    }

    showMessage("Adding your available time...");

    try {
        const result = await rpcCall("add_teacher_slot", {
            token,
            starts_at: startsAt.toISOString(),
            ends_at: endsAt.toISOString(),
        });

        showMessage(
            result?.message || "Available time added.",
            "success"
        );

        availabilityForm.reset();
        dateDisplay.value = "";
        dateInput.min = getTodayISODate();

        await loadTeacherSlots();
    } catch (error) {
        showMessage(error.message, "error");
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = "Add available time";
        }
    }
});

refreshSlotsButton?.addEventListener("click", loadTeacherSlots);
refreshRequestsButton?.addEventListener(
    "click",
    loadTeacherRequests
);

logoutButton?.addEventListener("click", async () => {
    logoutButton.disabled = true;
    logoutButton.textContent = "Logging out...";

    try {
        await logoutUser();
    } finally {
        window.location.replace("/index.html");
    }
});

async function startTeacherPage() {
    if (!token) {
        window.location.replace("/index.html");
        return;
    }

    try {
        const user = await getProfile();

        if (user.role !== "teacher") {
            window.location.replace(
                user.role === "student"
                    ? "/student.html"
                    : "/index.html"
            );
            return;
        }

        if (teacherName) {
            teacherName.textContent = user.full_name;
        }

        showAvatar(user);

        await Promise.all([
            loadTeacherSlots(),
            loadTeacherRequests(),
        ]);
    } catch {
        sessionStorage.removeItem("campusconnect_session_token");
        window.location.replace("/index.html");
    }
}

startTeacherPage();