import redisClient from './lib/redis';

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  let email = '';
  
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--email' || args[i] === '-e') && args[i + 1]) {
      email = args[i + 1].trim().toLowerCase();
      break;
    }
  }

  if (!email) {
    // Default to the admin email if not provided
    email = 'xfoodiprojects@gmail.com';
    console.log(`No email provided. Defaulting to: ${email}`);
  }

  console.log(`Connecting to Redis to unlock admin: ${email}...`);
  
  // Connect Redis client if not already connected
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }

  const failKey = `admin_login_fail:${email}`;
  const exists = await redisClient.exists(failKey);

  if (exists) {
    const currentFails = await redisClient.get(failKey);
    console.log(`Account is currently locked/limited with ${currentFails} failed attempts.`);
    
    // Delete the lockout key
    await redisClient.del(failKey);
    console.log(`\n✅ Success: Deleted Redis key "${failKey}". Account is now unlocked!`);
  } else {
    console.log(`\nℹ️ Info: Redis key "${failKey}" does not exist. The account is already unlocked.`);
  }

  // Also check general login fail key
  const normalFailKey = `login_fail:${email}`;
  const normalExists = await redisClient.exists(normalFailKey);
  if (normalExists) {
    await redisClient.del(normalFailKey);
    console.log(`✅ Success: Also deleted normal user lockout key "${normalFailKey}".`);
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    if (redisClient.isOpen) {
      await redisClient.quit();
    }
  });
