import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { MailService } from './mail.service';

jest.mock('nodemailer');

describe('MailService', () => {
  let service: MailService;
  let sendMailMock: jest.Mock;

  const createTransporterMock = () => {
    sendMailMock = jest
      .fn()
      .mockResolvedValue({ messageId: 'mock-message-id' });
    return {
      sendMail: sendMailMock,
    } as unknown as nodemailer.Transporter;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should be configured when SMTP_HOST, SMTP_USER and SMTP_PASS are present', async () => {
    (nodemailer.createTransport as jest.Mock).mockReturnValue(
      createTransporterMock(),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              const values: Record<string, string> = {
                SMTP_HOST: 'smtp.mail.ovh.net',
                SMTP_PORT: '587',
                SMTP_USER: 'noreply@urbanflow-mobility.fr',
                SMTP_PASS: 'secret',
                SMTP_FROM: 'UrbanFlow <noreply@urbanflow-mobility.fr>',
              };
              return values[key];
            },
          },
        },
      ],
    }).compile();

    service = module.get<MailService>(MailService);
    expect(service.isConfigured()).toBe(true);
  });

  it('should not be configured when SMTP_HOST is missing', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        {
          provide: ConfigService,
          useValue: {
            get: () => undefined,
          },
        },
      ],
    }).compile();

    service = module.get<MailService>(MailService);
    expect(service.isConfigured()).toBe(false);
  });

  it('should send an email and return messageId', async () => {
    (nodemailer.createTransport as jest.Mock).mockReturnValue(
      createTransporterMock(),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              const values: Record<string, string | undefined> = {
                SMTP_HOST: 'smtp.mail.ovh.net',
                SMTP_PORT: '587',
                SMTP_USER: 'noreply@urbanflow-mobility.fr',
                SMTP_PASS: 'secret',
                SMTP_FROM: 'UrbanFlow <noreply@urbanflow-mobility.fr>',
              };
              return values[key];
            },
          },
        },
      ],
    }).compile();

    service = module.get<MailService>(MailService);
    const result = await service.send({
      to: 'user@example.com',
      subject: 'Test',
      text: 'Hello',
      html: '<p>Hello</p>',
    });

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'UrbanFlow <noreply@urbanflow-mobility.fr>',
        to: 'user@example.com',
        subject: 'Test',
        text: 'Hello',
        html: '<p>Hello</p>',
      }),
    );
    expect(result).toEqual({ messageId: 'mock-message-id' });
  });

  it('should return empty object when transporter is not configured', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        {
          provide: ConfigService,
          useValue: {
            get: () => undefined,
          },
        },
      ],
    }).compile();

    service = module.get<MailService>(MailService);
    const result = await service.send({
      to: 'user@example.com',
      subject: 'Test',
    });

    expect(result).toEqual({});
    expect(sendMailMock).not.toHaveBeenCalled();
  });
});
