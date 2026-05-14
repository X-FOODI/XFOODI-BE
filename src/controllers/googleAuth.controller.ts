import type { RequestHandler } from 'express';
import { signInWithGoogle, GoogleAuthHttpError } from '../services/googleAuth.service';

type GoogleAuthRequestBody = {
  googleToken?: unknown;
};

export const postGoogleAuth: RequestHandler = async (req, res) => {
  try {
    const body = req.body as GoogleAuthRequestBody;
    const googleToken = typeof body.googleToken === 'string' ? body.googleToken : '';

    const data = await signInWithGoogle(googleToken);

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    if (err instanceof GoogleAuthHttpError) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
      });
    }
    console.error('Google auth error:', err);
    res.status(500).json({
      success: false,
      message: 'Internal server error during Google authentication',
    });
  }
};
