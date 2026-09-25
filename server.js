const cors = require('cors');

// Allow ALL origins — MUST be before any routes
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS', 'HEAD'],
    allowedHeaders: ['*'],
    credentials: false
}));

// Handle preflight OPTIONS requests
app.options('*', cors());
