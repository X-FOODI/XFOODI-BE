import type { RequestHandler } from 'express';
import { signInWithGoogle, GoogleAuthHttpError } from '../services/googleAuth.service';

type GoogleAuthRequestBody = {
  googleToken?: unknown;
};

/**
 * POST /api/auth/google
 * Handles Google OAuth sign-in
 * 
 * Request body: { googleToken: string }
 * Response: { success: true, data: { accessToken, refreshToken, user } }
 */
export const postGoogleAuth: RequestHandler = async (req, res) => {
  try {
    const body = req.body as GoogleAuthRequestBody;
    
    // Validate googleToken
    if (!body.googleToken || typeof body.googleToken !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'googleToken is required and must be a string',
      });
    }

    const googleToken = body.googleToken;
    const data = await signInWithGoogle(googleToken);

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    // Handle known Google auth errors
    if (err instanceof GoogleAuthHttpError) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
      });
    }

    // Handle unexpected errors
    const error = err as Error;
    console.error('[GoogleAuth Controller] Unexpected error:', error.message);
    console.error('[GoogleAuth Controller] Stack:', error.stack);

    res.status(500).json({
      success: false,
      message: 'Internal server error during Google authentication',
      ...(process.env.NODE_ENV === 'development' && { 
        error: error.message,
        stack: error.stack 
      }),
    });
  }
};
