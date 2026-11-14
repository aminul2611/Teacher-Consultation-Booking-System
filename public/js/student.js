import { getProfile, getSessionToken, logoutUser, rpcCall } from "./rpc.js";
import "./profile-ui.js";

const get = (id) => document.getElementById(id);
const api = (method, params = {}) => rpcCall(method, {
    ...params,
    token: getSessionToken(),
});

const search = get("teacher-search");
const results = get("teacher-results");
const browse = get("browse-teachers");
const request = get("request-form");
const dateInput = get("preferred-date");
const book = get("book-slot");

let teachers = [];
let browseOpen = false;
let teacher = null;
let activeSlot = null;
let selectionVersion = 0;
let activityVersion = 0;
let activityBusy = false;
let bookingBusy = false;

const dateFormat = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
});

const timeFormat = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
});

function dateTime(value) {
    const date = new Date(value);
    return `${dateFormat.format(date)} · ${timeFormat.format(date)}`;
}

function node(tag, text = "", classes = "") {
    const element = document.createElement(tag);
    element.textContent = text;
    element.className = classes;
    return element;
}

function button(text, handler, classes = "button") {
    const control = node("button", text, classes);
    control.type = "button";
    control.addEventListener("click", handler);
    return control;
}

function status(id, text, kind = "") {
    const element = get(id);
    element.textContent = text;
    element.dataset.kind = kind;

    if (id === "student-status") {
        element.hidden = !text;
    }
}

function localDate(date = new Date()) {
    const pad = (value) => String(value).padStart(2, "0");

    return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate()),
    ].join("-");
}

function avatar(person) {
    const initials = (person.full_name || "Teacher").trim().split(/\s+/)
        .slice(0, 2)
        .map((word) => word.charAt(0).toUpperCase())
        .join("") || "T";

    const element = node("span", initials, "avatar");
    element.setAttribute("aria-hidden", "true");

    if (person.photo_path) {
        const image = document.createElement("img");
        image.alt = "";

        image.addEventListener("error", () => {
            element.textContent = initials;
        });

        image.src = person.photo_path;
        element.replaceChildren(image);
    }

    return element;
}

function renderDirectory() {
    const query = search.value.trim().toLowerCase();
    const opened = Boolean(query || browseOpen);

    const matches = teachers.filter((person) => {
        const text = [person.full_name, person.department].join(" ").toLowerCase();
        return query.split(/\s+/).every((word) => text.includes(word));
    });

    results.hidden = !opened || matches.length === 0;
    results.replaceChildren();

    browse.setAttribute("aria-expanded", String(opened));
    browse.textContent = opened ? "Hide names" : "Browse names";
    status("directory-status", opened && !matches.length ? "No teachers found." : "");

    if (results.hidden) return;

    for (const person of matches) {
        const option = button("", () => chooseTeacher(person), "teacher-option");
        option.disabled = bookingBusy;
        option.append(
            node("strong", person.full_name || "Teacher"),
            node("small", person.department || ""),
        );
        results.append(option);
    }
}

async function loadDirectory() {
    try {
        teachers = await api("get_teachers");
        teachers.sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
        renderDirectory();
    } catch (error) {
        status("directory-status", "Could not load teachers. " + error.message, "error");
    }
}

function toggleRequest(open) {
    request.hidden = !open;
    get("toggle-request").setAttribute("aria-expanded", String(open));

    if (open) {
        dateInput.min = localDate();
        dateInput.focus();
    }
}

function resetRequest() {
    request.reset();
    get("preferred-date-text").textContent = "DD/MM/YYYY";
    toggleRequest(false);
}

async function chooseTeacher(person) {
    teacher = person;
    browseOpen = false;
    search.value = "";

    renderDirectory();
    resetRequest();

    const identity = get("teacher-identity");
    const details = node("div");
    details.append(
        node("h3", person.full_name || "Teacher"),
        node("small", person.department || ""),
    );

    identity.replaceChildren(avatar(person), details);
    get("selected-teacher").hidden = false;
    get("change-teacher").focus();

    status("booking-status", "");
    await loadSlots();
}

async function loadSlots() {
    if (!teacher) return;

    const version = ++selectionVersion;
    const teacherId = teacher.id;
    const container = get("teacher-slots");

    activeSlot = null;
    book.disabled = true;
    container.replaceChildren(node("p", "Loading available times…", "muted"));

    try {
        const slots = await api("get_available_slots");
        if (version !== selectionVersion) return;
        renderSlots(slots.filter((item) => item.teacher_id === teacherId));
    } catch (error) {
        if (version !== selectionVersion) return;
        container.replaceChildren(node("p", error.message, "muted"));
        container.append(button("Retry", loadSlots));
    }
}

function renderSlots(slots) {
    const container = get("teacher-slots");
    container.replaceChildren();

    if (!slots.length) {
        container.append(
            node("p", "No times available. You can request another time below.", "muted"),
        );
        return;
    }

    const days = new Map();

    for (const slot of slots) {
        const day = dateFormat.format(new Date(slot.starts_at));
        if (!days.has(day)) days.set(day, []);
        days.get(day).push(slot);
    }

    const dates = node("div", "", "slot-options");
    const times = node("div", "", "slot-options");

    dates.setAttribute("aria-label", "Available dates");
    times.setAttribute("aria-label", "Available times");

    function showTimes(day, selection) {
        activeSlot = null;
        book.disabled = true;

        for (const option of dates.children) {
            option.setAttribute("aria-pressed", String(option === selection));
        }

        times.replaceChildren();

        for (const slot of days.get(day)) {
            const time = timeFormat.format(new Date(slot.starts_at));

            const option = button(time, () => {
                activeSlot = slot;
                book.disabled = bookingBusy;

                for (const other of times.children) {
                    other.setAttribute("aria-pressed", String(option === other));
                }
            });

            option.setAttribute("aria-pressed", "false");
            option.setAttribute("aria-label", dateTime(slot.starts_at));
            times.append(option);
        }
    }

    for (const day of days.keys()) {
        const option = button(day, () => showTimes(day, option));
        dates.append(option);
    }

    container.append(dates, times);
    showTimes(days.keys().next().value, dates.firstElementChild);
}

function setBookingBusy(busy) {
    bookingBusy = busy;

    const controls = [
        "change-teacher",
        "toggle-request",
        "send-request",
        "browse-teachers",
        "teacher-search",
    ];

    for (const id of controls) {
        get(id).disabled = busy;
    }

    book.disabled = busy || !activeSlot;
    renderDirectory();
}

function activityCard(name, label, css) {
    const item = node("article", "", "activity-card " + css);
    const title = node("div", "", "activity-heading");

    title.append(node("h3", name || "Teacher"), node("span", label, "badge"));
    item.append(title);

    return item;
}

function appointmentCard(appointment, past) {
    const cancelled = appointment.status === "cancelled";
    const label = cancelled ? "Cancelled" : past ? "Completed" : "Confirmed";
    const item = activityCard(
        appointment.teacher_name,
        label,
        cancelled ? "declined" : "confirmed",
    );

    const end = new Date(appointment.ends_at);
    const sameDay = localDate(new Date(appointment.starts_at)) === localDate(end);
    const endText = sameDay ? timeFormat.format(end) : dateTime(end);

    item.append(node("p", `${dateTime(appointment.starts_at)}–${endText}`, "muted"));

    if (appointment.followup_summary || appointment.followup_action_items) {
        const followUp = node("details", "", "follow-up");
        followUp.append(node("summary", "Teacher follow-up"));

        if (appointment.followup_summary) {
            followUp.append(node("p", appointment.followup_summary));
        }

        if (appointment.followup_action_items) {
            followUp.append(node("p", "Action items: " + appointment.followup_action_items));
        }

        item.append(followUp);
    }

    return item;
}

function requestCard(record) {
    const labels = {
        pending: "Pending",
        proposed: "New time proposed",
        accepted: "Accepted",
        declined: "Declined",
    };

    const item = activityCard(
        record.teacher_name,
        labels[record.status] || record.status,
        record.status,
    );

    const timeline = node("ol", "", "timeline");

    function addStep(title, value) {
        const step = node("li");
        step.append(node("strong", title), node("small", value));
        timeline.append(step);
    }

    addStep("Request sent", "Preferred time · " + dateTime(record.preferred_start));

    if (record.proposed_start) {
        addStep("Teacher suggested a new time", dateTime(record.proposed_start));
    }

    if (record.status === "accepted") {
        addStep("Request accepted", "See your confirmed consultation for the booking.");
    }

    if (record.status === "declined") {
        addStep(
            record.proposed_start ? "New time declined" : "Request declined",
            record.proposed_start ? "The proposed time was not booked." : "Your request was not booked.",
        );
    }

    item.append(timeline);

    if (record.message) item.append(node("p", record.message, "muted"));

    if (record.status === "proposed" && record.proposed_start) {
        const actions = node("div", "", "actions");
        actions.append(
            button("Accept new time", () => answerProposal(record, true, actions), "button primary"),
            button("Decline", () => answerProposal(record, false, actions)),
        );
        item.append(actions);
    }

    return item;
}

async function loadActivity() {
    const version = ++activityVersion;
    const feed = get("activity-feed");
    const history = get("history-feed");

    try {
        const data = await api("get_student_appointments");
        if (version !== activityVersion) return;

        const upcoming = [];
        const active = [];
        const past = [];
        const now = Date.now();

        for (const appointment of data.appointments || []) {
            const ended = Date.parse(appointment.ends_at) <= now;
            const archived = ended || appointment.status === "cancelled";

            (archived ? past : upcoming).push({
                date: Date.parse(appointment.starts_at),
                element: appointmentCard(appointment, ended),
            });
        }

        for (const record of data.requests || []) {
            const entry = {
                date: Date.parse(record.preferred_start),
                element: requestCard(record),
            };

            if (
                record.status === "accepted" ||
                (record.status === "pending" && entry.date <= now) ||
                (record.status === "proposed" && Date.parse(record.proposed_start) <= now)
            ) {
                past.push(entry);
            } else {
                active.push(entry);
            }
        }

        upcoming.sort((a, b) => a.date - b.date);
        past.sort((a, b) => b.date - a.date);

        const scheduled = [...upcoming, ...active];
        feed.replaceChildren(...scheduled.map((entry) => entry.element));

        if (!scheduled.length) {
            feed.append(node("p", "No upcoming consultations or active requests.", "muted"));
        }

        history.replaceChildren(...past.map((entry) => entry.element));
        get("consultation-history").hidden = past.length === 0;
        get("history-count").textContent = past.length ? "(" + past.length + ")" : "";
    } catch (error) {
        if (version !== activityVersion) return;
        feed.replaceChildren(node("p", "Could not load consultations. " + error.message, "muted"));
    }
}

async function answerProposal(record, accept, actions) {
    if (activityBusy) return;

    activityBusy = true;
    for (const control of actions.children) control.disabled = true;

    try {
        await api("respond_to_proposal", {
            request_id: record.id,
            accept,
        });

        status(
            "student-status",
            accept ? "New time confirmed." : "Proposed time declined.",
            "success",
        );

        await Promise.all([loadActivity(), loadSlots()]);
    } catch (error) {
        status("student-status", error.message, "error");
    } finally {
        activityBusy = false;
        for (const control of actions.children) control.disabled = false;
    }
}

search.addEventListener("input", renderDirectory);

search.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" && !results.hidden) {
        event.preventDefault();
        results.querySelector("button:not(:disabled)")?.focus();
    }

    if (event.key === "Enter" && !results.hidden && results.children.length === 1) {
        event.preventDefault();
        results.firstElementChild.click();
    }

    if (event.key === "Escape") {
        search.value = "";
        browseOpen = false;
        renderDirectory();
    }
});

browse.addEventListener("click", () => {
    const isOpen = browseOpen || Boolean(search.value.trim());
    search.value = "";
    browseOpen = !isOpen;
    renderDirectory();
});

get("change-teacher").addEventListener("click", () => {
    teacher = null;
    activeSlot = null;
    selectionVersion += 1;
    get("selected-teacher").hidden = true;

    browseOpen = true;
    renderDirectory();
    search.focus();
});

book.addEventListener("click", async () => {
    if (bookingBusy || !activeSlot) return;

    setBookingBusy(true);
    status("booking-status", "Booking your time…");

    try {
        const result = await api("book_slot", { slot_id: activeSlot.id });
        status("booking-status", result.message, "success");
        await Promise.all([loadSlots(), loadActivity()]);
    } catch (error) {
        status("booking-status", error.message, "error");
        await loadSlots();
    } finally {
        setBookingBusy(false);
    }
});

get("toggle-request").addEventListener("click", () => {
    toggleRequest(request.hidden);
    status("booking-status", "");
});

dateInput.addEventListener("change", () => {
    get("preferred-date-text").textContent =
        dateInput.value.split("-").reverse().join("/") || "DD/MM/YYYY";
});

dateInput.addEventListener("click", () => {
    try {
        dateInput.showPicker?.();
    } catch {
        // Use the browser's native date picker.
    }
});

request.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (bookingBusy || !teacher) return;

    setBookingBusy(true);

    try {
        const start = new Date(dateInput.value + "T" + get("preferred-time").value);

        if (Number.isNaN(start.getTime()) || start <= new Date()) {
            throw new Error("Choose a future date and time.");
        }

        const result = await api("request_consultation", {
            teacher_id: teacher.id,
            preferred_start: start.toISOString(),
            message: get("request-message").value.trim(),
        });

        resetRequest();
        status("booking-status", result.message, "success");
        await loadActivity();
    } catch (error) {
        status("booking-status", error.message, "error");
    } finally {
        setBookingBusy(false);
        if (request.hidden) get("toggle-request").focus();
    }
});

get("refresh-activity").addEventListener("click", async (event) => {
    const control = event.currentTarget;
    control.disabled = true;

    try {
        await Promise.all([loadDirectory(), loadActivity(), loadSlots()]);
    } finally {
        control.disabled = false;
    }
});

get("logout-button").addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;

    try {
        await logoutUser();
    } finally {
        window.location.replace("/index.html");
    }
});

async function start() {
    if (!getSessionToken()) {
        window.location.replace("/student-login.html");
        return;
    }

    try {
        const user = await getProfile();

        if (user.role !== "student") {
            window.location.replace(
                user.role === "teacher" ? "/teacher.html" : "/student-login.html",
            );
            return;
        }

        get("student-name").textContent = user.full_name || "Student";
        get("student-workspace").hidden = false;
        status("student-status", "");

        await Promise.all([loadDirectory(), loadActivity()]);
    } catch (error) {
        status("student-status", "Could not sign you in. " + error.message, "error");
    }
}

await start();