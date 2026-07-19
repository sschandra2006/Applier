import { Notification } from './notification.model.js';
import nodemailer from 'nodemailer';

// Mock Ethereal Email Transporter for development
const transporter = nodemailer.createTransport({
  host: 'smtp.ethereal.email',
  port: 587,
  auth: {
    user: 'demouser@ethereal.email',
    pass: 'demopassword123'
  }
});

export const sendNotification = async (userId, title, message, type = 'INFO', actionData = {}, email = null) => {
  try {
    // 1. Create In-App Notification (Database)
    let notification = null;
    if (userId) {
      notification = await Notification.create({
        userId,
        title,
        message,
        type,
        actionData
      });
    }

    // 2. Send Email (if email provided)
    if (email) {
      console.log(`\n========== EMAIL INTERCEPTED (DEV MODE) ==========`);
      console.log(`To: ${email}`);
      console.log(`Subject: ${title}`);
      console.log(`Body: ${message}`);
      console.log(`==================================================\n`);
      
      try {
        await transporter.sendMail({
          from: '"Applier Platform" <no-reply@applier.ai>',
          to: email,
          subject: title,
          text: message
        });
      } catch (emailError) {
        console.warn('Nodemailer failed to send email via Ethereal (Invalid credentials). Email was logged to console above.');
      }
    }

    return notification;
  } catch (error) {
    console.error('Notification Error:', error);
  }
};

