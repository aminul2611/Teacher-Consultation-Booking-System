import { callRPC } from "./rpc.js";

const slotForm = document.getElementById("slot-form");
const slotStatus = document.getElementById("slot-status");
const appointmentsList = document.getElementById("appointments-list");

slotForm.addEventListener("submit", async event => {
    event.preventDefault();
    slotStatus.textContent = "Adding slot...";

    try {
        const result = await callRPC("add_slot", {
            teacher: document.getElementById("teacher-name").value,
            department: document.getElementById("department").value,
            date: document.getElementById("slot-date").value,
            start_time: document.getElementById("start-time").value,
            end_time: document.getElementById("end-time").value
        });

        slotStatus.textContent = result.message;
        slotForm.reset();
    } catch (error) {
        slotStatus.textContent = error.message;
    }
});

async function loadAppointments() {
    appointmentsList.textContent = "Loading appointments...";

    try {
        const appointments = await callRPC("get_appointments");
        appointmentsList.replaceChildren();

        if (appointments.length === 0) {
            appointmentsList.textContent = "No appointments yet.";
            return;
        }

        appointments.forEach(appointment => {
            const card = document.createElement("article");
            const student = document.createElement("h3");
            const details = document.createElement("p");
            const topic = document.createElement("p");
            const status = document.createElement("p");

            student.textContent =
                `${appointment.student_name} (${appointment.student_id})`;

            details.textContent =
                `${appointment.teacher} | ${appointment.department} | ` +
                `${appointment.date} | ${appointment.start_time}–` +
                `${appointment.end_time}`;

            topic.textContent = `Topic: ${appointment.topic}`;
            status.textContent = `Status: ${appointment.status}`;

            card.append(student, details, topic, status);
            appointmentsList.append(card);
        });
    } catch (error) {
        appointmentsList.textContent =
            `Could not load appointments: ${error.message}`;
    }
}

document
    .getElementById("load-appointments-button")
    .addEventListener("click", loadAppointments);