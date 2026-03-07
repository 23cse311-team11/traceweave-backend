import nodemailer from 'nodemailer';

// Create the Transporter (The Connection)
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT),
  secure: process.env.EMAIL_SECURE === 'true', 
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Verify Connection on Startup
if (process.env.NODE_ENV !== 'test') {
    transporter.verify((error, success) => {
        if (error) {
            console.error('❌ Email Service Error:', error.message);
        } else {
            console.log('✅ Email Service is ready to send messages');
        }
    });
}

/**
 * Send an email
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} html - HTML content of the email
 * @param {string} text - (Optional) Plain text fallback
 */
export const sendEmail = async ({ to, subject, html, text }) => {
  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>?/gm, ''), // Simple strip tags for fallback
    });

    console.log(`📧 Email sent: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error('❌ Failed to send email:', error);
    throw new Error('Email sending failed');
  }
};