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
    const notification = await Notification.create({
      userId,
      title,
      message,
      type,
      actionData
    });

    // 2. Send Email (if email provided)
    if (email) {
      await transporter.sendMail({
        from: '"Applier Platform" <no-reply@applier.ai>',
        to: email,
        subject: title,
        text: message
      });
      // In a real app, log nodemailer.getTestMessageUrl(info)
    }

    // 3. (Future) Push Notification via Firebase Cloud Messaging
    // const fcmToken = await getUserFCMToken(userId);
    // if (fcmToken) admin.messaging().send(...)

    return notification;
  } catch (error) {
    console.error('Notification Error:', error);
  }
};
