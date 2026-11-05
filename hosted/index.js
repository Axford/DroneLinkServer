const fs = require('fs');
const mongoose = require('mongoose');
const { createApp } = require('./app');

// Check if config.json exists, create skeleton if not
const configPath = './config.json';
if (!fs.existsSync(configPath)) {
    console.error('❌ ERROR: config.json not found!');
    console.log('📝 Creating skeleton config.json file...');
    
    const skeletonConfig = {
        "mongoURI": "mongodb://username:password@host:port/database",
        "port": 8003,
        "googleClientID": "your-google-client-id",
        "googleClientSecret": "your-google-client-secret", 
        "cookieKey": "your-random-cookie-key-at-least-32-characters-long",
        "mapboxAccessToken": "your-mapbox-access-token"
    };
    
    try {
        fs.writeFileSync(configPath, JSON.stringify(skeletonConfig, null, 4));
        console.log('✅ Created skeleton config.json');
        console.log('⚠️  Please edit config.json with your actual configuration values and restart the server.');
        console.log('🔧 Required values:');
        console.log('   - mongoURI: Your MongoDB connection string');
        console.log('   - googleClientID: Google OAuth client ID');
        console.log('   - googleClientSecret: Google OAuth client secret');
        console.log('   - cookieKey: Random string for session encryption');
        console.log('   - mapboxAccessToken: Your Mapbox access token');
        process.exit(1);
    } catch (error) {
        console.error('❌ Failed to create config.json:', error.message);
        process.exit(1);
    }
}

const config = require('./config.json');

const models = {
    RxPacket: require('./models/RxPacket'),
    User: require('./models/User'),
    Domain: require('./models/Domain')
};
require('./models/Node'); // Preserve registration of the existing persistence schema.
const app = createApp({ config, models });

// Startup remains the service entrypoint's responsibility.
console.log('Connecting to MongoDB', config.mongoURI);
mongoose.connect(config.mongoURI)
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.log(err));

app.listen(config.port, () => {
    console.log(`Web server listening at http://localhost:${config.port}`);
});
