import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import crypto from "crypto";

/**
 * TOTP (Time-based One-Time Password) Service
 * Used for 2FA (Two-Factor Authentication) on admin accounts
 * Compatible with Google Authenticator, Authy, Microsoft Authenticator
 */
class TOTPService {
  private readonly issuer = "XFoodi Admin";
  private readonly algorithm = "SHA1";
  private readonly digits = 6;
  private readonly period = 30; // seconds

  /**
   * Generate a new TOTP secret for an admin user
   */
  generateSecret(email: string): { secret: string; uri: string } {
    const secret = new OTPAuth.Secret({ size: 20 });
    const totp = new OTPAuth.TOTP({
      issuer: this.issuer,
      label: email,
      algorithm: this.algorithm,
      digits: this.digits,
      period: this.period,
      secret,
    });

    return {
      secret: secret.base32,
      uri: totp.toString(),
    };
  }

  /**
   * Generate a QR code data URL from TOTP URI
   * Returns base64-encoded PNG image
   */
  async generateQRCode(uri: string): Promise<string> {
    return QRCode.toDataURL(uri, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 256,
      color: {
        dark: "#000000",
        light: "#ffffff",
      },
    });
  }

  /**
   * Verify a 6-digit TOTP token against a secret
   * Uses window=1 to allow 1 period tolerance (±30s)
   */
  verify(secret: string, token: string): boolean {
    try {
      const totp = new OTPAuth.TOTP({
        issuer: this.issuer,
        algorithm: this.algorithm,
        digits: this.digits,
        period: this.period,
        secret: OTPAuth.Secret.fromBase32(secret),
      });

      // delta is null if invalid, or a number indicating the time offset
      const delta = totp.validate({ token, window: 1 });
      return delta !== null;
    } catch (error) {
      console.error("[TOTP] Verification error:", error);
      return false;
    }
  }

  /**
   * Generate 10 backup codes for emergency access
   * Each code is 8 characters (hex uppercase)
   */
  generateBackupCodes(count: number = 10): string[] {
    return Array.from({ length: count }, () =>
      crypto.randomBytes(4).toString("hex").toUpperCase()
    );
  }

  /**
   * Hash a backup code for secure storage
   */
  hashBackupCode(code: string): string {
    return crypto.createHash("sha256").update(code.toUpperCase()).digest("hex");
  }

  /**
   * Verify a backup code against stored hashed codes
   */
  verifyBackupCode(code: string, hashedCodes: string[]): number {
    const hashedInput = this.hashBackupCode(code);
    return hashedCodes.findIndex((hashed) => hashed === hashedInput);
  }
}

export default new TOTPService();
