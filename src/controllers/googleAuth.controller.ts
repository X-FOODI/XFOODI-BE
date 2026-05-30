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
  console.log('\n=== POST /api/auth/google HIT ===');
  console.log('Body:', req.body);
  
  try {
    const body = req.body as GoogleAuthRequestBody;
    
    // Validate googleToken
    if (!body.googleToken || typeof body.googleToken !== 'string') {
      console.error('[Controller] ❌ Invalid googleToken in request body');
      return res.status(400).json({
        success: false,
        message: 'googleToken is required and must be a string',
      });
    }

    const googleToken = body.googleToken;
    console.log('[Controller] googleToken received, length:', googleToken.length);
    console.log('[Controller] Calling signInWithGoogle...');
    
    const data = await signInWithGoogle(googleToken, req.headers);
    
    console.log('[Controller] ✓ signInWithGoogle success');
    console.log('[Controller] Returning response with user ID:', data.user.id);

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    console.error('\n[Controller] ❌ ERROR in postGoogleAuth');
    
    // Handle known Google auth errors
    if (err instanceof GoogleAuthHttpError) {
      console.error('[Controller] GoogleAuthHttpError:', err.statusCode, err.message);
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
      });
    }

    // Handle unexpected errors
    const error = err as Error;
    console.error('[Controller] Unexpected error type:', error.constructor.name);
    console.error('[Controller] Error message:', error.message);
    console.error('[Controller] Error stack:', error.stack);

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
