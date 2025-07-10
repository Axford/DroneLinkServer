/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {setGlobalOptions} = require("firebase-functions");
const {onRequest} = require("firebase-functions/https");
const logger = require("firebase-functions/logger");

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({ maxInstances: 10 });

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

// The Firebase Admin SDK to access Firestore.
const { initializeApp } = require("firebase-admin/app");
const {
    getFirestore,
    collection,
    where,
    get,
    getDoc,
    set,
    add,
} = require("firebase-admin/firestore");

initializeApp();

// Take JSON post-ed body and add to /<domain>/rxPackets
// as long as <domain> is valid and the apiKey matches /<domain>/nodes/<id>/apiKey
// if not valid, return 401
// if valid, add to Firestore
// return 200

exports.addRxPacket = onRequest(
    {
        cors: true,
    },
    async (req, res) => {
        try {

            // get domain and apiKey from request   
            const domain = req.body.domain;
            const apiKey = req.body.apiKey;

            logger.info("addRxPacket", "collectionPath: " + "domains/"+domain+"/nodes");

            // get the node from the domainDoc in the "nodes" sub-collection
            const nodeDoc = await getFirestore().collection("domains/"+domain+"/nodes").doc(req.body.id.toString()).get();

            if (!nodeDoc.exists) {
                res.status(401).send("Invalid node");
                return;
            }

            // compare apiKey with nodeDoc.data().apiKey
            if (apiKey !== nodeDoc.data().apiKey) {
                res.status(401).send("Invalid apiKey");
                return;
            }

            logger.info("addRxPacket", "packetPath: " + "domains/"+domain+"/rxPackets");

            // add the packet to the nodeDoc in the "rxPackets" sub-collection
            const rxPacketDoc = await getFirestore().collection("domains/"+domain+"/rxPackets").add({
                id: req.body.id,
                time: Date.now(),
                packet: req.body.packet,
                node: req.body.node,
                channel: req.body.channel,
                param: req.body.param,
            });

            // return 200
            res.status(200).send("OK");
        } catch (error) {
            res.status(500).send("Error: " + error.message + ', ' + JSON.stringify(req.body));
        }
    }
);