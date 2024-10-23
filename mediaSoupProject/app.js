//serverside
import express from 'express';
const app = express();

import https from 'httpolyglot';
import fs from 'fs';
import path from 'path';
const __dirname = path.resolve();

import { Server } from 'socket.io';

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