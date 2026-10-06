require('dotenv').config();

// Keep date formatting assertions stable regardless of the host timezone.
process.env.TZ = 'UTC';
