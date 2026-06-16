import axios from 'axios';

async function main() {
  const services = [
    'https://api.ipify.org?format=json',
    'https://ifconfig.me/all.json',
    'https://ipinfo.io/json',
    'https://api64.ipify.org?format=json'
  ];

  for (const service of services) {
    try {
      const response = await axios.get(service);
      console.log(`\nService: ${service}`);
      console.log(`Data:`, JSON.stringify(response.data, null, 2));
    } catch (e: any) {
      console.error(`Failed for ${service}:`, e.message);
    }
  }
}

main();
