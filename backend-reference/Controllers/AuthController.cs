using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RestX.BLL.DataTranferObjects.Authentication;
using RestX.BLL.Interfaces.Auth;

namespace RestX.WebApp.Controllers
{
    /// <summary>
    /// Authentication Controller with Email Confirmation Support
    /// This is a REFERENCE implementation for RestX-API-ex
    /// </summary>
    [Route("api/auth")]
    [ApiController]
    public class AuthController : ControllerBase
    {
        private readonly IAuthService authService;
        private readonly IEmailService emailService;

        public AuthController(IAuthService authService, IEmailService emailService)
        {
            this.authService = authService;
            this.emailService = emailService;
        }

        /// <summary>
        /// Register new user with email confirmation
        /// Does NOT auto-login - user must confirm email first
        /// </summary>
        [HttpPost("register")]
        [AllowAnonymous]
        public async Task<IActionResult> Register([FromBody] RegisterRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    return BadRequest(ModelState);
                }

                var result = await authService.RegisterAsync(request);

                if (!result.Success)
                {
                    return BadRequest(result);
                }

                // Return success without tokens (user needs to confirm email)
                return Ok(new
                {
                    success = true,
                    message = "Registration successful! Please check your email to confirm your account."
                });
            }
            catch (Exception ex)
            {
                return BadRequest(new
                {
                    success = false,
                    message = "An error occurred during registration",
                    error = ex.Message
                });
            }
        }

        /// <summary>
        /// Confirm email with token from email link
        /// </summary>
        [HttpGet("confirm-email")]
        [AllowAnonymous]
        public async Task<IActionResult> ConfirmEmail([FromQuery] string email, [FromQuery] string token)
        {
            try
            {
                if (string.IsNullOrEmpty(email) || string.IsNullOrEmpty(token))
                {
                    return BadRequest(new
                    {
                        success = false,
                        message = "Email and token are required"
                    });
                }

                var result = await authService.ConfirmEmailAsync(email, token);

                if (!result.Success)
                {
                    return BadRequest(result);
                }

                // Option 1: Return success message (user needs to login manually)
                return Ok(new
                {
                    success = true,
                    message = "Email confirmed successfully! You can now login."
                });

                // Option 2: Auto-login after confirmation (uncomment if needed)
                // if (result.Data is LoginResponse loginData)
                // {
                //     SetAuthCookies(loginData);
                //     return Ok(result);
                // }
            }
            catch (Exception ex)
            {
                return BadRequest(new
                {
                    success = false,
                    message = "Email confirmation failed",
                    error = ex.Message
                });
            }
        }

        /// <summary>
        /// Resend confirmation email
        /// </summary>
        [HttpPost("resend-confirmation-email")]
        [AllowAnonymous]
        public async Task<IActionResult> ResendConfirmationEmail([FromBody] ResendConfirmationEmailRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    return BadRequest(ModelState);
                }

                var result = await authService.ResendConfirmationEmailAsync(request.Email);

                if (!result.Success)
                {
                    return BadRequest(result);
                }

                return Ok(new
                {
                    success = true,
                    message = "Confirmation email sent! Please check your inbox."
                });
            }
            catch (Exception ex)
            {
                return BadRequest(new
                {
                    success = false,
                    message = "Failed to resend confirmation email",
                    error = ex.Message
                });
            }
        }

        /// <summary>
        /// Login - now checks email confirmation
        /// </summary>
        [HttpPost("login")]
        [AllowAnonymous]
        public async Task<IActionResult> Login([FromBody] LoginRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    return BadRequest(ModelState);
                }

                var result = await authService.LoginAsync(request);

                if (!result.Success)
                {
                    return BadRequest(result);
                }

                // Set auth cookies if login successful
                if (result.Data is LoginResponse loginData)
                {
                    // SetAuthCookies(loginData);
                }

                return Ok(result);
            }
            catch (Exception ex)
            {
                return BadRequest(new
                {
                    success = false,
                    message = "Login failed",
                    error = ex.Message
                });
            }
        }
    }

    // DTOs
    public class RegisterRequest
    {
        public string Email { get; set; } = string.Empty;
        public string PhoneNumber { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
        public string FullName { get; set; } = string.Empty;
    }

    public class ResendConfirmationEmailRequest
    {
        public string Email { get; set; } = string.Empty;
    }

    public class LoginRequest
    {
        public string Email { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
    }
}
