import { verifyGoogleToken, GoogleAuthHttpError } from '../googleAuth.service';
import { OAuth2Client } from 'google-auth-library';

// Mock google-auth-library
jest.mock('google-auth-library');

describe('GoogleAuth Service', () => {
  describe('verifyGoogleToken', () => {
    let mockVerifyIdToken: jest.Mock;

    beforeEach(() => {
      jest.clearAllMocks();
      mockVerifyIdToken = jest.fn();
      (OAuth2Client as jest.MockedClass<typeof OAuth2Client>).mockImplementation(() => ({
        verifyIdToken: mockVerifyIdToken,
      } as any));
    });

    it('should successfully verify valid Google token', async () => {
      const mockPayload = {
        email: 'test@example.com',
        email_verified: true,
        name: 'Test User',
        picture: 'https://example.com/photo.jpg',
      };

      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => mockPayload,
      });

      const result = await verifyGoogleToken('valid_token_123');

      expect(result).toEqual({
        email: 'test@example.com',
        name: 'Test User',
        picture: 'https://example.com/photo.jpg',
      });
    });

    it('should throw error for empty token', async () => {
      await expect(verifyGoogleToken('')).rejects.toThrow(GoogleAuthHttpError);
      await expect(verifyGoogleToken('')).rejects.toMatchObject({
        statusCode: 400,
        message: 'googleToken is required',
      });
    });

    it('should throw error for unverified email', async () => {
      const mockPayload = {
        email: 'test@example.com',
        email_verified: false,
        name: 'Test User',
      };

      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => mockPayload,
      });

      await expect(verifyGoogleToken('token')).rejects.toThrow(GoogleAuthHttpError);
      await expect(verifyGoogleToken('token')).rejects.toMatchObject({
        statusCode: 403,
        message: 'Google email is not verified',
      });
    });

    it('should throw error for invalid token', async () => {
      mockVerifyIdToken.mockRejectedValue(new Error('Invalid token'));

      await expect(verifyGoogleToken('invalid_token')).rejects.toThrow(GoogleAuthHttpError);
      await expect(verifyGoogleToken('invalid_token')).rejects.toMatchObject({
        statusCode: 401,
        message: 'Invalid Google token',
      });
    });

    it('should normalize email to lowercase', async () => {
      const mockPayload = {
        email: 'Test@Example.COM',
        email_verified: true,
        name: 'Test User',
      };

      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => mockPayload,
      });

      const result = await verifyGoogleToken('token');

      expect(result.email).toBe('test@example.com');
    });
  });
});
