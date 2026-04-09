const nodemailer = require('nodemailer');

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

async function sendEmail({ to, subject, html }) {
  const transporter = createTransport();

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject,
    html
  });
}

async function sendTaskReminder(task) {
  if (!task.email) return;

  const subject = `Tarea próxima a vencer: ${task.taskName}`;

  const html = `
    <h2>${task.taskName}</h2>
    <p><strong>Cliente:</strong> ${task.clientName}</p>
    <p><strong>Vence:</strong> ${task.dueDate}</p>
    <p><strong>Prioridad:</strong> ${task.priority}</p>
  `;

  await sendEmail({
    to: task.email,
    subject,
    html
  });
}

module.exports = {
  sendEmail,
  sendTaskReminder
};
