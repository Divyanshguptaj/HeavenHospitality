const transporter = require('../config/mailer');

const sendEnquiryEmail = async (enquiry) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD || !process.env.ADMIN_EMAIL) {
    throw new Error('Email notifications are not configured (EMAIL_USER, EMAIL_APP_PASSWORD, ADMIN_EMAIL).');
  }

  const { name, phone, email, roomType, message, moveInDate, createdAt } = enquiry;

  const submittedAt = new Date(createdAt || Date.now()).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const lines = [
    'New enquiry received on The Heaven Hospitality website.',
    '',
    `Name: ${name}`,
    `Phone: ${phone}`,
    `Email: ${email}`,
    roomType ? `Room/requirement: ${roomType}` : null,
    moveInDate ? `Preferred move-in date: ${new Date(moveInDate).toLocaleDateString('en-IN')}` : null,
    `Query: ${message || 'No message provided.'}`,
    '',
    `Submitted: ${submittedAt}`,
  ].filter(Boolean);

  return transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: process.env.ADMIN_EMAIL,
    replyTo: email,
    subject: 'New Enquiry - The Heaven Hospitality',
    text: lines.join('\n'),
  });
};

module.exports = { sendEnquiryEmail };
