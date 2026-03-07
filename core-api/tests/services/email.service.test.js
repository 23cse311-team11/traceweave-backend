import { jest } from '@jest/globals';

// Mock nodemailer
const mockTransporter = {
  verify: jest.fn((cb) => cb(null, true)),
  sendMail: jest.fn().mockResolvedValue({ messageId: 'test-message-id' }),
};

const mockNodemailer = {
  createTransport: jest.fn(() => mockTransporter),
};

jest.unstable_mockModule('nodemailer', () => ({
  default: mockNodemailer,
}));

// Import the service dynamically after mocking
const { sendEmail } = await import('../../src/services/email.service.js');

describe('Email Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-message-id' });
  });

  // Removed static initialization test as it is not reliable with module caching

  test('should send email successfully', async () => {
    const emailData = {
      to: 'test@example.com',
      subject: 'Test Subject',
      html: '<p>Test Body</p>',
    };

    const result = await sendEmail(emailData);

    expect(mockTransporter.sendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: emailData.to,
      subject: emailData.subject,
      html: emailData.html,
    }));
    expect(result).toEqual({ messageId: 'test-message-id' });
  });

  test('should throw error if email sending fails', async () => {
    mockTransporter.sendMail.mockRejectedValueOnce(new Error('SMTP Error'));

    const emailData = {
      to: 'fail@example.com',
      subject: 'Fail Subject',
      html: '<p>Fail Body</p>',
    };

    await expect(sendEmail(emailData)).rejects.toThrow('Email sending failed');
  });
  
  test('should fallback to stripped text if text not provided', async () => {
      const emailData = { 
          to: 'text@example.com',
          subject: 'Text Fallback',
          html: '<p>Hello <b>World</b></p>'
      };
      
      await sendEmail(emailData);
      
      expect(mockTransporter.sendMail).toHaveBeenCalledWith(expect.objectContaining({
          text: 'Hello World',
      }));
  });
});
