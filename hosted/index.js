const express = require('express');
const mongoose = require('mongoose');
const config = require('./config.json');
const RxPacket = require('./models/RxPacket');
const Node = require('./models/Node');

const app = express();
const port = config.port;

// Middleware to parse JSON bodies
app.use(express.json());

// MongoDB connection
console.log('Connecting to MongoDB', config.mongoURI);
mongoose.connect(config.mongoURI)
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.log(err));

// Express route
app.post('/addPacket', async (req, res) => {
    try {
        if (!req.body) {
            console.log('Missing request body');
            return res.status(400).send('Missing request body');
        }

        const requiredFields = ['packet', 'id', 'node', 'channel', 'param', 'msgType', 'domain', 'apiKey'];
        const missingFields = requiredFields.filter(field => !(field in req.body));

        if (missingFields.length > 0) {
            console.log('Missing required fields', missingFields);
            return res.status(400).send(`Missing required fields: ${missingFields.join(', ')}`);
        }

        const { packet, id, node, channel, param, msgType, domain, apiKey } = req.body;

        // Find the node and verify domain and apiKey
        const targetNode = await Node.findOne({ _id: id, domain: domain });

        if (!targetNode) {
            console.log('Node not found in the specified domain', id, domain);
            return res.status(404).send('Node not found in the specified domain');
        }

        if (targetNode.apiKey !== apiKey) {
            return res.status(401).send('Invalid API key');
        }

        const newPacket = new RxPacket({
            time: new Date(),
            packet: Buffer.from(packet, 'base64'), // Assuming packet is sent as a base64 string
            domain: domain,
            meta: {
                id,
                node,
                channel,
                param,
                msgType
            }
        });

        await newPacket.save();
        res.status(201).send('Packet saved');
    } catch (error) {
        console.error(error);
        res.status(500).send('Error saving packet');
    }
});


app.listen(port, () => {
    console.log(`Web server listening at http://localhost:${port}`);
}); 