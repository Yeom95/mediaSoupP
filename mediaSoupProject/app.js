//serverside
import express from 'express';
const app = express();

import https from 'httpolyglot';
import fs from 'fs';
import path from 'path';
const __dirname = path.resolve();

import { Server } from 'socket.io';
import mediasoup from 'mediasoup';
//import { CreateWebRtcTransportRequest } from 'mediasoup/node/lib/fbs/router';

app.get('/', (req, res) => {
    res.send('Hello from mediasoup app!');
});

app.use('/sfu',express.static(path.join(__dirname,'public')));

//https 옵션으로 필요한듯
const options = {
    key: fs.readFileSync('./server/ssl/key.pem','utf-8'),
    cert: fs.readFileSync('./server/ssl/cert.pem','utf-8'),
};

const httpsServer = https.createServer(options, app);
httpsServer.listen(3000, () => {
    console.log('listening on port: ' + 3000);
});

const io = new Server(httpsServer);

const peers = io.of('/mediasoup');

peers.on('connection',(socket)=>{
    console.log(socket.id);
    socket.emit('connection-success',{
        socketId:socket.id,
    });
});

let worker;
let router;
let producerTransport;
let consumerTransport;

const createWorker = async() =>{
    worker = await mediasoup.createWorker({
        rtcMinPort:2000,
        rtcMaxPort:2020,
    });

    console.log(`worker pid ${worker.pid}`);

    worker.on('died',(error) => {
        console.error('mediasoup worker has died');
        setTimeout(()=>process.exit(1),2000);
    });

    return worker;
};

worker = createWorker();

const mediaCodecs = [
    {
        kind: 'audio',
        mimeType:'audio/opus',
        clockRate:48000,
        channels:2,
    },
    {
        kind:'video',
        mimeType:'video/VP8',
        clockRate:90000,
        parameters:{
            'x-google-start-bitrate':1000,
        },
    },
];

peers.on('connection',async (socket)=>{
    console.log(socket.id);
    socket.emit('connection-success',{
        socketId:socket.id,
    });

    socket.on('disconnect',() => {
        console.log('peer disconnected');
    });

    router = await worker.createRouter({ mediaCodecs });

    socket.on('getRtpCapabilities',(callback) =>{
        const rtpCapabilities = router.rtpCapabilities;
        console.log('rtp Capabilities',rtpCapabilities);

        callback({ rtpCapabilities });
    });

    socket.on('createWebRtcTransport',async({ sender },callback) => {
        console.log(`Is this a sender request? ${sender}`);
        if(sender)
        {producerTransport = await createWebRtcTransport(callback);}
        else
        {consumerTransport = await createWebRtcTransport(callback);}
    });

    socket.on('transport-connect',async ({ dtlsParameters }) => {
        console.log('DTLS PARAMS...',{ dtlsParameters });
        await producerTransport.connect({ dtlsParameters });
    });

    socket.on('transport-produce',async({ kind,rtpParameters,appData },callback)=>{
        kind,
        rtpParameters,
        appData;
    });
});

const createWebRtcTransport = async(callback) =>{
    try{
        const webRtcTransport_options = {
            listenIps:[
                {
                    ip: '127.0.0.1',
                },
            ],
            enableUdp: true,
            enableTcp: true,
            preferUdp: true,
        };
        let transport = await router.createWebRtcTransport(webRtcTransport_options);
        console.log(`transport id: ${transport.id}`);

        transport.on('dtlsstatechange',(dtlsState) => {
            if(dtlsState === 'closed'){
                transport.close();
            }
        });

        transport.on('close',() =>{
            console.log('transport closed');
        });

        callback({
            params: {
                id:transport.id,
                iceParameters: transport.iceParameters,
                iceCandidates: transport.iceCandidates,
                dtlsParameters: transport.dtlsParameters,
            },
        });

        return transport;
    } catch(error) {
        console.log(error);
        callback({
            params:{
                error:error,
            },
        });
    }
};