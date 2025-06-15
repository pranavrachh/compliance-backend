const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

function sendReminderEmail(to, subject, html) {
  const msg = {
    to,
    from: 'info@rightflowindia.com', // Your verified sender email
    subject,
    html,
  };
  return sgMail.send(msg);
}

module.exports = { sendReminderEmail };
